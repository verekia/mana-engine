import {
  BackSide,
  type CameraHelper,
  type DirectionalLightHelper,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TransformGizmo,
  WebGPURenderer,
} from '../../nanothree/index.ts'
import { createNanothreeEntity, updateNanothreeEntity } from './nanothree-entity.ts'
import { createGridGroup, hexToColor } from './nanothree-utils.ts'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { PhysicsTransform } from '../physics-adapter.ts'
import type {
  EditorCameraState,
  RaycastHit,
  RendererAdapter,
  RendererAdapterOptions,
  TransformMode,
} from '../renderer-adapter.ts'
import type { NanothreeEntityState } from './nanothree-entity.ts'

/**
 * RendererAdapter implementation backed by nanothree — a lightweight WebGPU renderer.
 *
 * Nanothree is Y-up natively (same as Three.js), so no coordinate system
 * rotation is needed for Y-up scenes. Z-up scenes are supported via a
 * sceneRoot rotation (same pattern as Three.js adapter).
 *
 * Supported features:
 * - Box geometry (all mesh geometry types rendered as boxes)
 * - Lambert materials (color only, no textures/PBR)
 * - Directional + ambient lights with shadow mapping
 * - Camera, Object3D hierarchy
 * - Editor: transform gizmo (visual), grid, collider wireframes, light helpers
 *
 * Not supported: GLTF models, animations, particles, raycasting, point lights,
 * textures, PBR materials, skybox, post-processing, sphere/plane/capsule geometry.
 */
export class NanothreeRendererAdapter implements RendererAdapter {
  private renderer!: WebGPURenderer
  private scene!: Scene
  private camera!: PerspectiveCamera
  private gameCam: PerspectiveCamera | null = null
  private sceneRoot!: Group
  private entityObjects = new Map<string, Object3D>()
  private enableOrbitControls = false
  private isZUp = false
  private observer: ResizeObserver | null = null
  private options!: RendererAdapterOptions
  private showGizmos = false
  private gridGroup: Group | null = null
  private transformGizmo: TransformGizmo | null = null
  private currentTransformMode: TransformMode = 'translate'
  private selectedIds = new Set<string>()
  private debugWireframes = new Map<string, Object3D>()
  private lightHelpers = new Map<string, DirectionalLightHelper | CameraHelper>()
  private raycaster = new Raycaster()
  /** Invert-hull outline meshes per selected entity (BackSide, scaled up). */
  private outlineMeshes = new Map<string, Mesh>()

  // Simple orbit camera state (manual implementation since nanothree has no built-in orbit controls)
  private orbitTarget = { x: 0, y: 0, z: 0 }
  private orbitDistance = 10
  private orbitAzimuth = Math.PI / 4
  private orbitElevation = Math.PI / 6
  private orbitEnabled = true
  private canvas!: HTMLCanvasElement
  private isDragging = false
  private lastMouseX = 0
  private lastMouseY = 0
  private isRightDragging = false
  private boundOnMouseDown: ((e: MouseEvent) => void) | null = null
  private boundOnMouseMove: ((e: MouseEvent) => void) | null = null
  private boundOnMouseUp: ((e: MouseEvent) => void) | null = null
  private boundOnWheel: ((e: WheelEvent) => void) | null = null
  private boundOnContextMenu: ((e: Event) => void) | null = null

  async init(canvas: HTMLCanvasElement, options: RendererAdapterOptions): Promise<void> {
    this.options = options
    this.enableOrbitControls = options.orbitControls ?? false
    this.showGizmos = options.showGizmos ?? false
    this.canvas = canvas

    this.renderer = new WebGPURenderer({ canvas })
    await this.renderer.init()

    this.scene = new Scene()
    this.sceneRoot = new Group()
    this.scene.add(this.sceneRoot)

    // Editor camera with manual orbit controls
    if (this.enableOrbitControls) {
      this.camera = new PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)

      const camState = options.editorCamera
      if (camState) {
        this.orbitTarget.x = camState.target[0]
        this.orbitTarget.y = camState.target[1]
        this.orbitTarget.z = camState.target[2]
        // Compute orbit params from position/target
        const dx = camState.position[0] - camState.target[0]
        const dy = camState.position[1] - camState.target[1]
        const dz = camState.position[2] - camState.target[2]
        this.orbitDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)
        this.orbitElevation = Math.asin(Math.max(-1, Math.min(1, dy / this.orbitDistance)))
        this.orbitAzimuth = Math.atan2(dx, dz)
      }

      this.updateOrbitCamera()
      this.setupOrbitControls(canvas)
    }

    // Resize handling
    this.observer = new ResizeObserver(() => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w > 0 && h > 0) {
        this.renderer.setSize(w, h)
        this.camera.aspect = w / h
      }
    })
    this.observer.observe(canvas)

    const initW = canvas.clientWidth
    const initH = canvas.clientHeight
    if (initW > 0 && initH > 0) {
      this.renderer.setSize(initW, initH)
    }
  }

  dispose(): void {
    this.transformGizmo?.dispose()
    this.transformGizmo = null
    this.observer?.disconnect()
    this.teardownOrbitControls()
    for (const helper of this.lightHelpers.values()) {
      helper.dispose()
    }
    this.lightHelpers.clear()
    this.clearOutlines()
    this.entityObjects.clear()
    this.debugWireframes.clear()
    this.renderer?.dispose()
  }

  async loadScene(sceneData: SceneData): Promise<void> {
    // Background color
    if (sceneData.background) {
      const color = hexToColor(sceneData.background)
      // Set clear color via the renderer's internal colorAttachment
      const att = (this.renderer as any).colorAtt
      if (att) {
        att.clearValue = { r: color.r, g: color.g, b: color.b, a: 1 }
      }
    }

    this.isZUp = sceneData.coordinateSystem === 'z-up'

    // Nanothree is Y-up natively. When scene data is Z-up, rotate sceneRoot
    // -90° around X so scene-Z maps to world-Y (up).
    if (this.isZUp) {
      this.sceneRoot.rotation.set(-Math.PI / 2, 0, 0)
    }

    // Enable shadow map if any directional light casts shadows
    const hasShadows = sceneData.entities.some(e => e.type === 'directional-light' && e.light?.castShadow)
    this.renderer.shadowMap.enabled = hasShadows

    this.gameCam = null

    // Grid helper (editor only)
    if (this.gridGroup) {
      this.scene.remove(this.gridGroup)
      this.gridGroup = null
    }
    if (this.enableOrbitControls) {
      this.gridGroup = createGridGroup(100, 100)
      this.gridGroup.visible = this.showGizmos
      this.scene.add(this.gridGroup)
    }

    const entityState = this._getEntityState()
    const addEntities = (entities: SceneEntity[], parent: Object3D) => {
      for (const entity of entities) {
        createNanothreeEntity(entity, parent, entityState)
        if (entity.children?.length) {
          const parentObj = this.entityObjects.get(entity.id)
          if (parentObj) addEntities(entity.children, parentObj)
        }
      }
    }
    addEntities(sceneData.entities, this.sceneRoot)

    // In play mode, use the game camera
    if (!this.enableOrbitControls) {
      if (!this.gameCam) {
        this.gameCam = new PerspectiveCamera(50, 1, 0.1, 100)
        this.gameCam.position.set(0, 1, 3)
        this.gameCam.lookAt(0, 0, 0)
        this.scene.add(this.gameCam)
      }
      this.camera = this.gameCam
      const w = this.canvas.clientWidth
      const h = this.canvas.clientHeight
      if (w > 0 && h > 0) this.camera.aspect = w / h
    }

    // Set up transform gizmo for editor mode
    if (this.enableOrbitControls && !this.transformGizmo) {
      this.transformGizmo = new TransformGizmo(this.camera, this.canvas, {
        onTransformStart: this.options.onTransformStart,
        onTransformChange: this.options.onTransformChange,
        onTransformEnd: this.options.onTransformEnd,
        disableOrbitControls: () => {
          this.orbitEnabled = false
        },
        enableOrbitControls: () => {
          this.orbitEnabled = true
        },
      })
      this.transformGizmo.setMode(this.currentTransformMode)
      this.scene.add(this.transformGizmo.root)
    }
  }

  private _getEntityState(): NanothreeEntityState {
    return {
      entityObjects: this.entityObjects,
      scene: this.scene,
      enableOrbitControls: this.enableOrbitControls,
      showGizmos: this.showGizmos,
      gameCam: this.gameCam,
      setGameCam: (cam: PerspectiveCamera) => {
        this.gameCam = cam
      },
      debugWireframes: this.debugWireframes,
      lightHelpers: this.lightHelpers,
    }
  }

  async addEntity(entity: SceneEntity, parentId?: string): Promise<void> {
    const parent = parentId ? (this.entityObjects.get(parentId) ?? this.sceneRoot) : this.sceneRoot
    createNanothreeEntity(entity, parent, this._getEntityState())
    if (entity.children?.length) {
      for (const child of entity.children) {
        await this.addEntity(child, entity.id)
      }
    }
  }

  removeEntity(id: string): void {
    this.removeOutline(id)
    const obj = this.entityObjects.get(id)
    if (obj) {
      this.selectedIds.delete(id)
      obj.parent?.remove(obj)
      this.entityObjects.delete(id)
    }
    const wireframe = this.debugWireframes.get(id)
    if (wireframe) {
      wireframe.parent?.remove(wireframe)
      this.debugWireframes.delete(id)
    }
    const helper = this.lightHelpers.get(id)
    if (helper) {
      helper.dispose()
      this.lightHelpers.delete(id)
    }
  }

  updateEntity(id: string, entity: SceneEntity): void {
    updateNanothreeEntity(id, entity, this.entityObjects, this.debugWireframes, this.lightHelpers)
  }

  setEntityVisible(id: string, visible: boolean): void {
    const obj = this.entityObjects.get(id)
    if (obj) obj.visible = visible
  }

  setEntityPhysicsTransform(
    id: string,
    position: [number, number, number],
    quaternion: [number, number, number, number],
  ): void {
    const obj = this.entityObjects.get(id)
    if (!obj) return
    obj.position.set(position[0], position[1], position[2])
    // Convert quaternion to euler (simplified XYZ order)
    const [qx, qy, qz, qw] = quaternion
    const sinr = 2 * (qw * qx + qy * qz)
    const cosr = 1 - 2 * (qx * qx + qy * qy)
    const rx = Math.atan2(sinr, cosr)
    const sinp = 2 * (qw * qy - qz * qx)
    const ry = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)
    const siny = 2 * (qw * qz + qx * qy)
    const cosy = 1 - 2 * (qy * qy + qz * qz)
    const rz = Math.atan2(siny, cosy)
    obj.rotation.set(rx, ry, rz)
  }

  getEntityInitialPhysicsTransform(id: string): PhysicsTransform | null {
    const obj = this.entityObjects.get(id)
    if (!obj) return null
    // Convert euler to quaternion (XYZ order)
    const ex = obj.rotation.x,
      ey = obj.rotation.y,
      ez = obj.rotation.z
    const c1 = Math.cos(ex / 2),
      s1 = Math.sin(ex / 2)
    const c2 = Math.cos(ey / 2),
      s2 = Math.sin(ey / 2)
    const c3 = Math.cos(ez / 2),
      s3 = Math.sin(ez / 2)
    return {
      position: [obj.position.x, obj.position.y, obj.position.z],
      quaternion: [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3,
      ],
    }
  }

  getEntityPosition(id: string): [number, number, number] | null {
    const obj = this.entityObjects.get(id)
    if (!obj) return null
    return [obj.position.x, obj.position.y, obj.position.z]
  }

  setEntityPosition(id: string, x: number, y: number, z: number): void {
    const obj = this.entityObjects.get(id)
    if (obj) obj.position.set(x, y, z)
  }

  setEntityEulerRotation(id: string, x: number, y: number, z: number): void {
    const obj = this.entityObjects.get(id)
    if (obj) obj.rotation.set(x, y, z)
  }

  setEntityScale(id: string, x: number, y: number, z: number): void {
    const obj = this.entityObjects.get(id)
    if (obj) obj.scale.set(x, y, z)
  }

  getEntityNativeObject(id: string): unknown {
    return this.entityObjects.get(id) ?? null
  }

  getNativeScene(): unknown {
    return this.scene
  }

  // ── Scene-level settings ─────────────────────────────────────────────

  updateBackground(color: string): void {
    const c = hexToColor(color)
    const att = (this.renderer as any).colorAtt
    if (att) {
      att.clearValue = { r: c.r, g: c.g, b: c.b, a: 1 }
    }
  }

  // ── Animation stubs (nanothree has no animation support) ─────────────

  playAnimation(_entityId: string, _name: string, _options?: { loop?: boolean; crossFadeDuration?: number }): void {}
  stopAnimation(_entityId: string): void {}
  getAnimationNames(_entityId: string): string[] {
    return []
  }
  updateAnimations(_dt: number): void {}

  // ── Particle stubs (nanothree has no particle support) ───────────────

  updateParticles(_dt: number): void {}
  emitParticleBurst(_entityId: string, _count?: number): void {}
  resetParticles(_entityId: string): void {}

  // ── Raycasting ──────────────────────────────────────────────────────

  raycastWorld(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance = 1000,
  ): RaycastHit | null {
    if (!this.sceneRoot) return null

    // Ensure world matrices are up-to-date
    this.scene.updateMatrixWorld()

    this.raycaster.set([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z])
    const hits = this.raycaster.intersectObject(this.sceneRoot, true, maxDistance)
    if (hits.length === 0) return null

    // Walk up from hit mesh to find the entity node
    for (const hit of hits) {
      let node: Object3D | null = hit.object
      while (node) {
        for (const [id, obj] of this.entityObjects) {
          if (obj === node) {
            return {
              entityId: id,
              distance: hit.distance,
              point: { x: hit.point[0], y: hit.point[1], z: hit.point[2] },
            }
          }
        }
        node = node.parent
      }
    }
    return null
  }

  // ── Editor helpers ──────────────────────────────────────────────────

  setGizmos(enabled: boolean): void {
    this.showGizmos = enabled
    if (this.gridGroup) this.gridGroup.visible = enabled
    for (const wireframe of this.debugWireframes.values()) {
      wireframe.visible = enabled
    }
    for (const helper of this.lightHelpers.values()) {
      helper.visible = enabled
    }
  }

  setSelectedEntities(ids: string[]): void {
    const newIds = new Set(ids)

    // Remove outlines for deselected entities
    for (const id of this.selectedIds) {
      if (!newIds.has(id)) this.removeOutline(id)
    }

    // Add outlines for newly selected entities
    for (const id of newIds) {
      if (!this.selectedIds.has(id)) this.addOutline(id)
    }

    this.selectedIds = newIds
  }

  raycast(ndcX: number, ndcY: number): string | null {
    if (!this.camera || !this.sceneRoot) return null

    // Ensure world matrices and camera VP are up-to-date
    this.scene.updateMatrixWorld()
    this.camera.updateViewProjection()

    this.raycaster.setFromCamera([ndcX, ndcY], this.camera)
    const hits = this.raycaster.intersectObject(this.sceneRoot, true)
    if (hits.length === 0) return null

    // Walk up from hit mesh to find the entity node
    for (const hit of hits) {
      let node: Object3D | null = hit.object
      while (node) {
        for (const [id, obj] of this.entityObjects) {
          if (obj === node) return id
        }
        node = node.parent
      }
    }
    return null
  }

  setTransformTarget(id: string | null): void {
    if (!this.transformGizmo) return
    if (id) {
      const obj = this.entityObjects.get(id)
      if (obj) {
        this.transformGizmo.attach(obj, id)
      }
    } else {
      this.transformGizmo.detach()
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.currentTransformMode = mode
    if (this.transformGizmo) this.transformGizmo.setMode(mode)
  }

  setTransformSnap(translate: number | null, rotate: number | null, scale: number | null): void {
    if (this.transformGizmo) this.transformGizmo.setSnap(translate, rotate, scale)
  }

  setTransformSpace(_space: 'local' | 'world'): void {
    // Nanothree gizmo is visual-only
  }

  getEditorCamera(): EditorCameraState | null {
    if (!this.enableOrbitControls) return null
    // Compute camera position from orbit params
    const cx = this.orbitTarget.x + this.orbitDistance * Math.cos(this.orbitElevation) * Math.sin(this.orbitAzimuth)
    const cy = this.orbitTarget.y + this.orbitDistance * Math.sin(this.orbitElevation)
    const cz = this.orbitTarget.z + this.orbitDistance * Math.cos(this.orbitElevation) * Math.cos(this.orbitAzimuth)
    return {
      position: [cx, cy, cz],
      target: [this.orbitTarget.x, this.orbitTarget.y, this.orbitTarget.z],
    }
  }

  setEditorCamera(state: EditorCameraState): void {
    if (!this.enableOrbitControls) return
    this.orbitTarget.x = state.target[0]
    this.orbitTarget.y = state.target[1]
    this.orbitTarget.z = state.target[2]
    const dx = state.position[0] - state.target[0]
    const dy = state.position[1] - state.target[1]
    const dz = state.position[2] - state.target[2]
    this.orbitDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    this.orbitElevation = Math.asin(Math.max(-1, Math.min(1, dy / this.orbitDistance)))
    this.orbitAzimuth = Math.atan2(dx, dz)
    this.updateOrbitCamera()
  }

  frameEntity(id: string): void {
    const obj = this.entityObjects.get(id)
    if (!obj || !this.enableOrbitControls) return
    this.orbitTarget.x = obj.position.x
    this.orbitTarget.y = obj.position.y
    this.orbitTarget.z = obj.position.z
    this.orbitDistance = 5
    this.updateOrbitCamera()
  }

  updateControls(): void {
    if (this.transformGizmo) {
      this.transformGizmo.update()
    }
    this.updateOutlines()
  }

  render(): void {
    if (!this.renderer || !this.camera) return
    this.renderer.render(this.scene, this.camera)
  }

  // ── Invert hull outline ──────────────────────────────────────────────

  private static readonly OUTLINE_COLOR = 0x4488ff
  private static readonly OUTLINE_SCALE = 1.06

  private addOutline(id: string): void {
    const obj = this.entityObjects.get(id)
    if (!obj || !(obj instanceof Mesh)) return
    if (this.outlineMeshes.has(id)) return

    const outlineMat = new MeshLambertMaterial({
      color: NanothreeRendererAdapter.OUTLINE_COLOR,
      side: BackSide,
    })
    const outlineMesh = new Mesh(obj.geometry, outlineMat)
    outlineMesh.castShadow = false
    outlineMesh.receiveShadow = false

    // Sync transform from the source object
    outlineMesh.position.set(obj.position.x, obj.position.y, obj.position.z)
    outlineMesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
    const s = NanothreeRendererAdapter.OUTLINE_SCALE
    outlineMesh.scale.set(obj.scale.x * s, obj.scale.y * s, obj.scale.z * s)

    // Add as sibling (same parent as the entity object)
    const parent = obj.parent ?? this.sceneRoot
    parent.add(outlineMesh)
    this.outlineMeshes.set(id, outlineMesh)
  }

  private removeOutline(id: string): void {
    const outline = this.outlineMeshes.get(id)
    if (!outline) return
    outline.parent?.remove(outline)
    outline.material.dispose()
    this.outlineMeshes.delete(id)
  }

  private clearOutlines(): void {
    for (const [id] of this.outlineMeshes) {
      this.removeOutline(id)
    }
  }

  /** Sync outline mesh transforms to match their source entities. */
  private updateOutlines(): void {
    for (const [id, outline] of this.outlineMeshes) {
      const obj = this.entityObjects.get(id)
      if (!obj) {
        this.removeOutline(id)
        continue
      }
      outline.position.set(obj.position.x, obj.position.y, obj.position.z)
      outline.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
      const s = NanothreeRendererAdapter.OUTLINE_SCALE
      outline.scale.set(obj.scale.x * s, obj.scale.y * s, obj.scale.z * s)
    }
  }

  // ── Manual orbit controls ────────────────────────────────────────────

  private updateOrbitCamera(): void {
    const x = this.orbitTarget.x + this.orbitDistance * Math.cos(this.orbitElevation) * Math.sin(this.orbitAzimuth)
    const y = this.orbitTarget.y + this.orbitDistance * Math.sin(this.orbitElevation)
    const z = this.orbitTarget.z + this.orbitDistance * Math.cos(this.orbitElevation) * Math.cos(this.orbitAzimuth)
    this.camera.position.set(x, y, z)
    this.camera.lookAt(this.orbitTarget.x, this.orbitTarget.y, this.orbitTarget.z)
  }

  private setupOrbitControls(canvas: HTMLCanvasElement): void {
    this.boundOnMouseDown = (e: MouseEvent) => {
      if (!this.orbitEnabled) return
      if (e.button === 0) {
        this.isDragging = true
      } else if (e.button === 2) {
        this.isRightDragging = true
      }
      this.lastMouseX = e.clientX
      this.lastMouseY = e.clientY
    }

    this.boundOnMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - this.lastMouseX
      const dy = e.clientY - this.lastMouseY
      this.lastMouseX = e.clientX
      this.lastMouseY = e.clientY

      if (this.isDragging) {
        // Left drag = orbit rotate
        this.orbitAzimuth -= dx * 0.005
        this.orbitElevation += dy * 0.005
        this.orbitElevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.orbitElevation))
        this.updateOrbitCamera()
      } else if (this.isRightDragging) {
        // Right drag = pan
        const panSpeed = this.orbitDistance * 0.002
        const cosAz = Math.cos(this.orbitAzimuth)
        const sinAz = Math.sin(this.orbitAzimuth)
        // Pan in camera-relative XY
        this.orbitTarget.x -= (dx * cosAz + dy * sinAz * Math.sin(this.orbitElevation)) * panSpeed
        this.orbitTarget.y += dy * Math.cos(this.orbitElevation) * panSpeed
        this.orbitTarget.z += (dx * sinAz - dy * cosAz * Math.sin(this.orbitElevation)) * panSpeed
        this.updateOrbitCamera()
      }
    }

    this.boundOnMouseUp = (_e: MouseEvent) => {
      this.isDragging = false
      this.isRightDragging = false
    }

    this.boundOnWheel = (e: WheelEvent) => {
      e.preventDefault()
      this.orbitDistance *= 1 + e.deltaY * 0.001
      this.orbitDistance = Math.max(0.5, Math.min(200, this.orbitDistance))
      this.updateOrbitCamera()
    }

    this.boundOnContextMenu = (e: Event) => {
      e.preventDefault()
    }

    canvas.addEventListener('mousedown', this.boundOnMouseDown)
    window.addEventListener('mousemove', this.boundOnMouseMove)
    window.addEventListener('mouseup', this.boundOnMouseUp)
    canvas.addEventListener('wheel', this.boundOnWheel, { passive: false })
    canvas.addEventListener('contextmenu', this.boundOnContextMenu)
  }

  private teardownOrbitControls(): void {
    if (this.boundOnMouseDown) this.canvas.removeEventListener('mousedown', this.boundOnMouseDown)
    if (this.boundOnMouseMove) window.removeEventListener('mousemove', this.boundOnMouseMove)
    if (this.boundOnMouseUp) window.removeEventListener('mouseup', this.boundOnMouseUp)
    if (this.boundOnWheel) this.canvas.removeEventListener('wheel', this.boundOnWheel)
    if (this.boundOnContextMenu) this.canvas.removeEventListener('contextmenu', this.boundOnContextMenu)
    this.boundOnMouseDown = null
    this.boundOnMouseMove = null
    this.boundOnMouseUp = null
    this.boundOnWheel = null
    this.boundOnContextMenu = null
  }
}
