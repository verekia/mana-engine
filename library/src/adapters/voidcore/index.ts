import {
  Engine,
  Group,
  type Node,
  OrbitControls,
  PerspectiveCamera,
  Raycaster,
  Scene,
  createRaycastHit,
  mat4Invert,
  quatConjugate,
  quatCreate,
  quatFromAxisAngle,
  vec3Create,
  vec3Set,
  vec3TransformQuat,
} from 'voidcore'

import { TransformGizmo } from './transform-gizmo.ts'
import {
  createAnimationState,
  getAnimationNames,
  playAnimation,
  stopAnimation,
  updateAnimations,
} from './voidcore-animation.ts'
import {
  clearOutline,
  frameEntity as frameEntityFn,
  getEditorCamera as getEditorCameraFn,
  setEditorCamera as setEditorCameraFn,
  setGizmos as setGizmosFn,
  setOrthographicView as setOrthographicViewFn,
  setSelectedEntities as setSelectedEntitiesFn,
  setTransformMode as setTransformModeFn,
  setTransformSnap as setTransformSnapFn,
  setTransformTarget as setTransformTargetFn,
} from './voidcore-editor.ts'
import { createVoidcoreEntity, updateVoidcoreEntity } from './voidcore-entity.ts'
import { VoidcoreParticleHelper } from './voidcore-particles.ts'
import { createGridGroup, eulerToQuat, hexToRgb, orthoMatrixZO, setClearColor, yUpToZUp } from './voidcore-utils.ts'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { PhysicsTransform } from '../physics-adapter.ts'
import type {
  EditorCameraState,
  RaycastHit,
  RendererAdapter,
  RendererAdapterOptions,
  TransformMode,
} from '../renderer-adapter.ts'
import type { VoidcoreEntityState } from './voidcore-entity.ts'

/**
 * RendererAdapter implementation backed by VoidCore.
 *
 * VoidCore is a lightweight WebGPU/WebGL2 renderer with Z-up coordinates.
 * Scene data is authored in Y-up; this adapter converts via a sceneRoot rotation.
 * Geometries that have an inherent axis (capsule) are pre-rotated to match.
 */
export class VoidcoreRendererAdapter implements RendererAdapter {
  private engine!: Engine
  private scene!: Scene
  private camera!: PerspectiveCamera
  private gameCam: PerspectiveCamera | null = null
  private sceneRoot!: Group
  private entityNodes = new Map<string, Node>()
  private controls: OrbitControls | null = null
  private observer: ResizeObserver | null = null
  private enableOrbitControls = false
  private isYUp = true
  private lastFrameTime = 0
  private raycaster = new Raycaster()
  private raycastHits = [createRaycastHit()]
  private selectedIds = new Set<string>()
  private options!: RendererAdapterOptions
  private showGizmos = false
  private gridGroup: Group | null = null
  private isOrtho = false
  private transformGizmo: TransformGizmo | null = null
  private currentTransformMode: TransformMode = 'translate'
  private animState = createAnimationState()
  private particleHelper = new VoidcoreParticleHelper()
  /** Collider wireframe nodes per entity. */
  private debugWireframes = new Map<string, Node>()

  async init(canvas: HTMLCanvasElement, options: RendererAdapterOptions): Promise<void> {
    this.options = options
    this.enableOrbitControls = options.orbitControls ?? false
    this.showGizmos = options.showGizmos ?? false

    this.engine = await Engine.create(canvas, { shadows: true, bloom: false })
    this.scene = new Scene()
    this.sceneRoot = new Group()
    this.scene.add(this.sceneRoot)

    // Editor camera with orbit controls
    if (this.enableOrbitControls) {
      this.camera = new PerspectiveCamera({ fov: 50, near: 0.1, far: 1000 })
      // Default editor camera position — will be adjusted in loadScene if Y-up
      this.camera.setPosition(5, 5, 10)

      const camState = options.editorCamera
      if (camState) {
        // Editor camera state is always in scene coordinates (Y-up or Z-up).
        // Coordinate conversion happens in loadScene once we know the coordinateSystem.
        this.camera.setPosition(camState.position[0], camState.position[1], camState.position[2])
      }

      this.controls = new OrbitControls(this.camera, canvas)
      if (camState) {
        vec3Set(this.controls.target, camState.target[0], camState.target[1], camState.target[2])
      }
      this.controls.update(0)
    }

    // Resize handling
    this.observer = new ResizeObserver(() => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w > 0 && h > 0 && this.camera) {
        this.camera.aspect = w / h
      }
    })
    this.observer.observe(canvas)

    const initW = canvas.clientWidth
    const initH = canvas.clientHeight
    if (initW > 0 && initH > 0 && this.camera) {
      this.camera.aspect = initW / initH
    }

    this.lastFrameTime = performance.now() / 1000
  }

  dispose(): void {
    this.transformGizmo?.dispose()
    this.transformGizmo = null
    this.observer?.disconnect()
    this.controls?.dispose()
    this.entityNodes.clear()
    this.animState.entityClips.clear()
    this.animState.entitySkeletons.clear()
    this.animState.entityMixers.clear()
    this.debugWireframes.clear()
    this.engine?.dispose()
  }

  async loadScene(sceneData: SceneData): Promise<void> {
    // Background color
    if (sceneData.background) {
      const [r, g, b] = hexToRgb(sceneData.background)
      setClearColor(this.engine, r, g, b)
    }

    this.isYUp = sceneData.coordinateSystem !== 'z-up'

    // VoidCore is Z-up natively. When scene data is Y-up (default), rotate the
    // sceneRoot +90° around X so scene-Y maps to world-Z (up).
    // When scene data is Z-up, no rotation needed.
    if (this.isYUp) {
      const axis = vec3Set(new Float32Array(3), 1, 0, 0)
      quatFromAxisAngle(this.sceneRoot.rotation, axis, Math.PI / 2)
      this.sceneRoot.markTransformDirty()
    }

    // Convert editor camera from Y-up scene coords to VoidCore Z-up.
    // Must set azimuth/elevation/distance directly — update() recomputes position from them.
    if (this.enableOrbitControls && this.controls && this.isYUp) {
      const p = this.camera.position
      const t = this.controls.target
      const [cx, cy, cz] = yUpToZUp(p[0], p[1], p[2])
      const [tx, ty, tz] = yUpToZUp(t[0], t[1], t[2])
      vec3Set(this.controls.target, tx, ty, tz)
      const dx = cx - tx,
        dy = cy - ty,
        dz = cz - tz
      this.controls.distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      this.controls.elevation = Math.asin(Math.max(-1, Math.min(1, dz / this.controls.distance)))
      this.controls.azimuth = Math.atan2(dy, dx)
      this.controls.update(0)
    }

    this.gameCam = null

    // Grid helper (editor only) — added to scene (not sceneRoot) so it stays
    // horizontal in world space regardless of the y-up/z-up sceneRoot rotation.
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
    const addEntities = (entities: SceneEntity[], parent: Node) => {
      for (const entity of entities) {
        createVoidcoreEntity(entity, parent, entityState)
        if (entity.type === 'particles') {
          const node = this.entityNodes.get(entity.id)
          if (node) this.particleHelper.addEmitter(entity.id, entity.particles, node)
        }
        if (entity.children?.length) {
          const parentNode = this.entityNodes.get(entity.id)
          if (parentNode) addEntities(entity.children, parentNode)
        }
      }
    }
    addEntities(sceneData.entities, this.sceneRoot)

    // In play mode, use the game camera
    if (!this.enableOrbitControls) {
      if (!this.gameCam) {
        this.gameCam = new PerspectiveCamera({ fov: 50, near: 0.1, far: 100 })
        this.gameCam.setPosition(0, 1, 3)
        this.gameCam.lookAt([0, 0, 0])
        this.scene.add(this.gameCam)
      }
      this.camera = this.gameCam
      const canvas = this.engine.canvas
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h
      }
    }

    // Set up transform gizmo for editor mode
    if (this.enableOrbitControls && !this.transformGizmo) {
      const controls = this.controls
      // Compute sceneRoot world matrix for coordinate conversion
      this.scene.updateGraph()
      this.transformGizmo = new TransformGizmo(
        this.camera,
        this.engine.canvas,
        {
          onTransformStart: this.options.onTransformStart,
          onTransformChange: this.options.onTransformChange,
          onTransformEnd: this.options.onTransformEnd,
          disableOrbitControls: () => {
            if (controls) controls.enabled = false
          },
          enableOrbitControls: () => {
            if (controls) controls.enabled = true
          },
        },
        this.isYUp,
        this.sceneRoot._worldMatrix,
      )
      this.transformGizmo.setMode(this.currentTransformMode)
      // Add gizmo to sceneRoot so it shares the same coordinate frame as entities
      this.sceneRoot.add(this.transformGizmo.root)
    }
  }

  private _getEntityState(): VoidcoreEntityState {
    return {
      entityNodes: this.entityNodes,
      sceneRoot: this.sceneRoot,
      isYUp: this.isYUp,
      enableOrbitControls: this.enableOrbitControls,
      showGizmos: this.showGizmos,
      gameCam: this.gameCam,
      setGameCam: (cam: PerspectiveCamera) => {
        this.gameCam = cam
      },
      entityClips: this.animState.entityClips,
      entitySkeletons: this.animState.entitySkeletons,
      debugWireframes: this.debugWireframes,
    }
  }

  async addEntity(entity: SceneEntity, parentId?: string): Promise<void> {
    const parent = parentId ? (this.entityNodes.get(parentId) ?? this.sceneRoot) : this.sceneRoot
    createVoidcoreEntity(entity, parent, this._getEntityState())
    if (entity.type === 'particles') {
      const node = this.entityNodes.get(entity.id)
      if (node) this.particleHelper.addEmitter(entity.id, entity.particles, node)
    }
    if (entity.children?.length) {
      for (const child of entity.children) {
        await this.addEntity(child, entity.id)
      }
    }
  }

  removeEntity(id: string): void {
    const node = this.entityNodes.get(id)
    if (node) {
      clearOutline(node)
      this.selectedIds.delete(id)
      node.parent?.remove(node)
      this.entityNodes.delete(id)
    }
    this.animState.entityClips.delete(id)
    this.animState.entitySkeletons.delete(id)
    this.animState.entityMixers.delete(id)
    this.particleHelper.removeEmitter(id)
    const wireframe = this.debugWireframes.get(id)
    if (wireframe) {
      wireframe.parent?.remove(wireframe)
      this.debugWireframes.delete(id)
    }
  }

  updateEntity(id: string, entity: SceneEntity): void {
    updateVoidcoreEntity(id, entity, this.entityNodes, this.debugWireframes)
  }

  setEntityVisible(id: string, visible: boolean): void {
    const node = this.entityNodes.get(id)
    if (node) node.visible = visible
  }

  setEntityPhysicsTransform(
    id: string,
    position: [number, number, number],
    quaternion: [number, number, number, number],
  ): void {
    const node = this.entityNodes.get(id)
    if (!node) return
    node.setPosition(position[0], position[1], position[2])
    node.setRotation(quaternion[0], quaternion[1], quaternion[2], quaternion[3])
  }

  getEntityInitialPhysicsTransform(id: string): PhysicsTransform | null {
    const node = this.entityNodes.get(id)
    if (!node) return null
    const p = node.position
    const q = node.rotation
    return {
      position: [p[0], p[1], p[2]],
      quaternion: [q[0], q[1], q[2], q[3]],
    }
  }

  playAnimation(entityId: string, name: string, options?: { loop?: boolean; crossFadeDuration?: number }): void {
    playAnimation(this.animState, entityId, name, options)
  }

  stopAnimation(entityId: string): void {
    stopAnimation(this.animState, entityId)
  }

  getAnimationNames(entityId: string): string[] {
    return getAnimationNames(this.animState, entityId)
  }

  updateAnimations(dt: number): void {
    updateAnimations(this.animState, dt)
  }

  // ── Particle delegation ───────────────────────────────────────────────────

  updateParticles(dt: number): void {
    this.particleHelper.update(dt)
  }

  emitParticleBurst(entityId: string, count?: number): void {
    this.particleHelper.emitParticleBurst(entityId, count)
  }

  resetParticles(entityId: string): void {
    this.particleHelper.resetParticles(entityId)
  }

  getEntityPosition(id: string): [number, number, number] | null {
    const node = this.entityNodes.get(id)
    if (!node) return null
    return [node.position[0], node.position[1], node.position[2]]
  }

  setEntityPosition(id: string, x: number, y: number, z: number): void {
    const node = this.entityNodes.get(id)
    if (node) node.setPosition(x, y, z)
  }

  setEntityEulerRotation(id: string, x: number, y: number, z: number): void {
    const node = this.entityNodes.get(id)
    if (!node) return
    const [qx, qy, qz, qw] = eulerToQuat(x, y, z)
    node.setRotation(qx, qy, qz, qw)
  }

  setEntityScale(id: string, x: number, y: number, z: number): void {
    const node = this.entityNodes.get(id)
    if (node) node.setScale(x, y, z)
  }

  getEntityNativeObject(id: string): unknown {
    return this.entityNodes.get(id) ?? null
  }

  getNativeScene(): unknown {
    return this.scene
  }

  // ── Editor helpers ──────────────────────────────────────────────────────────

  setGizmos(enabled: boolean): void {
    this.showGizmos = enabled
    setGizmosFn(enabled, this.gridGroup, this.debugWireframes)
  }

  setSelectedEntities(ids: string[]): void {
    this.selectedIds = setSelectedEntitiesFn(ids, this.selectedIds, this.entityNodes)
  }

  raycast(ndcX: number, ndcY: number): string | null {
    if (!this.camera || !this.sceneRoot) return null

    this.raycaster.setFromCamera([ndcX, ndcY], this.camera)
    const hitCount = this.raycaster.intersectObject(this.sceneRoot, true, this.raycastHits)
    if (hitCount === 0) return null

    // Walk up from hit mesh to find the entity node registered in entityNodes
    let hitNode: Node | null = this.raycastHits[0].object
    while (hitNode) {
      for (const [id, node] of this.entityNodes) {
        if (node === hitNode) return id
      }
      hitNode = hitNode.parent
    }
    return null
  }

  raycastWorld(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance = 1000,
  ): RaycastHit | null {
    if (!this.sceneRoot) return null

    const originVec = new Float32Array([origin.x, origin.y, origin.z])
    const dirVec = new Float32Array([direction.x, direction.y, direction.z])

    // VoidCore is Z-up natively. When scene is Y-up, sceneRoot has a rotation.
    // Transform the ray from scene coordinate space into VoidCore world space.
    if (this.isYUp) {
      const q = this.sceneRoot.rotation
      vec3TransformQuat(originVec, originVec, q)
      vec3TransformQuat(dirVec, dirVec, q)
    }

    this.raycaster.set(originVec, dirVec)
    const hitCount = this.raycaster.intersectObject(this.sceneRoot, true, this.raycastHits)
    if (hitCount === 0) return null

    const hit = this.raycastHits[0]
    if (hit.distance > maxDistance) return null

    // Walk up from hit mesh to find the entity node
    let hitNode: Node | null = hit.object
    while (hitNode) {
      for (const [id, node] of this.entityNodes) {
        if (node === hitNode) {
          // Transform hit point back from VoidCore world space to scene coordinate space
          const pt = vec3Create()
          vec3Set(pt, hit.point[0], hit.point[1], hit.point[2])
          if (this.isYUp) {
            const invQ = quatConjugate(quatCreate(), this.sceneRoot.rotation)
            vec3TransformQuat(pt, pt, invQ)
          }
          return {
            entityId: id,
            distance: hit.distance,
            point: { x: pt[0], y: pt[1], z: pt[2] },
          }
        }
      }
      hitNode = hitNode.parent
    }
    return null
  }

  setTransformTarget(id: string | null): void {
    setTransformTargetFn(this.transformGizmo, id, this.entityNodes)
  }

  setTransformMode(mode: TransformMode): void {
    this.currentTransformMode = mode
    setTransformModeFn(this.transformGizmo, mode)
  }

  setTransformSnap(translate: number | null, rotate: number | null, scale: number | null): void {
    setTransformSnapFn(this.transformGizmo, translate, rotate, scale)
  }

  setTransformSpace(_space: 'local' | 'world'): void {
    // VoidCore transform gizmo always operates in scene-local space
  }

  getEditorCamera(): EditorCameraState | null {
    return getEditorCameraFn(this.controls, this.camera, this.isYUp)
  }

  setEditorCamera(state: EditorCameraState): void {
    setEditorCameraFn(this.controls, state, this.isYUp)
  }

  frameEntity(id: string): void {
    frameEntityFn(this.controls, this.camera, this.entityNodes, id, this.isYUp)
  }

  setOrthographicView(view: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' | 'perspective'): void {
    this.isOrtho = setOrthographicViewFn(this.controls, this.camera, this.isYUp, view)
  }

  updateControls(): void {
    if (!this.controls) return
    const now = performance.now() / 1000
    const dt = now - this.lastFrameTime
    this.lastFrameTime = now

    if (this.isOrtho) {
      const prevAz = this.controls.azimuth
      const prevEl = this.controls.elevation
      this.controls.update(dt)
      const dAz = Math.abs(this.controls.azimuth - prevAz)
      const dEl = Math.abs(this.controls.elevation - prevEl)
      if (dAz > 0.001 || dEl > 0.001) {
        this.isOrtho = false
        this.camera._projectionDirty = true
      }
    } else {
      this.controls.update(dt)
    }
    this.transformGizmo?.update()
  }

  render(): void {
    if (!this.engine || !this.camera) return
    // Without orbit controls (play mode), derive view matrix from world matrix.
    // OrbitControls sets _viewMatrix directly via mat4LookAt.
    if (!this.controls) {
      this.scene.updateGraph()
      mat4Invert(this.camera._viewMatrix, this.camera._worldMatrix)
    }
    if (this.isOrtho) {
      const dist = this.controls?.distance ?? 10
      const halfH = dist * Math.tan(((this.camera.fov / 2) * Math.PI) / 180)
      const halfW = halfH * this.camera.aspect
      orthoMatrixZO(this.camera._projectionMatrix, -halfW, halfW, -halfH, halfH, this.camera.near, this.camera.far)
      this.camera._projectionDirty = false
    }
    this.engine.render(this.scene, this.camera)
  }
}
