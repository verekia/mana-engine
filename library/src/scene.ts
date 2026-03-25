import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js'
import { pass, uniform } from 'three/tsl'
import {
  AmbientLight,
  CameraHelper,
  Color,
  DirectionalLight,
  DirectionalLightHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PointLight,
  PointLightHelper,
  Raycaster,
  RenderPipeline,
  Scene,
  Vector2,
  WebGPURenderer,
} from 'three/webgpu'

import {
  applyMaterialData,
  applyModelMaterialOverride,
  applyShadowProps,
  applyTransform,
  createColliderWireframe,
  createEntityObject,
  disposeEntityObject,
  snapshotTransform,
  type EntityMaps,
} from './entity.ts'
import { Input } from './input.ts'
import { setupPhysics, type PhysicsState } from './physics.ts'

import type { SceneData, SceneEntity, Transform } from './scene-data.ts'
import type { ManaScript } from './script.ts'

export type RapierModule = typeof import('@dimforge/rapier3d-compat')
export type RapierRigidBody = InstanceType<RapierModule['RigidBody']>

export interface EditorCameraState {
  position: [number, number, number]
  target: [number, number, number]
}

export type TransformMode = 'translate' | 'rotate' | 'scale'

export interface ManaScene {
  dispose(): void
  updateEntity(id: string, entity: SceneEntity): void
  addEntity(entity: SceneEntity): void
  removeEntity(id: string): void
  setGizmos(enabled: boolean): void
  setSelectedObjects(ids: string[]): void
  /** Raycast from normalized coordinates (-1 to 1). Returns the entity ID hit, or null. */
  raycast(ndcX: number, ndcY: number): string | null
  /** Get the current editor camera position and target (only available in orbit controls mode) */
  getEditorCamera(): EditorCameraState | null
  /** Restore the editor camera position and target (only available in orbit controls mode) */
  setEditorCamera(state: EditorCameraState): void
  /** Set transform gizmo mode (translate/rotate/scale). Editor mode only. */
  setTransformMode(mode: TransformMode): void
  /** Attach transform gizmo to entity, or detach if id is null. Editor mode only. */
  setTransformTarget(id: string | null): void
}

export interface CreateSceneOptions {
  scripts?: Record<string, ManaScript>
  debugPhysics?: boolean
  orbitControls?: boolean
  editorCamera?: EditorCameraState
  /** Called continuously while the transform gizmo is dragged */
  onTransformChange?: (id: string, transform: Transform) => void
  /** Called when a gizmo drag starts */
  onTransformStart?: (id: string) => void
  /** Called when a gizmo drag ends */
  onTransformEnd?: (id: string, transform: Transform) => void
}

const FIXED_DT = 1 / 60
const rendererCache = new WeakMap<HTMLCanvasElement, WebGPURenderer>()

async function getOrCreateRenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  let renderer = rendererCache.get(canvas)
  if (!renderer) {
    renderer = new WebGPURenderer({ canvas, antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    await renderer.init()
    rendererCache.set(canvas, renderer)
  }
  return renderer
}

async function setupEditorControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  scene: Scene,
  entityObjects: Map<string, Object3D>,
  debugWireframes: Map<string, LineSegments>,
  options: CreateSceneOptions,
) {
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
  const orbitControls = new OrbitControls(camera, canvas)
  const camState = options.editorCamera
  if (camState) {
    orbitControls.target.set(...camState.target)
    orbitControls.update()
  }

  // Set up TransformControls
  const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')
  const tc = new TransformControls(camera, canvas)
  scene.add(tc.getHelper())
  const transformControlsRoot = tc.getHelper()

  // Disable orbit controls while dragging gizmo
  tc.addEventListener('dragging-changed', event => {
    orbitControls.enabled = !event.value
  })

  // Track which entity the gizmo is attached to for callbacks
  let attachedEntityId: string | null = null

  tc.addEventListener('mouseDown', () => {
    if (attachedEntityId) {
      options.onTransformStart?.(attachedEntityId)
    }
  })

  tc.addEventListener('mouseUp', () => {
    if (attachedEntityId && tc.object) {
      options.onTransformEnd?.(attachedEntityId, snapshotTransform(tc.object))
    }
  })

  tc.addEventListener('objectChange', () => {
    if (attachedEntityId && tc.object) {
      // Sync debug wireframe to follow the gizmo
      const wf = debugWireframes.get(attachedEntityId)
      if (wf) {
        wf.position.copy(tc.object.position)
        wf.rotation.copy(tc.object.rotation)
        wf.scale.copy(tc.object.scale)
      }
      options.onTransformChange?.(attachedEntityId, snapshotTransform(tc.object))
    }
  })

  const transformControls = {
    attach(obj: Object3D) {
      tc.attach(obj)
      for (const [id, entityObj] of entityObjects) {
        if (entityObj === obj) {
          attachedEntityId = id
          break
        }
      }
    },
    detach() {
      tc.detach()
      attachedEntityId = null
    },
    setMode(mode: 'translate' | 'rotate' | 'scale') {
      tc.setMode(mode)
    },
    dispose() {
      tc.detach()
      tc.dispose()
      scene.remove(tc.getHelper())
    },
    get object() {
      return tc.object
    },
  }

  return { orbitControls, transformControls, transformControlsRoot }
}

function setupScripts(
  sceneData: SceneData,
  scriptDefs: Record<string, ManaScript>,
  entityObjects: Map<string, Object3D>,
  rigidBodyMap: Map<string, RapierRigidBody>,
) {
  const activeScripts: {
    script: ManaScript
    entityObj: Object3D
    rb?: RapierRigidBody
    params: Record<string, number | string | boolean>
  }[] = []

  for (const entity of sceneData.entities) {
    if (!entity.scripts) continue
    const obj = entityObjects.get(entity.id)
    if (!obj) continue
    const rb = rigidBodyMap.get(entity.id)
    for (const entry of entity.scripts) {
      const script = scriptDefs[entry.name]
      if (!script) {
        console.warn(`[mana] Script "${entry.name}" not found, skipping (entity: "${entity.name}")`)
        continue
      }
      // Merge defaults from script definition with instance params from scene JSON
      const params: Record<string, number | string | boolean> = {}
      if (script.params) {
        for (const [key, def] of Object.entries(script.params)) {
          params[key] = def.default
        }
      }
      if (entry.params) {
        Object.assign(params, entry.params)
      }
      activeScripts.push({ script, entityObj: obj, rb, params })
    }
  }

  return activeScripts
}

export async function createScene(
  canvas: HTMLCanvasElement,
  sceneData?: SceneData,
  options?: CreateSceneOptions,
): Promise<ManaScene> {
  const scriptDefs = options?.scripts
  const debugPhysics = options?.debugPhysics ?? false
  const enableOrbitControls = options?.orbitControls ?? false

  const renderer = await getOrCreateRenderer(canvas)

  const scene = new Scene()
  scene.background = new Color(sceneData?.background ?? '#111111')

  const entityObjects = new Map<string, Object3D>()
  const debugWireframes = new Map<string, LineSegments>()
  const gizmoHelpers = new Map<string, Object3D>()
  const maps: EntityMaps = { entityObjects, debugWireframes, gizmoHelpers }

  let gameCam: PerspectiveCamera | null = null

  if (sceneData) {
    for (const entity of sceneData.entities) {
      const obj = createEntityObject(entity, scene, maps, { enableOrbitControls, showGizmos: debugPhysics, renderer })
      if (entity.type === 'camera' && obj instanceof PerspectiveCamera) {
        gameCam = obj
      }
    }
  }

  if (!gameCam) {
    gameCam = new PerspectiveCamera(50, 1, 0.1, 100)
    gameCam.position.set(0, 1, 3)
    gameCam.lookAt(0, 0, 0)
  }

  // In edit mode, use a separate editor camera for the viewport.
  // In play mode, use the game camera directly.
  let camera: PerspectiveCamera
  let controls: {
    update(): void
    dispose(): void
    target: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  } | null = null

  let transformControls: {
    attach(obj: Object3D): void
    detach(): void
    setMode(mode: 'translate' | 'rotate' | 'scale'): void
    dispose(): void
    object?: Object3D
  } | null = null
  let transformControlsRoot: Object3D | null = null

  if (enableOrbitControls) {
    camera = new PerspectiveCamera(50, 1, 0.1, 1000)
    const camState = options?.editorCamera
    if (camState) {
      camera.position.set(...camState.position)
    } else {
      camera.position.set(5, 5, 10)
    }
    camera.lookAt(0, 0, 0)

    const editorControls = await setupEditorControls(
      camera,
      canvas,
      scene,
      entityObjects,
      debugWireframes,
      options ?? {},
    )
    controls = editorControls.orbitControls
    transformControls = editorControls.transformControls
    transformControlsRoot = editorControls.transformControlsRoot
  } else {
    camera = gameCam
  }

  // Reusable objects for raycasting (avoid per-click allocations)
  const raycaster = new Raycaster()
  const ndcVec = new Vector2()
  const selectionColor = new Color(0x4488ff)

  // Outline post-processing (editor mode only)
  let renderPipeline: RenderPipeline | null = null
  const selectedObjects: Object3D[] = []
  // OutlineNode type is complex, not worth typing inline
  let outlinePass: any = null

  if (enableOrbitControls) {
    const edgeThickness = uniform(1.0)
    const edgeGlow = uniform(0.0)

    outlinePass = outline(scene, camera, {
      selectedObjects,
      edgeThickness,
      edgeGlow,
    })

    const visibleEdgeColor = uniform(new Color(0x4488ff))
    const outlineColor = outlinePass.visibleEdge.mul(visibleEdgeColor).mul(uniform(3.0))

    const scenePass = pass(scene, camera)

    renderPipeline = new RenderPipeline(renderer)
    renderPipeline.outputNode = outlineColor.add(scenePass)
  }

  // Ensure renderer and camera match current canvas size
  const initW = canvas.clientWidth
  const initH = canvas.clientHeight
  if (initW > 0 && initH > 0) {
    renderer.setSize(initW, initH, false)
    camera.aspect = initW / initH
    camera.updateProjectionMatrix()
  }

  // Physics setup
  let physics: PhysicsState | null = null
  if (sceneData && !enableOrbitControls) {
    physics = await setupPhysics(sceneData, entityObjects)
  }

  // Input system (only for play mode with scripts)
  const input = scriptDefs && !enableOrbitControls ? new Input(canvas) : null

  // Script setup
  const activeScripts =
    sceneData && scriptDefs
      ? setupScripts(sceneData, scriptDefs, entityObjects, physics?.rigidBodyMap ?? new Map())
      : []

  // Create input when scripts are active (play mode). Guaranteed non-null when activeScripts > 0.
  const scriptInput = activeScripts.length > 0 ? (input ?? new Input(canvas)) : null

  for (const { script, entityObj, rb, params } of activeScripts) {
    if (!scriptInput) break
    script.init?.({ entity: entityObj, scene, dt: 0, time: 0, rigidBody: rb, input: scriptInput, params })
  }

  let animationId = 0
  let lastTime = performance.now() / 1000
  let elapsed = 0
  let fixedAccumulator = 0

  function render() {
    if (renderPipeline) {
      renderPipeline.render()
    } else {
      renderer.render(scene, camera)
    }
  }

  const observer = new ResizeObserver(() => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
  })
  observer.observe(canvas)

  function animate() {
    animationId = requestAnimationFrame(animate)

    const now = performance.now() / 1000
    const dt = Math.min(now - lastTime, 0.1)
    lastTime = now
    elapsed += dt

    scriptInput?.beginFrame()

    // Fixed update
    fixedAccumulator += dt
    while (fixedAccumulator >= FIXED_DT) {
      // Step physics when we have a physics world (regardless of scripts)
      physics?.world.step()

      if (scriptInput) {
        for (const { script, entityObj, rb, params } of activeScripts) {
          script.fixedUpdate?.({
            entity: entityObj,
            scene,
            dt: FIXED_DT,
            time: elapsed,
            rigidBody: rb,
            input: scriptInput,
            params,
          })
        }
      }
      fixedAccumulator -= FIXED_DT
    }

    // Sync physics transforms to Three.js
    if (physics) {
      for (const { rigidBody, entityObj } of physics.physicsEntities) {
        const pos = rigidBody.translation()
        const rot = rigidBody.rotation()
        entityObj.position.set(pos.x, pos.y, pos.z)
        entityObj.quaternion.set(rot.x, rot.y, rot.z, rot.w)
      }
    }

    // Update scripts
    if (scriptInput) {
      for (const { script, entityObj, rb, params } of activeScripts) {
        script.update?.({ entity: entityObj, scene, dt, time: elapsed, rigidBody: rb, input: scriptInput, params })
      }
    }

    scriptInput?.endFrame()

    controls?.update()
    render()
  }

  animate()

  return {
    dispose() {
      cancelAnimationFrame(animationId)
      observer.disconnect()
      transformControls?.dispose()
      controls?.dispose()
      renderPipeline?.dispose()
      scriptInput?.dispose()
      for (const { script } of activeScripts) {
        script.dispose?.()
      }
      physics?.world.free()
      for (const wireframe of debugWireframes.values()) {
        wireframe.geometry.dispose()
        ;(wireframe.material as LineBasicMaterial).dispose()
        scene.remove(wireframe)
      }
      for (const helper of gizmoHelpers.values()) {
        scene.remove(helper)
      }
      for (const obj of entityObjects.values()) {
        disposeEntityObject(obj)
      }
    },
    setGizmos(enabled: boolean) {
      for (const wireframe of debugWireframes.values()) {
        wireframe.visible = enabled
      }
      for (const helper of gizmoHelpers.values()) {
        helper.visible = enabled
      }
    },
    setSelectedObjects(ids: string[]) {
      selectedObjects.length = 0
      for (const id of ids) {
        const obj = entityObjects.get(id)
        if (obj) selectedObjects.push(obj)
      }
      if (outlinePass) {
        outlinePass.selectedObjects = selectedObjects
      }
      // Tint helpers blue when selected, reset when deselected
      const selectedSet = new Set(ids)
      for (const [id, helper] of gizmoHelpers) {
        const isSelected = selectedSet.has(id)
        helper.traverse(child => {
          if ('material' in child) {
            const mat = child.material as LineBasicMaterial
            if (isSelected) {
              mat.color.copy(selectionColor)
            } else if (helper instanceof CameraHelper) {
              mat.color.set(0xffffff)
            } else if (helper instanceof DirectionalLightHelper) {
              const entity = entityObjects.get(id) as DirectionalLight
              mat.color.copy(entity.color)
            } else if (helper instanceof PointLightHelper) {
              const entity = entityObjects.get(id) as PointLight
              mat.color.copy(entity.color)
            }
          }
        })
      }
    },
    raycast(ndcX: number, ndcY: number): string | null {
      raycaster.setFromCamera(ndcVec.set(ndcX, ndcY), camera)
      raycaster.params.Line.threshold = 0.15

      const targets: Object3D[] = []
      const objectToEntity = new Map<Object3D, string>()
      const tcRoot = transformControlsRoot

      for (const [id, obj] of entityObjects) {
        if (obj instanceof Mesh) {
          targets.push(obj)
          objectToEntity.set(obj, id)
        } else if (obj instanceof Group) {
          targets.push(obj)
          obj.traverse(child => objectToEntity.set(child, id))
        }
      }
      for (const [id, helper] of gizmoHelpers) {
        targets.push(helper)
        helper.traverse(child => objectToEntity.set(child, id))
      }
      for (const [id, wireframe] of debugWireframes) {
        targets.push(wireframe)
        objectToEntity.set(wireframe, id)
      }

      const hits = raycaster.intersectObjects(targets, true)
      if (hits.length === 0) return null
      for (const hit of hits) {
        if (tcRoot) {
          let isGizmo = false
          let parent = hit.object.parent
          while (parent) {
            if (parent === tcRoot) {
              isGizmo = true
              break
            }
            parent = parent.parent
          }
          if (isGizmo) continue
        }
        return objectToEntity.get(hit.object) ?? null
      }
      return null
    },
    addEntity(entity: SceneEntity) {
      createEntityObject(entity, scene, maps, { enableOrbitControls, showGizmos: debugPhysics, renderer })
    },
    removeEntity(id: string) {
      const obj = entityObjects.get(id)
      if (obj) {
        scene.remove(obj)
        disposeEntityObject(obj)
        entityObjects.delete(id)
      }
      const wireframe = debugWireframes.get(id)
      if (wireframe) {
        scene.remove(wireframe)
        wireframe.geometry.dispose()
        ;(wireframe.material as LineBasicMaterial).dispose()
        debugWireframes.delete(id)
      }
      const helper = gizmoHelpers.get(id)
      if (helper) {
        scene.remove(helper)
        gizmoHelpers.delete(id)
      }
    },
    updateEntity(id: string, entity: SceneEntity) {
      const obj = entityObjects.get(id)
      if (!obj) return
      applyTransform(obj, entity.transform)
      // Recreate collider wireframe if collider data changed
      const oldWireframe = debugWireframes.get(id)
      if (entity.collider && debugPhysics) {
        if (oldWireframe) {
          scene.remove(oldWireframe)
          oldWireframe.geometry.dispose()
          ;(oldWireframe.material as LineBasicMaterial).dispose()
        }
        const newWireframe = createColliderWireframe(entity.collider)
        newWireframe.position.copy(obj.position)
        newWireframe.rotation.copy(obj.rotation)
        scene.add(newWireframe)
        debugWireframes.set(id, newWireframe)
      } else if (oldWireframe) {
        oldWireframe.position.copy(obj.position)
        oldWireframe.rotation.copy(obj.rotation)
        oldWireframe.scale.copy(obj.scale)
      }
      if (entity.type === 'mesh' && obj instanceof Mesh) {
        applyMaterialData(obj.material as MeshStandardMaterial, entity.mesh?.material, renderer)
        applyShadowProps(obj, entity)
      }
      if (
        (entity.type === 'directional-light' || entity.type === 'ambient-light' || entity.type === 'point-light') &&
        (obj instanceof DirectionalLight || obj instanceof AmbientLight || obj instanceof PointLight)
      ) {
        if (entity.light?.color) obj.color.set(entity.light.color)
        if (entity.light?.intensity !== undefined) obj.intensity = entity.light.intensity
        if (entity.light?.castShadow !== undefined && (obj instanceof DirectionalLight || obj instanceof PointLight)) {
          obj.castShadow = entity.light.castShadow
        }
      }
      if (entity.type === 'model' && obj instanceof Group) {
        if (entity.model?.material) {
          applyModelMaterialOverride(obj, entity.model.material, renderer)
        }
        applyShadowProps(obj, entity)
      }
    },
    getEditorCamera(): EditorCameraState | null {
      if (!controls) return null
      return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      }
    },
    setEditorCamera(state: EditorCameraState) {
      if (!controls) return
      camera.position.set(...state.position)
      controls.target.set(...state.target)
      controls.update()
    },
    setTransformMode(mode: TransformMode) {
      transformControls?.setMode(mode)
    },
    setTransformTarget(id: string | null) {
      if (!transformControls) return
      if (id) {
        const obj = entityObjects.get(id)
        if (obj) {
          transformControls.attach(obj)
        }
      } else {
        transformControls.detach()
      }
    },
  }
}
