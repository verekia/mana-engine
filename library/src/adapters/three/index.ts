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
  Mesh,
  MeshLambertMaterial,
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
  createThreeEntityObject,
  disposeEntityObject,
  snapshotTransform,
  type ThreeEntityMaps,
} from './three-entity.ts'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { RendererAdapter, RendererAdapterOptions, EditorCameraState, TransformMode } from '../renderer-adapter.ts'

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

/**
 * RendererAdapter implementation backed by Three.js (WebGPU renderer).
 *
 * Supports Lambert shading, directional/point/ambient lights, GLTF models,
 * editor orbit controls, transform gizmos, and outline post-processing.
 */
export class ThreeRendererAdapter implements RendererAdapter {
  private renderer!: WebGPURenderer
  private threeScene!: Scene
  private camera!: PerspectiveCamera
  private gameCam: PerspectiveCamera | null = null
  private maps: ThreeEntityMaps = {
    entityObjects: new Map(),
    debugWireframes: new Map(),
    gizmoHelpers: new Map(),
  }
  private controls: {
    update(): void
    dispose(): void
    target: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  } | null = null
  private transformControls: {
    attach(obj: Object3D): void
    detach(): void
    setMode(mode: TransformMode): void
    dispose(): void
    object?: Object3D
  } | null = null
  private transformControlsRoot: Object3D | null = null
  private renderPipeline: RenderPipeline | null = null
  private selectedObjects: Object3D[] = []
  private outlinePass: any = null
  private raycaster = new Raycaster()
  private ndcVec = new Vector2()
  private selectionColor = new Color(0x4488ff)
  private raycastTargets: Object3D[] = []
  private raycastObjectToEntity = new Map<Object3D, string>()
  private sceneRoot!: Group
  private observer: ResizeObserver | null = null
  private options: RendererAdapterOptions = {}
  private enableOrbitControls = false
  private showGizmos = false

  async init(canvas: HTMLCanvasElement, options: RendererAdapterOptions): Promise<void> {
    this.options = options
    this.enableOrbitControls = options.orbitControls ?? false
    this.showGizmos = options.showGizmos ?? false

    this.renderer = await getOrCreateRenderer(canvas)
    this.threeScene = new Scene()
    this.threeScene.background = new Color('#111111')
    this.sceneRoot = new Group()
    this.threeScene.add(this.sceneRoot)

    // Set up camera
    if (this.enableOrbitControls) {
      this.camera = new PerspectiveCamera(50, 1, 0.1, 1000)
      const camState = options.editorCamera
      if (camState) {
        this.camera.position.set(...camState.position)
      } else {
        this.camera.position.set(5, 5, 10)
      }
      this.camera.lookAt(0, 0, 0)
      await this._setupEditorControls(canvas)
    }

    // Resize observer
    this.observer = new ResizeObserver(() => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w || canvas.height !== h) {
        this.renderer.setSize(w, h, false)
        if (this.camera) {
          this.camera.aspect = w / h
          this.camera.updateProjectionMatrix()
        }
        this.render()
      }
    })
    this.observer.observe(canvas)

    const initW = canvas.clientWidth
    const initH = canvas.clientHeight
    if (initW > 0 && initH > 0) {
      this.renderer.setSize(initW, initH, false)
      if (this.camera) {
        this.camera.aspect = initW / initH
        this.camera.updateProjectionMatrix()
      }
    }
  }

  private async _setupEditorControls(canvas: HTMLCanvasElement): Promise<void> {
    const options = this.options
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
    const orbitControls = new OrbitControls(this.camera, canvas)
    const camState = options.editorCamera
    if (camState) {
      orbitControls.target.set(...camState.target)
      orbitControls.update()
    }
    this.controls = orbitControls

    const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')
    const tc = new TransformControls(this.camera, canvas)
    this.threeScene.add(tc.getHelper())
    this.transformControlsRoot = tc.getHelper()

    tc.addEventListener('dragging-changed', event => {
      orbitControls.enabled = !event.value
    })

    let attachedEntityId: string | null = null

    tc.addEventListener('mouseDown', () => {
      if (attachedEntityId) options.onTransformStart?.(attachedEntityId)
    })

    tc.addEventListener('mouseUp', () => {
      if (attachedEntityId && tc.object) {
        options.onTransformEnd?.(attachedEntityId, snapshotTransform(tc.object))
      }
    })

    tc.addEventListener('objectChange', () => {
      if (attachedEntityId && tc.object) {
        const wf = this.maps.debugWireframes.get(attachedEntityId)
        if (wf) {
          wf.position.copy(tc.object.position)
          wf.rotation.copy(tc.object.rotation)
          wf.scale.copy(tc.object.scale)
        }
        options.onTransformChange?.(attachedEntityId, snapshotTransform(tc.object))
      }
    })

    this.transformControls = {
      attach: (obj: Object3D) => {
        tc.attach(obj)
        for (const [id, entityObj] of this.maps.entityObjects) {
          if (entityObj === obj) {
            attachedEntityId = id
            break
          }
        }
      },
      detach: () => {
        tc.detach()
        attachedEntityId = null
      },
      setMode: (mode: TransformMode) => tc.setMode(mode),
      dispose: () => {
        tc.detach()
        tc.dispose()
        this.threeScene.remove(tc.getHelper())
      },
      get object() {
        return tc.object
      },
    }

    // Outline post-processing
    const edgeThickness = uniform(1.0)
    const edgeGlow = uniform(0.0)
    this.outlinePass = outline(this.threeScene, this.camera, {
      selectedObjects: this.selectedObjects,
      edgeThickness,
      edgeGlow,
    })
    const visibleEdgeColor = uniform(new Color(0x4488ff))
    const outlineColor = this.outlinePass.visibleEdge.mul(visibleEdgeColor).mul(uniform(3.0))
    const scenePass = pass(this.threeScene, this.camera)
    this.renderPipeline = new RenderPipeline(this.renderer)
    this.renderPipeline.outputNode = outlineColor.add(scenePass)
  }

  render(): void {
    if (this.renderPipeline) {
      this.renderPipeline.render()
    } else {
      this.renderer.render(this.threeScene, this.camera)
    }
  }

  updateControls(): void {
    this.controls?.update()
  }

  dispose(): void {
    this.observer?.disconnect()
    this.transformControls?.dispose()
    this.controls?.dispose()
    this.renderPipeline?.dispose()

    for (const wireframe of this.maps.debugWireframes.values()) {
      wireframe.geometry.dispose()
      ;(wireframe.material as LineBasicMaterial).dispose()
      wireframe.parent?.remove(wireframe)
    }
    for (const helper of this.maps.gizmoHelpers.values()) {
      helper.parent?.remove(helper)
      helper.traverse(child => {
        if ('geometry' in child) (child as Mesh).geometry?.dispose()
        if ('material' in child) {
          const mat = (child as Mesh).material
          if (mat instanceof LineBasicMaterial || mat instanceof MeshLambertMaterial) mat.dispose()
        }
      })
    }
    for (const obj of this.maps.entityObjects.values()) {
      disposeEntityObject(obj)
    }
    this.maps.entityObjects.clear()
    this.maps.debugWireframes.clear()
    this.maps.gizmoHelpers.clear()
  }

  async loadScene(sceneData: SceneData): Promise<void> {
    this.threeScene.background = new Color(sceneData.background ?? '#111111')
    // Rotate sceneRoot so entities authored in the project's coordinate system render correctly.
    // Three.js is Y-up natively; a Z-up project rotates the root -90° around X so the visual
    // "up" axis matches without any per-entity coordinate conversion.
    this.sceneRoot.rotation.x = sceneData.coordinateSystem === 'z-up' ? -Math.PI / 2 : 0
    this.gameCam = null

    for (const entity of sceneData.entities) {
      const obj = createThreeEntityObject(entity, this.sceneRoot, this.maps, {
        enableOrbitControls: this.enableOrbitControls,
        showGizmos: this.showGizmos,
        renderer: this.renderer,
      })
      if (entity.type === 'camera' && obj instanceof PerspectiveCamera) {
        this.gameCam = obj
      }
    }

    // In play mode the game camera drives rendering
    if (!this.enableOrbitControls) {
      if (!this.gameCam) {
        this.gameCam = new PerspectiveCamera(50, 1, 0.1, 100)
        this.gameCam.position.set(0, 1, 3)
        this.gameCam.lookAt(0, 0, 0)
      }
      this.camera = this.gameCam
      // Sync aspect ratio to the current canvas size (init ran before the camera existed)
      const w = this.renderer.domElement.clientWidth
      const h = this.renderer.domElement.clientHeight
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
      }
    }
  }

  async addEntity(entity: SceneEntity): Promise<void> {
    createThreeEntityObject(entity, this.sceneRoot, this.maps, {
      enableOrbitControls: this.enableOrbitControls,
      showGizmos: this.showGizmos,
      renderer: this.renderer,
    })
  }

  removeEntity(id: string): void {
    if (this.transformControls?.object && this.maps.entityObjects.get(id) === this.transformControls.object) {
      this.transformControls.detach()
    }
    const obj = this.maps.entityObjects.get(id)
    if (obj) {
      obj.parent?.remove(obj)
      disposeEntityObject(obj)
      this.maps.entityObjects.delete(id)
    }
    const wireframe = this.maps.debugWireframes.get(id)
    if (wireframe) {
      wireframe.parent?.remove(wireframe)
      wireframe.geometry.dispose()
      ;(wireframe.material as LineBasicMaterial).dispose()
      this.maps.debugWireframes.delete(id)
    }
    const helper = this.maps.gizmoHelpers.get(id)
    if (helper) {
      helper.parent?.remove(helper)
      this.maps.gizmoHelpers.delete(id)
    }
  }

  updateEntity(id: string, entity: SceneEntity): void {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return
    applyTransform(obj, entity.transform)

    const oldWireframe = this.maps.debugWireframes.get(id)
    if (entity.collider && this.showGizmos) {
      if (oldWireframe) {
        oldWireframe.parent?.remove(oldWireframe)
        oldWireframe.geometry.dispose()
        ;(oldWireframe.material as LineBasicMaterial).dispose()
      }
      const newWireframe = createColliderWireframe(entity.collider)
      newWireframe.position.copy(obj.position)
      newWireframe.rotation.copy(obj.rotation)
      this.sceneRoot.add(newWireframe)
      this.maps.debugWireframes.set(id, newWireframe)
    } else if (oldWireframe) {
      oldWireframe.position.copy(obj.position)
      oldWireframe.rotation.copy(obj.rotation)
      oldWireframe.scale.copy(obj.scale)
    }

    if (entity.type === 'mesh' && obj instanceof Mesh) {
      applyMaterialData(obj.material as MeshLambertMaterial, entity.mesh?.material, this.renderer)
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
        applyModelMaterialOverride(obj, entity.model.material, this.renderer)
      }
      applyShadowProps(obj, entity)
    }
  }

  setEntityVisible(id: string, visible: boolean): void {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return
    const isLight = obj instanceof DirectionalLight || obj instanceof AmbientLight || obj instanceof PointLight
    if (isLight) {
      const helper = this.maps.gizmoHelpers.get(id)
      if (helper) helper.visible = visible
    } else {
      obj.visible = visible
    }
    if (!isLight) {
      const wireframe = this.maps.debugWireframes.get(id)
      if (wireframe) wireframe.visible = visible
      const helper = this.maps.gizmoHelpers.get(id)
      if (helper) helper.visible = visible
    }
  }

  setEntityPhysicsTransform(
    id: string,
    position: [number, number, number],
    quaternion: [number, number, number, number],
  ): void {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return
    obj.position.set(...position)
    obj.quaternion.set(...quaternion)
  }

  getEntityNativeObject(id: string): unknown {
    return this.maps.entityObjects.get(id) ?? null
  }

  getNativeScene(): unknown {
    return this.threeScene
  }

  setGizmos(enabled: boolean): void {
    for (const wireframe of this.maps.debugWireframes.values()) {
      wireframe.visible = enabled
    }
    for (const helper of this.maps.gizmoHelpers.values()) {
      helper.visible = enabled
    }
  }

  setSelectedEntities(ids: string[]): void {
    this.selectedObjects.length = 0
    for (const id of ids) {
      const obj = this.maps.entityObjects.get(id)
      if (obj) this.selectedObjects.push(obj)
    }
    if (this.outlinePass) {
      this.outlinePass.selectedObjects = this.selectedObjects
    }
    const selectedSet = new Set(ids)
    for (const [id, helper] of this.maps.gizmoHelpers) {
      const isSelected = selectedSet.has(id)
      helper.traverse(child => {
        if ('material' in child) {
          const mat = child.material as LineBasicMaterial
          if (isSelected) {
            mat.color.copy(this.selectionColor)
          } else if (helper instanceof CameraHelper) {
            mat.color.set(0xffffff)
          } else if (helper instanceof DirectionalLightHelper) {
            const entity = this.maps.entityObjects.get(id) as DirectionalLight
            mat.color.copy(entity.color)
          } else if (helper instanceof PointLightHelper) {
            const entity = this.maps.entityObjects.get(id) as PointLight
            mat.color.copy(entity.color)
          }
        }
      })
    }
  }

  raycast(ndcX: number, ndcY: number): string | null {
    this.raycaster.setFromCamera(this.ndcVec.set(ndcX, ndcY), this.camera)
    this.raycaster.params.Line.threshold = 0.15

    this.raycastTargets.length = 0
    this.raycastObjectToEntity.clear()
    const tcRoot = this.transformControlsRoot

    for (const [id, obj] of this.maps.entityObjects) {
      if (obj instanceof Mesh) {
        this.raycastTargets.push(obj)
        this.raycastObjectToEntity.set(obj, id)
      } else if (obj instanceof Group) {
        this.raycastTargets.push(obj)
        obj.traverse(child => this.raycastObjectToEntity.set(child, id))
      }
    }
    for (const [id, helper] of this.maps.gizmoHelpers) {
      this.raycastTargets.push(helper)
      helper.traverse(child => this.raycastObjectToEntity.set(child, id))
    }
    for (const [id, wireframe] of this.maps.debugWireframes) {
      this.raycastTargets.push(wireframe)
      this.raycastObjectToEntity.set(wireframe, id)
    }

    const hits = this.raycaster.intersectObjects(this.raycastTargets, true)
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
      return this.raycastObjectToEntity.get(hit.object) ?? null
    }
    return null
  }

  setTransformTarget(id: string | null): void {
    if (!this.transformControls) return
    if (id) {
      const obj = this.maps.entityObjects.get(id)
      if (obj) this.transformControls.attach(obj)
    } else {
      this.transformControls.detach()
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.transformControls?.setMode(mode)
  }

  getEditorCamera(): EditorCameraState | null {
    if (!this.controls) return null
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    }
  }

  setEditorCamera(state: EditorCameraState): void {
    if (!this.controls) return
    this.camera.position.set(...state.position)
    this.controls.target.set(...state.target)
    this.controls.update()
  }

  /** Get the initial transform of an entity for physics seeding (position + quaternion). */
  getEntityInitialPhysicsTransform(id: string): import('../physics-adapter.ts').PhysicsTransform | null {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return null
    return {
      position: [obj.position.x, obj.position.y, obj.position.z],
      quaternion: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
    }
  }
}

// Re-export physics adapter so consumers can import from one place
export { RapierPhysicsAdapter } from './three-physics.ts'
export type { RapierModule, RapierRigidBody } from './three-physics.ts'
