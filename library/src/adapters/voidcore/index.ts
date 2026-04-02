import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  DirectionalLight,
  Engine,
  Group,
  LambertMaterial,
  Mesh,
  type Node,
  OrbitControls,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  mat4Invert,
  quatFromAxisAngle,
  vec3Set,
} from 'voidcore'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { PhysicsTransform } from '../physics-adapter.ts'
import type { RendererAdapter, RendererAdapterOptions, EditorCameraState, TransformMode } from '../renderer-adapter.ts'

/** Parse a CSS hex color string into [r, g, b] in 0–1 range. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16)
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

/** Convert Euler angles (x, y, z in radians) to a quaternion [x, y, z, w]. */
function eulerToQuat(ex: number, ey: number, ez: number): [number, number, number, number] {
  const c1 = Math.cos(ex / 2),
    s1 = Math.sin(ex / 2)
  const c2 = Math.cos(ey / 2),
    s2 = Math.sin(ey / 2)
  const c3 = Math.cos(ez / 2),
    s3 = Math.sin(ez / 2)
  // XYZ order
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

/**
 * Convert a Y-up position to VoidCore's Z-up coordinate system.
 * Y-up (x, y, z) → Z-up (x, -z, y)
 */
function yUpToZUp(x: number, y: number, z: number): [number, number, number] {
  return [x, -z, y]
}

/**
 * Convert a VoidCore Z-up position back to Y-up.
 * Z-up (x, y, z) → Y-up (x, z, -y)
 */
function zUpToYUp(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]
}

function applyTransform(node: Node, transform?: SceneEntity['transform']): void {
  if (!transform) return
  if (transform.position) {
    node.setPosition(transform.position[0], transform.position[1], transform.position[2])
  }
  if (transform.rotation) {
    const [qx, qy, qz, qw] = eulerToQuat(transform.rotation[0], transform.rotation[1], transform.rotation[2])
    node.setRotation(qx, qy, qz, qw)
  }
  if (transform.scale) {
    node.setScale(transform.scale[0], transform.scale[1], transform.scale[2])
  }
}

/**
 * Set the background clear color on VoidCore's internal renderer.
 * VoidCore has no public API for this — we patch the internal clear values directly.
 */
function setClearColor(engine: Engine, r: number, g: number, b: number): void {
  const renderer = engine.renderer as any
  // WebGPU: patch the render pass clear values
  if (renderer._opaquePassCA0) {
    renderer._opaquePassCA0.clearValue = { r, g, b, a: 1 }
  }
  if (renderer._opaquePassCA1) {
    renderer._opaquePassCA1.clearValue = { r, g, b, a: 1 }
  }
  if (renderer._blitPassCA) {
    renderer._blitPassCA.clearValue = { r, g, b, a: 1 }
  }
}

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

  async init(canvas: HTMLCanvasElement, options: RendererAdapterOptions): Promise<void> {
    this.enableOrbitControls = options.orbitControls ?? false

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
    this.observer?.disconnect()
    this.controls?.dispose()
    this.entityNodes.clear()
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

    // Convert editor camera from scene coords to VoidCore Z-up coords
    if (this.enableOrbitControls && this.isYUp) {
      const p = this.camera.position
      const [cx, cy, cz] = yUpToZUp(p[0], p[1], p[2])
      this.camera.setPosition(cx, cy, cz)

      if (this.controls) {
        const t = this.controls.target
        const [tx, ty, tz] = yUpToZUp(t[0], t[1], t[2])
        vec3Set(this.controls.target, tx, ty, tz)
        this.controls.update(0)
      }
    }

    this.gameCam = null

    for (const entity of sceneData.entities) {
      this._addEntity(entity)
    }

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
  }

  private _addEntity(entity: SceneEntity): void {
    let node: Node | null = null

    switch (entity.type) {
      case 'camera': {
        const cam = new PerspectiveCamera({
          fov: entity.camera?.fov ?? 50,
          near: entity.camera?.near ?? 0.1,
          far: entity.camera?.far ?? 100,
        })
        applyTransform(cam, entity.transform)
        cam.lookAt([0, 0, 0])
        cam.name = entity.name
        this.sceneRoot.add(cam)
        this.entityNodes.set(entity.id, cam)
        if (!this.gameCam) this.gameCam = cam
        return
      }

      case 'mesh': {
        const geomType = entity.mesh?.geometry
        const geometry = this._createGeometry(geomType)
        const color = entity.mesh?.material?.color
          ? hexToRgb(entity.mesh.material.color)
          : ([0.27, 0.53, 1] as [number, number, number])
        const material = new LambertMaterial({
          color,
          receiveShadow: entity.receiveShadow ?? false,
        })
        const mesh = new Mesh(geometry, material)
        mesh.castShadow = entity.castShadow ?? false

        // VoidCore capsule extends along Z (its native up). In Y-up scene space,
        // it should extend along Y, so pre-rotate -90° around X.
        if (geomType === 'capsule' && this.isYUp) {
          const [qx, qy, qz, qw] = eulerToQuat(-Math.PI / 2, 0, 0)
          mesh.setRotation(qx, qy, qz, qw)
          const wrapper = new Group()
          wrapper.add(mesh)
          node = wrapper
        } else {
          node = mesh
        }
        break
      }

      case 'model': {
        node = new Group()
        break
      }

      case 'directional-light': {
        const color = entity.light?.color ? hexToRgb(entity.light.color) : ([1, 1, 1] as [number, number, number])
        const light = new DirectionalLight({
          color,
          intensity: entity.light?.intensity ?? 1,
          castShadow: entity.light?.castShadow ?? false,
        })
        node = light
        break
      }

      case 'ambient-light': {
        const color = entity.light?.color ? hexToRgb(entity.light.color) : ([1, 1, 1] as [number, number, number])
        const light = new AmbientLight({
          color,
          intensity: entity.light?.intensity ?? 0.3,
        })
        node = light
        break
      }

      case 'point-light': {
        node = new Group()
        break
      }

      case 'ui': {
        return
      }
    }

    if (!node) return

    node.name = entity.name
    applyTransform(node, entity.transform)
    this.sceneRoot.add(node)
    this.entityNodes.set(entity.id, node)
  }

  private _createGeometry(type?: string) {
    switch (type) {
      case 'sphere':
        return new SphereGeometry()
      case 'plane':
        return new PlaneGeometry()
      case 'capsule':
        // VoidCore height = total height. radius 0.5 + height 2 → cylinder section = 1.
        return new CapsuleGeometry({ radius: 0.5, height: 2 })
      default:
        return new BoxGeometry()
    }
  }

  async addEntity(entity: SceneEntity): Promise<void> {
    this._addEntity(entity)
  }

  removeEntity(id: string): void {
    const node = this.entityNodes.get(id)
    if (node) {
      node.parent?.remove(node)
      this.entityNodes.delete(id)
    }
  }

  updateEntity(id: string, entity: SceneEntity): void {
    const node = this.entityNodes.get(id)
    if (!node) return
    applyTransform(node, entity.transform)

    if (entity.type === 'mesh' && node instanceof Mesh && entity.mesh?.material?.color) {
      ;(node.material as LambertMaterial).color = hexToRgb(entity.mesh.material.color)
      ;(node.material as LambertMaterial).needsUpdate = true
    }

    if (node instanceof DirectionalLight || node instanceof AmbientLight) {
      if (entity.light?.color) node.color = hexToRgb(entity.light.color)
      if (entity.light?.intensity !== undefined) node.intensity = entity.light.intensity
    }
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

  getEntityNativeObject(id: string): unknown {
    return this.entityNodes.get(id) ?? null
  }

  getNativeScene(): unknown {
    return this.scene
  }

  // ── Editor helpers ──────────────────────────────────────────────────────────

  setGizmos(_enabled: boolean): void {}

  setSelectedEntities(_ids: string[]): void {}

  raycast(_ndcX: number, _ndcY: number): string | null {
    return null
  }

  setTransformTarget(_id: string | null): void {}

  setTransformMode(_mode: TransformMode): void {}

  getEditorCamera(): EditorCameraState | null {
    if (!this.controls) return null
    const p = this.camera.position
    const t = this.controls.target
    // Convert from VoidCore Z-up back to scene coordinates
    if (this.isYUp) {
      return {
        position: zUpToYUp(p[0], p[1], p[2]),
        target: zUpToYUp(t[0], t[1], t[2]),
      }
    }
    return {
      position: [p[0], p[1], p[2]],
      target: [t[0], t[1], t[2]],
    }
  }

  setEditorCamera(state: EditorCameraState): void {
    if (!this.controls) return
    if (this.isYUp) {
      const [cx, cy, cz] = yUpToZUp(state.position[0], state.position[1], state.position[2])
      const [tx, ty, tz] = yUpToZUp(state.target[0], state.target[1], state.target[2])
      this.camera.setPosition(cx, cy, cz)
      vec3Set(this.controls.target, tx, ty, tz)
    } else {
      this.camera.setPosition(state.position[0], state.position[1], state.position[2])
      vec3Set(this.controls.target, state.target[0], state.target[1], state.target[2])
    }
    this.controls.update(0)
  }

  updateControls(): void {
    if (!this.controls) return
    const now = performance.now() / 1000
    const dt = now - this.lastFrameTime
    this.lastFrameTime = now
    this.controls.update(dt)
  }

  render(): void {
    if (!this.engine || !this.camera) return
    // Without orbit controls (play mode), derive view matrix from world matrix.
    // OrbitControls sets _viewMatrix directly via mat4LookAt.
    if (!this.controls) {
      this.scene.updateGraph()
      mat4Invert(this.camera._viewMatrix, this.camera._worldMatrix)
    }
    this.engine.render(this.scene, this.camera)
  }
}
