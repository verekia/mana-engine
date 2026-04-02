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
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
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
 * RendererAdapter implementation backed by VoidCore.
 *
 * VoidCore is a lightweight WebGPU/WebGL2 renderer. This adapter implements
 * the full RendererAdapter interface: meshes, cameras, lights, transforms.
 * Features not yet available in VoidCore (GLTF models, editor gizmos,
 * raycasting, outline post-processing) are no-ops.
 */
export class VoidcoreRendererAdapter implements RendererAdapter {
  private engine!: Engine
  private scene!: Scene
  private camera!: PerspectiveCamera
  private gameCam: PerspectiveCamera | null = null
  private sceneRoot!: Group
  private entityNodes = new Map<string, Node>()
  private observer: ResizeObserver | null = null
  private enableOrbitControls = false

  async init(canvas: HTMLCanvasElement, options: RendererAdapterOptions): Promise<void> {
    this.enableOrbitControls = options.orbitControls ?? false

    this.engine = await Engine.create(canvas, { shadows: true })
    this.scene = new Scene()
    this.sceneRoot = new Group()
    this.scene.add(this.sceneRoot)

    // Editor camera
    if (this.enableOrbitControls) {
      this.camera = new PerspectiveCamera({ fov: 50, near: 0.1, far: 1000 })
      const camState = options.editorCamera
      if (camState) {
        this.camera.setPosition(camState.position[0], camState.position[1], camState.position[2])
      } else {
        this.camera.setPosition(5, 5, 10)
      }
      this.camera.lookAt([0, 0, 0])
      this.scene.add(this.camera)
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
  }

  dispose(): void {
    this.observer?.disconnect()
    this.entityNodes.clear()
    this.engine?.dispose()
  }

  async loadScene(sceneData: SceneData): Promise<void> {
    // Coordinate system: VoidCore is Y-up natively. For Z-up, rotate the root.
    if (sceneData.coordinateSystem === 'z-up') {
      const axis = vec3Set(new Float32Array(3), 1, 0, 0)
      quatFromAxisAngle(this.sceneRoot.rotation, axis, -Math.PI / 2)
      this.sceneRoot.markTransformDirty()
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
        const geometry = this._createGeometry(entity.mesh?.geometry)
        const color = entity.mesh?.material?.color
          ? hexToRgb(entity.mesh.material.color)
          : ([0.27, 0.53, 1] as [number, number, number])
        const material = new LambertMaterial({
          color,
          receiveShadow: entity.receiveShadow ?? false,
        })
        const mesh = new Mesh(geometry, material)
        mesh.castShadow = entity.castShadow ?? false
        node = mesh
        break
      }

      case 'model': {
        // GLTF loading not available in VoidCore yet — create placeholder group
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
        // VoidCore has no PointLight — skip
        node = new Group()
        break
      }

      case 'ui': {
        // UI entities have no visual representation
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
        return new CapsuleGeometry()
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

    // Update material color
    if (entity.type === 'mesh' && node instanceof Mesh && entity.mesh?.material?.color) {
      ;(node.material as LambertMaterial).color = hexToRgb(entity.mesh.material.color)
      ;(node.material as LambertMaterial).needsUpdate = true
    }

    // Update light properties
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

  getEntityNativeObject(id: string): unknown {
    return this.entityNodes.get(id) ?? null
  }

  getNativeScene(): unknown {
    return this.scene
  }

  // ── Editor stubs (no gizmo/selection support yet) ────────────────────────────

  setGizmos(_enabled: boolean): void {}

  setSelectedEntities(_ids: string[]): void {}

  raycast(_ndcX: number, _ndcY: number): string | null {
    return null
  }

  setTransformTarget(_id: string | null): void {}

  setTransformMode(_mode: TransformMode): void {}

  getEditorCamera(): EditorCameraState | null {
    return null
  }

  setEditorCamera(_state: EditorCameraState): void {}

  updateControls(): void {}

  render(): void {
    if (!this.engine || !this.camera) return
    this.scene.updateGraph()
    this.engine.render(this.scene, this.camera)
  }
}
