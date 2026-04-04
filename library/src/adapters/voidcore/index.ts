import {
  AmbientLight,
  AnimationMixer,
  BasicMaterial,
  BoxGeometry,
  CapsuleGeometry,
  DirectionalLight,
  Engine,
  Geometry,
  Group,
  LambertMaterial,
  Mesh,
  type Node,
  OrbitControls,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SphereGeometry,
  createRaycastHit,
  loadGLTF,
  mat4Invert,
  quatConjugate,
  quatCreate,
  quatFromAxisAngle,
  vec3Create,
  vec3Set,
  vec3TransformQuat,
} from 'voidcore'

import { resolveAsset } from '../../assets.ts'
import { TransformGizmo } from './transform-gizmo.ts'

import type { AnimationClip, Skeleton } from 'voidcore'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { PhysicsTransform } from '../physics-adapter.ts'
import type { RendererAdapter, RendererAdapterOptions, EditorCameraState, TransformMode } from '../renderer-adapter.ts'

/** Parse a CSS hex color string into [r, g, b] in 0–1 range. */
/** Build an orthographic projection matrix (clip-space Z from 0 to 1 for WebGPU). */
function orthoMatrixZO(
  out: Float32Array,
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Float32Array {
  const lr = 1 / (left - right)
  const bt = 1 / (bottom - top)
  const nf = 1 / (near - far)
  out[0] = -2 * lr
  out[1] = 0
  out[2] = 0
  out[3] = 0
  out[4] = 0
  out[5] = -2 * bt
  out[6] = 0
  out[7] = 0
  out[8] = 0
  out[9] = 0
  out[10] = nf
  out[11] = 0
  out[12] = (left + right) * lr
  out[13] = (top + bottom) * bt
  out[14] = near * nf
  out[15] = 1
  return out
}

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

/** Create a grid of thin quads in the XY plane (z-up). sceneRoot rotation handles y-up. */
function createGridGroup(size: number, divisions: number): Group {
  const group = new Group()
  const half = size / 2
  const step = size / divisions
  const thickness = 0.005
  const color: [number, number, number] = [0.25, 0.25, 0.25]

  // Build all grid lines as a single geometry for performance
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  let vi = 0

  for (let i = 0; i <= divisions; i++) {
    const offset = -half + i * step

    // Line along X (from -half to +half at y=offset)
    addQuad(positions, normals, indices, vi, -half, offset - thickness, half, offset + thickness)
    vi += 8
    // Line along Y (from -half to +half at x=offset)
    addQuad(positions, normals, indices, vi, offset - thickness, -half, offset + thickness, half)
    vi += 8
  }

  const geometry = new Geometry({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  })
  const material = new BasicMaterial({ color })
  const mesh = new Mesh(geometry, material)
  group.add(mesh)
  return group
}

function addQuad(
  positions: number[],
  normals: number[],
  indices: number[],
  vi: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  // Double-sided quad in XY plane at z=0
  // Front face (normal +Z)
  positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0)
  normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1)
  indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
  // Back face (normal -Z)
  positions.push(x0, y0, 0, x0, y1, 0, x1, y1, 0, x1, y0, 0)
  normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1)
  indices.push(vi + 4, vi + 5, vi + 6, vi + 4, vi + 6, vi + 7)
}

/** Create a transparent green wireframe-style mesh for a collider shape. */
function createColliderWireframe(collider: import('../../scene-data.ts').ColliderData, isYUp: boolean): Node {
  let geometry: BoxGeometry | SphereGeometry | CapsuleGeometry
  let needsCapsuleRotation = false

  switch (collider.shape) {
    case 'sphere': {
      const r = collider.radius ?? 0.5
      geometry = new SphereGeometry({ radius: r })
      break
    }
    case 'capsule': {
      const r = collider.radius ?? 0.5
      const hh = collider.halfHeight ?? 0.5
      geometry = new CapsuleGeometry({ radius: r, height: hh * 2 })
      needsCapsuleRotation = true
      break
    }
    default: {
      const he = collider.halfExtents ?? [0.5, 0.5, 0.5]
      geometry = new BoxGeometry({ width: he[0] * 2, height: he[1] * 2, depth: he[2] * 2 })
      break
    }
  }

  const material = new BasicMaterial({
    color: [0, 1, 0],
    opacity: 0.15,
  })
  material.transparent = true
  material.side = 'double'

  const mesh = new Mesh(geometry, material)
  mesh.castShadow = false

  // Capsule pre-rotation to match the entity orientation
  if (needsCapsuleRotation && isYUp) {
    const [qx, qy, qz, qw] = eulerToQuat(-Math.PI / 2, 0, 0)
    mesh.setRotation(qx, qy, qz, qw)
    const wrapper = new Group()
    wrapper.add(mesh)
    return wrapper
  }

  return mesh
}

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
  /** Animation clips stored per entity from GLTF loading. */
  private entityClips = new Map<string, AnimationClip[]>()
  /** Skeletons stored per entity from GLTF loading. */
  private entitySkeletons = new Map<string, Skeleton>()
  /** Active AnimationMixers per entity. */
  private entityMixers = new Map<string, AnimationMixer>()
  /** Collider wireframe nodes per entity. */
  private debugWireframes = new Map<string, Node>()
  /** Outline thickness for selected entities. */
  private static readonly SELECTION_OUTLINE_THICKNESS = 0.1
  private static readonly SELECTION_OUTLINE_COLOR: [number, number, number] = [0.27, 0.53, 1]

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
    this.entityClips.clear()
    this.entitySkeletons.clear()
    this.entityMixers.clear()
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

    const addEntities = (entities: SceneEntity[], parent: Node) => {
      for (const entity of entities) {
        this._addEntity(entity, parent)
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

  private _addEntity(entity: SceneEntity, parent?: Node): void {
    let node: Node | null = null

    switch (entity.type) {
      case 'camera': {
        const cam = new PerspectiveCamera({
          fov: entity.camera?.fov ?? 50,
          near: entity.camera?.near ?? 0.1,
          far: entity.camera?.far ?? 100,
        })
        applyTransform(cam, entity.transform)
        // Only apply default lookAt when no rotation was authored in the scene data
        if (!entity.transform?.rotation) cam.lookAt([0, 0, 0])
        cam.name = entity.name
        ;(parent ?? this.sceneRoot).add(cam)
        this.entityNodes.set(entity.id, cam)
        if (!this.gameCam) this.gameCam = cam
        return
      }

      case 'mesh': {
        const geomType = entity.mesh?.geometry
        if (!geomType) {
          // No mesh data — empty container (Group) that can hold children
          node = new Group()
          break
        }
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

        // VoidCore creates capsules along Z and planes in XY (facing +Z). In Y-up
        // scene space, capsules should extend along Y and planes should lie in XZ
        // (facing +Y), so pre-rotate -90° around X.
        if ((geomType === 'capsule' || geomType === 'plane') && this.isYUp) {
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
        const group = new Group()
        node = group
        const modelSrc = entity.model?.src
        if (modelSrc) {
          const entityId = entity.id
          const url = resolveAsset(modelSrc)
          loadGLTF(url).then(gltf => {
            // Check entity hasn't been removed while loading
            if (!this.entityNodes.has(entityId)) return
            group.add(gltf.scene)
            // Apply shadow props recursively
            const applyShadow = (n: Node) => {
              if (n instanceof Mesh) {
                n.castShadow = entity.castShadow ?? false
                ;(n.material as LambertMaterial).receiveShadow = entity.receiveShadow ?? false
              }
              for (const child of n.children) applyShadow(child)
            }
            applyShadow(gltf.scene)
            // Store animation data
            if (gltf.animations.length > 0) {
              this.entityClips.set(entityId, gltf.animations)
              if (gltf.skeletons.length > 0) {
                this.entitySkeletons.set(entityId, gltf.skeletons[0])
              }
            }
          })
        }
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

      case 'ui':
      case 'ui-group':
      case 'audio': {
        return
      }
    }

    if (!node) return

    node.name = entity.name
    applyTransform(node, entity.transform)
    ;(parent ?? this.sceneRoot).add(node)
    this.entityNodes.set(entity.id, node)

    // Collider wireframe (editor mode only)
    if (entity.collider && this.enableOrbitControls) {
      const wireframe = createColliderWireframe(entity.collider, this.isYUp)
      wireframe.visible = this.showGizmos
      applyTransform(wireframe, entity.transform)
      ;(parent ?? this.sceneRoot).add(wireframe)
      this.debugWireframes.set(entity.id, wireframe)
    }
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

  async addEntity(entity: SceneEntity, parentId?: string): Promise<void> {
    const parent = parentId ? (this.entityNodes.get(parentId) ?? this.sceneRoot) : this.sceneRoot
    this._addEntity(entity, parent)
    if (entity.children?.length) {
      for (const child of entity.children) {
        await this.addEntity(child, entity.id)
      }
    }
  }

  removeEntity(id: string): void {
    const node = this.entityNodes.get(id)
    if (node) {
      this._clearOutline(node)
      this.selectedIds.delete(id)
      node.parent?.remove(node)
      this.entityNodes.delete(id)
    }
    this.entityClips.delete(id)
    this.entitySkeletons.delete(id)
    this.entityMixers.delete(id)
    const wireframe = this.debugWireframes.get(id)
    if (wireframe) {
      wireframe.parent?.remove(wireframe)
      this.debugWireframes.delete(id)
    }
  }

  updateEntity(id: string, entity: SceneEntity): void {
    const node = this.entityNodes.get(id)
    if (!node) return
    applyTransform(node, entity.transform)
    const wireframe = this.debugWireframes.get(id)
    if (wireframe) applyTransform(wireframe, entity.transform)

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

  playAnimation(entityId: string, name: string, options?: { loop?: boolean; crossFadeDuration?: number }): void {
    const clips = this.entityClips.get(entityId)
    const skeleton = this.entitySkeletons.get(entityId)
    if (!clips || !skeleton) return

    const clip = clips.find(c => c.name === name)
    if (!clip) return

    let mixer = this.entityMixers.get(entityId)
    if (!mixer) {
      mixer = new AnimationMixer(skeleton)
      this.entityMixers.set(entityId, mixer)
    }

    const crossFade = options?.crossFadeDuration ?? 0.3

    // Stop current animations with crossfade
    for (const c of clips) {
      const existing = mixer.clipAction(c)
      if (existing !== mixer.clipAction(clip)) {
        existing.fadeOut(crossFade)
      }
    }

    const action = mixer.clipAction(clip)
    action.fadeIn(crossFade)
    action.play()
  }

  stopAnimation(entityId: string): void {
    const mixer = this.entityMixers.get(entityId)
    const clips = this.entityClips.get(entityId)
    if (!mixer || !clips) return
    for (const clip of clips) {
      mixer.clipAction(clip).stop()
    }
  }

  getAnimationNames(entityId: string): string[] {
    const clips = this.entityClips.get(entityId)
    return clips ? clips.map(c => c.name) : []
  }

  updateAnimations(dt: number): void {
    for (const mixer of this.entityMixers.values()) {
      mixer.update(dt)
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
    if (this.gridGroup) this.gridGroup.visible = enabled
    for (const wireframe of this.debugWireframes.values()) {
      wireframe.visible = enabled
    }
  }

  setSelectedEntities(ids: string[]): void {
    // Remove outline from previously selected entities
    for (const prevId of this.selectedIds) {
      if (!ids.includes(prevId)) {
        const node = this.entityNodes.get(prevId)
        if (node) this._clearOutline(node)
      }
    }

    this.selectedIds = new Set(ids)

    // Apply outline to newly selected entities
    for (const id of ids) {
      const node = this.entityNodes.get(id)
      if (node) this._applyOutline(node)
    }
  }

  private _applyOutline(node: Node): void {
    if (node instanceof Mesh) {
      node.outline = {
        thickness: VoidcoreRendererAdapter.SELECTION_OUTLINE_THICKNESS,
        color: VoidcoreRendererAdapter.SELECTION_OUTLINE_COLOR,
      }
    }
    // For groups (e.g. capsule wrappers, model groups), apply to child meshes
    for (const child of node.children) {
      this._applyOutline(child)
    }
  }

  private _clearOutline(node: Node): void {
    if (node instanceof Mesh) {
      node.outline = undefined
    }
    for (const child of node.children) {
      this._clearOutline(child)
    }
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
  ): import('../renderer-adapter.ts').RaycastHit | null {
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
    let hitNode: import('voidcore').Node | null = hit.object
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
    if (!this.transformGizmo) return
    if (id) {
      const node = this.entityNodes.get(id)
      if (node) this.transformGizmo.attach(node, id)
    } else {
      this.transformGizmo.detach()
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.currentTransformMode = mode
    this.transformGizmo?.setMode(mode)
  }

  setTransformSnap(translate: number | null, rotate: number | null, scale: number | null): void {
    this.transformGizmo?.setSnap(translate, rotate, scale)
  }

  setTransformSpace(_space: 'local' | 'world'): void {
    // VoidCore transform gizmo always operates in scene-local space
  }

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
    let cx: number, cy: number, cz: number, tx: number, ty: number, tz: number
    if (this.isYUp) {
      ;[cx, cy, cz] = yUpToZUp(state.position[0], state.position[1], state.position[2])
      ;[tx, ty, tz] = yUpToZUp(state.target[0], state.target[1], state.target[2])
    } else {
      ;[cx, cy, cz] = state.position
      ;[tx, ty, tz] = state.target
    }
    vec3Set(this.controls.target, tx, ty, tz)
    const dx = cx - tx,
      dy = cy - ty,
      dz = cz - tz
    this.controls.distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    this.controls.elevation = Math.asin(Math.max(-1, Math.min(1, dz / this.controls.distance)))
    this.controls.azimuth = Math.atan2(dy, dx)
    this.controls.update(0)
  }

  frameEntity(id: string): void {
    if (!this.controls) return
    const node = this.entityNodes.get(id)
    if (!node) return
    const p = node.position
    // Target the entity's position; set camera distance to at least 5 units
    const t = this.controls.target
    const dx = this.camera.position[0] - t[0]
    const dy = this.camera.position[1] - t[1]
    const dz = this.camera.position[2] - t[2]
    const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const dist = Math.max(currentDist, 5)

    // Convert entity position to VoidCore Z-up if needed
    let tx: number, ty: number, tz: number
    if (this.isYUp) {
      ;[tx, ty, tz] = yUpToZUp(p[0], p[1], p[2])
    } else {
      ;[tx, ty, tz] = [p[0], p[1], p[2]]
    }

    vec3Set(this.controls.target, tx, ty, tz)
    const camDx = this.camera.position[0] - tx
    const camDy = this.camera.position[1] - ty
    const camDz = this.camera.position[2] - tz
    this.controls.distance = dist
    this.controls.elevation = Math.asin(
      Math.max(-1, Math.min(1, camDz / (Math.sqrt(camDx * camDx + camDy * camDy + camDz * camDz) || 1))),
    )
    this.controls.azimuth = Math.atan2(camDy, camDx)
    this.controls.update(0)
  }

  setOrthographicView(view: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' | 'perspective'): void {
    if (!this.controls) return

    if (view === 'perspective') {
      this.isOrtho = false
      this.camera._projectionDirty = true
      return
    }

    const t = this.controls.target
    const dist = this.controls.distance

    // View directions in scene coordinates (y-up), converted if needed
    const sceneOffsets: Record<string, [number, number, number]> = {
      front: [0, 0, 1],
      back: [0, 0, -1],
      right: [1, 0, 0],
      left: [-1, 0, 0],
      top: [0, 1, 0],
      bottom: [0, -1, 0],
    }
    let [ox, oy, oz] = sceneOffsets[view]
    if (this.isYUp) {
      ;[ox, oy, oz] = yUpToZUp(ox, oy, oz)
    }

    const cx = t[0] + ox * dist
    const cy = t[1] + oy * dist
    const cz = t[2] + oz * dist
    const dx = cx - t[0],
      dy = cy - t[1],
      dz = cz - t[2]
    this.controls.distance = dist
    this.controls.elevation = Math.asin(Math.max(-1, Math.min(1, dz / dist)))
    this.controls.azimuth = Math.atan2(dy, dx)
    // Kill any inertia so the view snaps cleanly
    ;(this.controls as any)._velocityAz = 0
    ;(this.controls as any)._velocityEl = 0
    ;(this.controls as any)._velocityDist = 0
    ;(this.controls as any)._velocityPanX = 0
    ;(this.controls as any)._velocityPanY = 0
    this.controls.update(0)
    this.isOrtho = true
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
