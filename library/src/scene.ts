import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js'
import { pass, uniform } from 'three/tsl'
import {
  AmbientLight,
  BoxGeometry,
  CameraHelper,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DirectionalLightHelper,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  PointLightHelper,
  Raycaster,
  RenderPipeline,
  Scene,
  SphereGeometry,
  Vector2,
  WebGPURenderer,
} from 'three/webgpu'

import { Input } from './input.ts'

import type { ColliderData, SceneData, SceneEntity, Transform } from './scene-data.ts'
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

function applyTransform(obj: Object3D, transform?: Transform) {
  if (!transform) return
  if (transform.position) obj.position.set(...transform.position)
  if (transform.rotation) obj.rotation.set(...transform.rotation)
  if (transform.scale) obj.scale.set(...transform.scale)
}

function createGeometry(type?: string) {
  switch (type) {
    case 'sphere':
      return new SphereGeometry()
    case 'plane':
      return new PlaneGeometry()
    case 'cylinder':
      return new CylinderGeometry()
    case 'capsule':
      return new CapsuleGeometry()
    default:
      return new BoxGeometry()
  }
}

function createColliderWireframe(collider: ColliderData): LineSegments {
  let geometry: EdgesGeometry
  switch (collider.shape) {
    case 'sphere': {
      const r = collider.radius ?? 0.5
      geometry = new EdgesGeometry(new SphereGeometry(r, 16, 12))
      break
    }
    case 'capsule': {
      const r = collider.radius ?? 0.5
      const hh = collider.halfHeight ?? 0.5
      geometry = new EdgesGeometry(new CapsuleGeometry(r, hh * 2, 8, 16))
      break
    }
    case 'cylinder': {
      const r = collider.radius ?? 0.5
      const hh = collider.halfHeight ?? 0.5
      geometry = new EdgesGeometry(new CylinderGeometry(r, r, hh * 2, 16))
      break
    }
    default: {
      const he = collider.halfExtents ?? [0.5, 0.5, 0.5]
      geometry = new EdgesGeometry(new BoxGeometry(he[0] * 2, he[1] * 2, he[2] * 2))
      break
    }
  }
  const material = new LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 })
  return new LineSegments(geometry, material)
}

interface EntityMaps {
  entityObjects: Map<string, Object3D>
  debugWireframes: Map<string, LineSegments>
  gizmoHelpers: Map<string, Object3D>
}

/** Creates a Three.js object from a scene entity and registers it in the entity maps. */
function createEntityObject(
  entity: SceneEntity,
  threeScene: Scene,
  maps: EntityMaps,
  options: { enableOrbitControls: boolean; showGizmos: boolean },
): Object3D | null {
  let obj: Object3D | null = null

  switch (entity.type) {
    case 'camera': {
      const cam = new PerspectiveCamera(
        entity.camera?.fov ?? 50,
        1,
        entity.camera?.near ?? 0.1,
        entity.camera?.far ?? 100,
      )
      applyTransform(cam, entity.transform)
      cam.lookAt(0, 0, 0)
      if (options.enableOrbitControls) threeScene.add(cam)
      obj = cam
      // Camera helper
      const camHelper = new CameraHelper(cam)
      camHelper.visible = options.showGizmos
      threeScene.add(camHelper)
      maps.gizmoHelpers.set(entity.id, camHelper)
      break
    }
    case 'mesh': {
      const geometry = createGeometry(entity.mesh?.geometry)
      const material = new MeshStandardMaterial({
        color: entity.mesh?.material?.color ?? '#4488ff',
      })
      const mesh = new Mesh(geometry, material)
      applyTransform(mesh, entity.transform)
      threeScene.add(mesh)
      obj = mesh
      break
    }
    case 'directional-light': {
      const light = new DirectionalLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 1)
      applyTransform(light, entity.transform)
      threeScene.add(light)
      obj = light
      const dlHelper = new DirectionalLightHelper(light, 1)
      dlHelper.visible = options.showGizmos
      threeScene.add(dlHelper)
      maps.gizmoHelpers.set(entity.id, dlHelper)
      break
    }
    case 'point-light': {
      const light = new PointLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 1)
      applyTransform(light, entity.transform)
      threeScene.add(light)
      obj = light
      const plHelper = new PointLightHelper(light, 0.5)
      plHelper.visible = options.showGizmos
      threeScene.add(plHelper)
      maps.gizmoHelpers.set(entity.id, plHelper)
      break
    }
    case 'ambient-light': {
      const light = new AmbientLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 0.3)
      threeScene.add(light)
      obj = light
      break
    }
  }

  if (obj) {
    maps.entityObjects.set(entity.id, obj)
  }

  // Collider wireframe
  if (entity.collider) {
    const wireframe = createColliderWireframe(entity.collider)
    if (obj) {
      wireframe.position.copy(obj.position)
      wireframe.rotation.copy(obj.rotation)
    }
    wireframe.visible = options.showGizmos
    threeScene.add(wireframe)
    maps.debugWireframes.set(entity.id, wireframe)
  }

  return obj
}

const FIXED_DT = 1 / 60
const rendererCache = new WeakMap<HTMLCanvasElement, WebGPURenderer>()

async function getOrCreateRenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  let renderer = rendererCache.get(canvas)
  if (!renderer) {
    renderer = new WebGPURenderer({ canvas, antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    await renderer.init()
    rendererCache.set(canvas, renderer)
  }
  return renderer
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
      const obj = createEntityObject(entity, scene, maps, { enableOrbitControls, showGizmos: debugPhysics })
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
  // The game camera entity is visible in the scene with its helper.
  // In play mode, use the game camera directly.
  let camera: PerspectiveCamera
  let controls: {
    update(): void
    dispose(): void
    target: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  } | null = null

  // TransformControls for editor gizmos
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
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
    const orbitControls = new OrbitControls(camera, canvas)
    if (camState) {
      orbitControls.target.set(...camState.target)
      orbitControls.update()
    }
    controls = orbitControls

    // Set up TransformControls
    const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')
    const tc = new TransformControls(camera, canvas)
    scene.add(tc.getHelper())
    transformControlsRoot = tc.getHelper()

    // Disable orbit controls while dragging gizmo
    tc.addEventListener('dragging-changed', event => {
      orbitControls.enabled = !event.value
    })

    // Track which entity the gizmo is attached to for callbacks
    let attachedEntityId: string | null = null

    tc.addEventListener('mouseDown', () => {
      if (attachedEntityId) {
        options?.onTransformStart?.(attachedEntityId)
      }
    })

    tc.addEventListener('mouseUp', () => {
      if (attachedEntityId && tc.object) {
        const obj = tc.object
        const t: Transform = {
          position: [
            Math.round(obj.position.x * 1000) / 1000,
            Math.round(obj.position.y * 1000) / 1000,
            Math.round(obj.position.z * 1000) / 1000,
          ],
          rotation: [
            Math.round(obj.rotation.x * 1000) / 1000,
            Math.round(obj.rotation.y * 1000) / 1000,
            Math.round(obj.rotation.z * 1000) / 1000,
          ],
          scale: [
            Math.round(obj.scale.x * 1000) / 1000,
            Math.round(obj.scale.y * 1000) / 1000,
            Math.round(obj.scale.z * 1000) / 1000,
          ],
        }
        options?.onTransformEnd?.(attachedEntityId, t)
      }
    })

    tc.addEventListener('objectChange', () => {
      if (attachedEntityId && tc.object) {
        const obj = tc.object
        const t: Transform = {
          position: [
            Math.round(obj.position.x * 1000) / 1000,
            Math.round(obj.position.y * 1000) / 1000,
            Math.round(obj.position.z * 1000) / 1000,
          ],
          rotation: [
            Math.round(obj.rotation.x * 1000) / 1000,
            Math.round(obj.rotation.y * 1000) / 1000,
            Math.round(obj.rotation.z * 1000) / 1000,
          ],
          scale: [
            Math.round(obj.scale.x * 1000) / 1000,
            Math.round(obj.scale.y * 1000) / 1000,
            Math.round(obj.scale.z * 1000) / 1000,
          ],
        }
        options?.onTransformChange?.(attachedEntityId, t)
      }
    })

    transformControls = {
      attach(obj: Object3D) {
        tc.attach(obj)
        // Find the entity ID for this object
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
  } else {
    camera = gameCam
  }

  // Outline post-processing (editor mode only)
  let renderPipeline: RenderPipeline | null = null
  const selectedObjects: Object3D[] = []
  // biome-ignore lint: OutlineNode type is complex
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
  let RAPIER: RapierModule | null = null
  let world: InstanceType<RapierModule['World']> | null = null
  const physicsEntities: {
    rigidBody: RapierRigidBody
    entityObj: Object3D
  }[] = []
  const rigidBodyMap = new Map<string, RapierRigidBody>()

  const hasPhysics = sceneData?.entities.some(e => e.rigidBody) ?? false

  if (hasPhysics && sceneData && !enableOrbitControls) {
    RAPIER = await import('@dimforge/rapier3d-compat')
    await RAPIER.init()

    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    for (const entity of sceneData.entities) {
      if (!entity.rigidBody) continue
      const obj = entityObjects.get(entity.id)
      if (!obj) continue

      let bodyDesc: InstanceType<RapierModule['RigidBodyDesc']>
      switch (entity.rigidBody.type) {
        case 'fixed':
          bodyDesc = RAPIER.RigidBodyDesc.fixed()
          break
        case 'kinematic':
          bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
          break
        default:
          bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      }

      bodyDesc.setTranslation(obj.position.x, obj.position.y, obj.position.z)
      bodyDesc.setRotation({ x: obj.quaternion.x, y: obj.quaternion.y, z: obj.quaternion.z, w: obj.quaternion.w })

      const rigidBody = world.createRigidBody(bodyDesc)

      if (entity.collider) {
        let colliderDesc: InstanceType<RapierModule['ColliderDesc']>
        switch (entity.collider.shape) {
          case 'sphere':
            colliderDesc = RAPIER.ColliderDesc.ball(entity.collider.radius ?? 0.5)
            break
          case 'capsule':
            colliderDesc = RAPIER.ColliderDesc.capsule(entity.collider.halfHeight ?? 0.5, entity.collider.radius ?? 0.5)
            break
          case 'cylinder':
            colliderDesc = RAPIER.ColliderDesc.cylinder(
              entity.collider.halfHeight ?? 0.5,
              entity.collider.radius ?? 0.5,
            )
            break
          default: {
            const he = entity.collider.halfExtents ?? [0.5, 0.5, 0.5]
            colliderDesc = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2])
          }
        }
        world.createCollider(colliderDesc, rigidBody)
      }

      physicsEntities.push({ rigidBody, entityObj: obj })
      rigidBodyMap.set(entity.id, rigidBody)
    }
  }

  // Input system (only for play mode with scripts)
  const input = scriptDefs && !enableOrbitControls ? new Input(canvas) : null

  // Script setup
  const activeScripts: {
    script: ManaScript
    entityObj: Object3D
    rb?: RapierRigidBody
    params: Record<string, number | string | boolean>
  }[] = []

  if (sceneData && scriptDefs) {
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
  }

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
      world?.step()

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
    if (world) {
      for (const { rigidBody, entityObj } of physicsEntities) {
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
      world?.free()
      for (const wireframe of debugWireframes.values()) {
        wireframe.geometry.dispose()
        ;(wireframe.material as LineBasicMaterial).dispose()
        scene.remove(wireframe)
      }
      for (const helper of gizmoHelpers.values()) {
        scene.remove(helper)
      }
      for (const obj of entityObjects.values()) {
        if (obj instanceof Mesh) {
          obj.geometry.dispose()
          if (obj.material instanceof MeshStandardMaterial) {
            obj.material.dispose()
          }
        }
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
      const selectionColor = new Color(0x4488ff)
      for (const [id, helper] of gizmoHelpers) {
        const isSelected = selectedSet.has(id)
        helper.traverse(child => {
          if ('material' in child) {
            const mat = child.material as LineBasicMaterial
            if (isSelected) {
              mat.color.copy(selectionColor)
            } else if (helper instanceof CameraHelper) {
              // CameraHelper uses white/grey lines by default
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
      const raycaster = new Raycaster()
      raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera)
      // Use a tight threshold so helpers are only selected when clicking near their lines
      raycaster.params.Line.threshold = 0.15

      // Collect all clickable targets: meshes, helpers, wireframes (excluding transform gizmo)
      const targets: Object3D[] = []
      const objectToEntity = new Map<Object3D, string>()
      const tcRoot = transformControlsRoot

      for (const [id, obj] of entityObjects) {
        if (obj instanceof Mesh) {
          targets.push(obj)
          objectToEntity.set(obj, id)
        }
      }
      for (const [id, helper] of gizmoHelpers) {
        targets.push(helper)
        // Map all descendants so child line segments match
        helper.traverse(child => objectToEntity.set(child, id))
      }
      for (const [id, wireframe] of debugWireframes) {
        targets.push(wireframe)
        objectToEntity.set(wireframe, id)
      }

      const hits = raycaster.intersectObjects(targets, true)
      if (hits.length === 0) return null
      // Filter out hits on transform controls gizmo
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
      createEntityObject(entity, scene, maps, { enableOrbitControls, showGizmos: debugPhysics })
    },
    removeEntity(id: string) {
      const obj = entityObjects.get(id)
      if (obj) {
        scene.remove(obj)
        if (obj instanceof Mesh) {
          obj.geometry.dispose()
          if (obj.material instanceof MeshStandardMaterial) obj.material.dispose()
        }
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
      // Sync debug wireframe position
      const wireframe = debugWireframes.get(id)
      if (wireframe) {
        wireframe.position.copy(obj.position)
        wireframe.rotation.copy(obj.rotation)
      }
      if (entity.type === 'mesh' && obj instanceof Mesh && entity.mesh?.material?.color) {
        ;(obj.material as MeshStandardMaterial).color.set(entity.mesh.material.color)
      }
      if (
        (entity.type === 'directional-light' || entity.type === 'ambient-light' || entity.type === 'point-light') &&
        (obj instanceof DirectionalLight || obj instanceof AmbientLight || obj instanceof PointLight)
      ) {
        if (entity.light?.color) obj.color.set(entity.light.color)
        if (entity.light?.intensity !== undefined) obj.intensity = entity.light.intensity
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
