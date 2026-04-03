import {
  BasicMaterial,
  ConeGeometry,
  CylinderGeometry,
  Geometry,
  Group,
  Mesh,
  type Node,
  type PerspectiveCamera,
  Raycaster,
  SphereGeometry,
  createRaycastHit,
  mat4Invert,
  mat4Multiply,
  quatCreate,
  quatFromAxisAngle,
  quatMultiply,
  vec3Create,
  vec3Dot,
  vec3Normalize,
  vec3Set,
  vec3Sub,
  vec3TransformMat4,
} from 'voidcore'

import type { Transform } from '../../scene-data.ts'
import type { TransformMode } from '../renderer-adapter.ts'

// ── Colors ───────────────────────────────────────────────────────────────────

const RED: [number, number, number] = [0.9, 0.2, 0.2]
const GREEN: [number, number, number] = [0.2, 0.9, 0.2]
const BLUE: [number, number, number] = [0.2, 0.4, 0.9]
const YELLOW: [number, number, number] = [1, 1, 0.3]

const HOVER_RED: [number, number, number] = [1, 0.5, 0.5]
const HOVER_GREEN: [number, number, number] = [0.5, 1, 0.5]
const HOVER_BLUE: [number, number, number] = [0.5, 0.7, 1]
const HOVER_YELLOW: [number, number, number] = [1, 1, 0.7]

// Axis indices
const AXIS_X = 0
const AXIS_Y = 1
const AXIS_Z = 2
const AXIS_ALL = 3

type GizmoAxis = typeof AXIS_X | typeof AXIS_Y | typeof AXIS_Z | typeof AXIS_ALL

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Create a torus geometry on the XY plane (normal = Z). */
function createTorusGeometry(majorR: number, minorR: number, majorSegs: number, minorSegs: number): Geometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const uvs: number[] = []

  for (let j = 0; j <= majorSegs; j++) {
    const phi = (j / majorSegs) * Math.PI * 2
    const cosPhi = Math.cos(phi)
    const sinPhi = Math.sin(phi)

    for (let i = 0; i <= minorSegs; i++) {
      const theta = (i / minorSegs) * Math.PI * 2
      const cosTheta = Math.cos(theta)
      const sinTheta = Math.sin(theta)

      // Position on torus in XY plane (Z-up normal for tube cross-section)
      const x = (majorR + minorR * cosTheta) * cosPhi
      const y = (majorR + minorR * cosTheta) * sinPhi
      const z = minorR * sinTheta

      positions.push(x, y, z)

      // Normal
      const nx = cosTheta * cosPhi
      const ny = cosTheta * sinPhi
      const nz = sinTheta
      normals.push(nx, ny, nz)

      uvs.push(j / majorSegs, i / minorSegs)
    }
  }

  for (let j = 0; j < majorSegs; j++) {
    for (let i = 0; i < minorSegs; i++) {
      const a = j * (minorSegs + 1) + i
      const b = a + 1
      const c = a + (minorSegs + 1)
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const vCount = positions.length / 3
  return new Geometry({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: vCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
  })
}

// ── Quaternion helpers ───────────────────────────────────────────────────────

function quatToEuler(q: Float32Array): [number, number, number] {
  const x = q[0],
    y = q[1],
    z = q[2],
    w = q[3]
  const sinr = 2 * (w * x + y * z)
  const cosr = 1 - 2 * (x * x + y * y)
  const rx = Math.atan2(sinr, cosr)

  const sinp = 2 * (w * y - z * x)
  const ry = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)

  const siny = 2 * (w * z + x * y)
  const cosy = 1 - 2 * (y * y + z * z)
  const rz = Math.atan2(siny, cosy)

  return [rx, ry, rz]
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** Unproject NDC coords to world-space ray origin + direction. */
function ndcToWorldRay(
  origin: Float32Array,
  direction: Float32Array,
  ndcX: number,
  ndcY: number,
  camera: PerspectiveCamera,
): void {
  const invVP = new Float32Array(16)
  const vp = mat4Multiply(new Float32Array(16), camera._projectionMatrix, camera._viewMatrix)
  mat4Invert(invVP, vp)

  // Near plane
  const near = vec3Set(vec3Create(), ndcX, ndcY, -1)
  vec3TransformMat4(near, near, invVP)

  // Far plane
  const far = vec3Set(vec3Create(), ndcX, ndcY, 1)
  vec3TransformMat4(far, far, invVP)

  vec3Set(origin, near[0], near[1], near[2])
  vec3Sub(direction, far, near)
  vec3Normalize(direction, direction)
}

/** Find the closest point on an infinite line to a ray, returning the parameter t on the line axis. */
function closestPointOnAxis(
  rayOrigin: Float32Array,
  rayDir: Float32Array,
  axisOrigin: Float32Array,
  axisDir: Float32Array,
): number {
  // Solve for t that minimizes distance between ray and axis line
  const w = vec3Sub(vec3Create(), rayOrigin, axisOrigin)
  const a = vec3Dot(axisDir, axisDir) // always 1 if normalized
  const b = vec3Dot(axisDir, rayDir)
  const c = vec3Dot(rayDir, rayDir)
  const d = vec3Dot(axisDir, w)
  const e = vec3Dot(rayDir, w)
  const denom = a * c - b * b
  if (Math.abs(denom) < 1e-10) return 0
  return (b * e - c * d) / denom
}

/** Find the intersection of a ray with a plane defined by a point and normal. */
function rayPlaneIntersection(
  out: Float32Array,
  rayOrigin: Float32Array,
  rayDir: Float32Array,
  planePoint: Float32Array,
  planeNormal: Float32Array,
): boolean {
  const denom = vec3Dot(planeNormal, rayDir)
  if (Math.abs(denom) < 1e-10) return false
  const diff = vec3Sub(vec3Create(), planePoint, rayOrigin)
  const t = vec3Dot(diff, planeNormal) / denom
  if (t < 0) return false
  out[0] = rayOrigin[0] + rayDir[0] * t
  out[1] = rayOrigin[1] + rayDir[1] * t
  out[2] = rayOrigin[2] + rayDir[2] * t
  return true
}

// ── TransformGizmo ───────────────────────────────────────────────────────────

export interface TransformGizmoCallbacks {
  onTransformStart?: (id: string) => void
  onTransformChange?: (id: string, transform: Transform) => void
  onTransformEnd?: (id: string, transform: Transform) => void
  disableOrbitControls: () => void
  enableOrbitControls: () => void
}

export class TransformGizmo {
  readonly root = new Group()
  private mode: TransformMode = 'translate'

  // Sub-groups for each mode
  private translateGroup = new Group()
  private rotateGroup = new Group()
  private scaleGroup = new Group()

  // Axis meshes per mode (indexed by AXIS_X/Y/Z/ALL)
  private translateMeshes: Mesh[] = []
  private rotateMeshes: Mesh[] = []
  private scaleMeshes: Mesh[] = []

  // Materials (for hover coloring)
  private translateMaterials: BasicMaterial[] = []
  private rotateMaterials: BasicMaterial[] = []
  private scaleMaterials: BasicMaterial[] = []

  // State
  private targetNode: Node | null = null
  private targetEntityId: string | null = null
  private hoveredAxis: GizmoAxis | null = null
  private dragging = false
  /** True when the gizmo consumed a pointerdown event — prevents click-to-deselect. */
  private _consumedPointer = false
  private dragAxis: GizmoAxis | null = null
  private dragStartValue = 0
  private dragStartPosition = vec3Create()
  private dragStartRotation = quatCreate()
  private dragStartScale = vec3Create()
  private dragStartAngle = 0

  // Shared geometry
  private torusGeometry: Geometry
  private raycaster = new Raycaster()
  private raycastHits = Array.from({ length: 20 }, () => createRaycastHit())

  // References
  private camera: PerspectiveCamera
  private canvas: HTMLCanvasElement
  private callbacks: TransformGizmoCallbacks
  private isYUp: boolean
  /** Inverse of sceneRoot's world matrix — transforms world-space rays into scene-local space. */
  private sceneRootInverse: Float32Array | null = null

  constructor(
    camera: PerspectiveCamera,
    canvas: HTMLCanvasElement,
    callbacks: TransformGizmoCallbacks,
    isYUp: boolean,
    sceneRootWorldMatrix?: Float32Array,
  ) {
    this.camera = camera
    this.canvas = canvas
    this.callbacks = callbacks
    this.isYUp = isYUp

    if (sceneRootWorldMatrix) {
      this.sceneRootInverse = new Float32Array(16)
      mat4Invert(this.sceneRootInverse, sceneRootWorldMatrix)
    }

    this.torusGeometry = createTorusGeometry(1, 0.02, 48, 12)

    this._buildTranslateGizmo()
    this._buildRotateGizmo()
    this._buildScaleGizmo()

    this.root.add(this.translateGroup)
    this.root.add(this.rotateGroup)
    this.root.add(this.scaleGroup)

    this.root.visible = false
    this._updateModeVisibility()

    // Event listeners
    this._onPointerDown = this._onPointerDown.bind(this)
    this._onPointerMove = this._onPointerMove.bind(this)
    this._onPointerUp = this._onPointerUp.bind(this)
    this._onClick = this._onClick.bind(this)

    canvas.addEventListener('pointerdown', this._onPointerDown)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerup', this._onPointerUp)
    canvas.addEventListener('click', this._onClick, true)
  }

  // ── Build gizmo meshes ──────────────────────────────────────────────────

  private _buildTranslateGizmo(): void {
    const shaftGeo = new CylinderGeometry({ radiusTop: 0.02, radiusBottom: 0.02, height: 1, radialSegments: 8 })
    const tipGeo = new ConeGeometry({ radius: 0.06, height: 0.2, radialSegments: 12 })

    // Axes: X, Y, Z
    const colors = [RED, GREEN, BLUE]
    const rotations: [number, number, number, number][] = [
      this._axisAlignQuat(0), // X
      this._axisAlignQuat(1), // Y
      this._axisAlignQuat(2), // Z
    ]

    for (let i = 0; i < 3; i++) {
      const mat = new BasicMaterial({ color: colors[i] })
      const group = new Group()

      // Shaft
      const shaft = new Mesh(shaftGeo, mat)
      shaft.setPosition(0, 0, 0.5) // offset along Z (cylinder is centered)
      shaft.castShadow = false
      group.add(shaft)

      // Arrow tip
      const tip = new Mesh(tipGeo, mat)
      tip.setPosition(0, 0, 1.0)
      tip.castShadow = false
      group.add(tip)

      // Rotate group to align with axis
      const q = rotations[i]
      group.setRotation(q[0], q[1], q[2], q[3])

      this.translateGroup.add(group)
      // Store the group as the hittable mesh for raycast
      this.translateMeshes.push(group as unknown as Mesh)
      this.translateMaterials.push(mat)
    }
  }

  private _buildRotateGizmo(): void {
    const colors = [RED, GREEN, BLUE]
    const rotations: [number, number, number, number][] = [
      this._axisAlignQuat(0), // X: torus around X axis
      this._axisAlignQuat(1), // Y: torus around Y axis
      [0, 0, 0, 1], // Z: torus already in XY plane = around Z
    ]

    for (let i = 0; i < 3; i++) {
      const mat = new BasicMaterial({ color: colors[i] })
      const torus = new Mesh(this.torusGeometry, mat)
      torus.castShadow = false
      const q = rotations[i]
      torus.setRotation(q[0], q[1], q[2], q[3])

      this.rotateGroup.add(torus)
      this.rotateMeshes.push(torus)
      this.rotateMaterials.push(mat)
    }
  }

  private _buildScaleGizmo(): void {
    const shaftGeo = new CylinderGeometry({ radiusTop: 0.02, radiusBottom: 0.02, height: 1, radialSegments: 8 })
    const cubeGeo = new CylinderGeometry({ radiusTop: 0.05, radiusBottom: 0.05, height: 0.1, radialSegments: 4 })

    const colors = [RED, GREEN, BLUE, YELLOW]
    const rotations: [number, number, number, number][] = [
      this._axisAlignQuat(0),
      this._axisAlignQuat(1),
      this._axisAlignQuat(2),
    ]

    // Axis handles
    for (let i = 0; i < 3; i++) {
      const mat = new BasicMaterial({ color: colors[i] })
      const group = new Group()

      const shaft = new Mesh(shaftGeo, mat)
      shaft.setPosition(0, 0, 0.5)
      shaft.castShadow = false
      group.add(shaft)

      const cube = new Mesh(cubeGeo, mat)
      cube.setPosition(0, 0, 1.0)
      cube.castShadow = false
      group.add(cube)

      const q = rotations[i]
      group.setRotation(q[0], q[1], q[2], q[3])

      this.scaleGroup.add(group)
      this.scaleMeshes.push(group as unknown as Mesh)
      this.scaleMaterials.push(mat)
    }

    // Uniform scale center handle
    const centerMat = new BasicMaterial({ color: YELLOW })
    const center = new Mesh(new SphereGeometry({ radius: 0.08 }), centerMat)
    center.castShadow = false
    this.scaleGroup.add(center)
    this.scaleMeshes.push(center)
    this.scaleMaterials.push(centerMat)
  }

  /** Get quaternion to align VoidCore Z-up cylinder with axis i (0=X, 1=Y, 2=Z). */
  private _axisAlignQuat(axis: number): [number, number, number, number] {
    // Cylinder/cone extend along Z in VoidCore.
    // To point along X: rotate +90° around Y
    // To point along Y: rotate -90° around X
    // To point along Z: identity
    const q = quatCreate()
    const axisVec = vec3Create()
    if (axis === 0) {
      // Rotate around Y by -90°
      vec3Set(axisVec, 0, 1, 0)
      quatFromAxisAngle(q, axisVec, -Math.PI / 2)
    } else if (axis === 1) {
      // Rotate around X by +90°
      vec3Set(axisVec, 1, 0, 0)
      quatFromAxisAngle(q, axisVec, Math.PI / 2)
    } else {
      // Identity - already along Z
      q[3] = 1
    }
    return [q[0], q[1], q[2], q[3]]
  }

  // ── Public API ──────────────────────────────────────────────────────────

  attach(node: Node, entityId: string): void {
    this.targetNode = node
    this.targetEntityId = entityId
    this.root.visible = true
    this._syncPosition()
  }

  detach(): void {
    this.targetNode = null
    this.targetEntityId = null
    this.root.visible = false
    this.dragging = false
    this.dragAxis = null
    this._clearHover()
  }

  setMode(mode: TransformMode): void {
    this.mode = mode
    this._updateModeVisibility()
  }

  isDragging(): boolean {
    return this.dragging
  }

  /** Call each frame to keep gizmo positioned on target and scaled for screen-constant size. */
  update(): void {
    if (!this.targetNode || !this.root.visible) return
    this._syncPosition()
    this._updateScale()
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    this.canvas.removeEventListener('pointermove', this._onPointerMove)
    this.canvas.removeEventListener('pointerup', this._onPointerUp)
    this.canvas.removeEventListener('click', this._onClick, true)
    this.root.parent?.remove(this.root)
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private _updateModeVisibility(): void {
    this.translateGroup.visible = this.mode === 'translate'
    this.rotateGroup.visible = this.mode === 'rotate'
    this.scaleGroup.visible = this.mode === 'scale'
  }

  private _syncPosition(): void {
    if (!this.targetNode) return
    const p = this.targetNode.position
    this.root.setPosition(p[0], p[1], p[2])
  }

  /** Scale gizmo so it appears the same size regardless of distance from camera. */
  private _updateScale(): void {
    const p = this.root.position
    // Camera position in scene-local space
    const cp = vec3Create()
    vec3Set(cp, this.camera.position[0], this.camera.position[1], this.camera.position[2])
    if (this.sceneRootInverse) {
      vec3TransformMat4(cp, cp, this.sceneRootInverse)
    }
    const dx = p[0] - cp[0],
      dy = p[1] - cp[1],
      dz = p[2] - cp[2]
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const s = dist * 0.15
    this.root.setScale(s, s, s)
  }

  private _getNDC(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    return [x, y]
  }

  /** Get the mouse ray in scene-local (sceneRoot) coordinate space. */
  private _getLocalRay(ndcX: number, ndcY: number, origin: Float32Array, direction: Float32Array): void {
    ndcToWorldRay(origin, direction, ndcX, ndcY, this.camera)
    if (this.sceneRootInverse) {
      // Transform two points on the world-space ray into local space
      const farPoint = vec3Create()
      vec3Set(farPoint, origin[0] + direction[0] * 100, origin[1] + direction[1] * 100, origin[2] + direction[2] * 100)
      vec3TransformMat4(origin, origin, this.sceneRootInverse)
      vec3TransformMat4(farPoint, farPoint, this.sceneRootInverse)
      vec3Sub(direction, farPoint, origin)
      vec3Normalize(direction, direction)
    }
  }

  /** Get the axis direction in world space for the given axis index. */
  private _getAxisDirection(axis: GizmoAxis): Float32Array {
    const dir = vec3Create()
    if (axis === AXIS_X) vec3Set(dir, 1, 0, 0)
    else if (axis === AXIS_Y) vec3Set(dir, 0, 1, 0)
    else if (axis === AXIS_Z) vec3Set(dir, 0, 0, 1)
    return dir
  }

  // ── Raycast against gizmo meshes ────────────────────────────────────────

  private _hitTestGizmo(ndcX: number, ndcY: number): GizmoAxis | null {
    if (!this.root.visible) return null

    this.raycaster.setFromCamera([ndcX, ndcY], this.camera)

    const meshes =
      this.mode === 'translate' ? this.translateMeshes : this.mode === 'rotate' ? this.rotateMeshes : this.scaleMeshes

    let closestDist = Infinity
    let closestAxis: GizmoAxis | null = null

    for (let i = 0; i < meshes.length; i++) {
      const target = meshes[i]
      const count = this.raycaster.intersectObject(target, true, this.raycastHits)
      if (count > 0) {
        const hit = this.raycastHits[0]
        if (hit.distance < closestDist) {
          closestDist = hit.distance
          closestAxis = i as GizmoAxis
        }
      }
    }

    return closestAxis
  }

  // ── Hover ───────────────────────────────────────────────────────────────

  private _setHover(axis: GizmoAxis | null): void {
    if (axis === this.hoveredAxis) return
    this._clearHover()
    this.hoveredAxis = axis
    if (axis === null) return

    const hoverColors = [HOVER_RED, HOVER_GREEN, HOVER_BLUE, HOVER_YELLOW]
    const mats =
      this.mode === 'translate'
        ? this.translateMaterials
        : this.mode === 'rotate'
          ? this.rotateMaterials
          : this.scaleMaterials
    if (axis < mats.length) {
      mats[axis].color = hoverColors[axis]
      mats[axis].needsUpdate = true
    }
  }

  private _clearHover(): void {
    if (this.hoveredAxis === null) return
    const defaultColors = [RED, GREEN, BLUE, YELLOW]
    const mats =
      this.mode === 'translate'
        ? this.translateMaterials
        : this.mode === 'rotate'
          ? this.rotateMaterials
          : this.scaleMaterials
    const axis = this.hoveredAxis
    if (axis < mats.length) {
      mats[axis].color = defaultColors[axis]
      mats[axis].needsUpdate = true
    }
    this.hoveredAxis = null
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────

  private _snapshotTransform(): Transform {
    if (!this.targetNode) return {}
    const p = this.targetNode.position
    const q = this.targetNode.rotation
    const s = this.targetNode.scale
    const euler = quatToEuler(q)
    return {
      position: [round3(p[0]), round3(p[1]), round3(p[2])],
      rotation: [round3(euler[0]), round3(euler[1]), round3(euler[2])],
      scale: [round3(s[0]), round3(s[1]), round3(s[2])],
    }
  }

  // ── Pointer events ──────────────────────────────────────────────────────

  private _onPointerDown(e: PointerEvent): void {
    if (!this.targetNode || e.button !== 0) return

    const [ndcX, ndcY] = this._getNDC(e)
    const axis = this._hitTestGizmo(ndcX, ndcY)
    if (axis === null) return

    e.preventDefault()
    e.stopPropagation()

    this._consumedPointer = true
    this.dragging = true
    this.dragAxis = axis
    this.callbacks.disableOrbitControls()

    // Store start state
    const p = this.targetNode.position
    const q = this.targetNode.rotation
    const s = this.targetNode.scale
    vec3Set(this.dragStartPosition, p[0], p[1], p[2])
    this.dragStartRotation[0] = q[0]
    this.dragStartRotation[1] = q[1]
    this.dragStartRotation[2] = q[2]
    this.dragStartRotation[3] = q[3]
    vec3Set(this.dragStartScale, s[0], s[1], s[2])

    const rayOrigin = vec3Create()
    const rayDir = vec3Create()
    this._getLocalRay(ndcX, ndcY, rayOrigin, rayDir)

    if (this.mode === 'translate') {
      const axisDir = this._getAxisDirection(axis)
      this.dragStartValue = closestPointOnAxis(rayOrigin, rayDir, this.dragStartPosition, axisDir)
    } else if (this.mode === 'scale') {
      if (axis === AXIS_ALL) {
        this.dragStartValue = ndcY
      } else {
        const axisDir = this._getAxisDirection(axis)
        this.dragStartValue = closestPointOnAxis(rayOrigin, rayDir, this.dragStartPosition, axisDir)
      }
    } else if (this.mode === 'rotate') {
      const planeNormal = this._getAxisDirection(axis)
      const hitPoint = vec3Create()
      if (rayPlaneIntersection(hitPoint, rayOrigin, rayDir, this.dragStartPosition, planeNormal)) {
        this.dragStartAngle = this._planeAngle(hitPoint, this.dragStartPosition, axis)
      }
    }

    if (this.targetEntityId) {
      this.callbacks.onTransformStart?.(this.targetEntityId)
    }
  }

  private _onPointerMove(e: PointerEvent): void {
    const [ndcX, ndcY] = this._getNDC(e)

    if (!this.dragging) {
      // Hover
      const axis = this._hitTestGizmo(ndcX, ndcY)
      this._setHover(axis)
      this.canvas.style.cursor = axis !== null ? 'grab' : ''
      return
    }

    if (!this.targetNode || this.dragAxis === null) return

    const rayOrigin = vec3Create()
    const rayDir = vec3Create()
    this._getLocalRay(ndcX, ndcY, rayOrigin, rayDir)

    if (this.mode === 'translate') {
      const axisDir = this._getAxisDirection(this.dragAxis)
      const t = closestPointOnAxis(rayOrigin, rayDir, this.dragStartPosition, axisDir)
      const delta = t - this.dragStartValue

      const newPos = vec3Create()
      vec3Set(newPos, this.dragStartPosition[0], this.dragStartPosition[1], this.dragStartPosition[2])
      newPos[this.dragAxis] += delta

      this.targetNode.setPosition(newPos[0], newPos[1], newPos[2])
      this._syncPosition()
    } else if (this.mode === 'scale') {
      if (this.dragAxis === AXIS_ALL) {
        const delta = ndcY - this.dragStartValue
        const factor = 1 + delta * 2
        this.targetNode.setScale(
          this.dragStartScale[0] * factor,
          this.dragStartScale[1] * factor,
          this.dragStartScale[2] * factor,
        )
      } else {
        const axisDir = this._getAxisDirection(this.dragAxis)
        const t = closestPointOnAxis(rayOrigin, rayDir, this.dragStartPosition, axisDir)
        const delta = t - this.dragStartValue
        const factor = 1 + delta

        const newScale = vec3Create()
        vec3Set(newScale, this.dragStartScale[0], this.dragStartScale[1], this.dragStartScale[2])
        newScale[this.dragAxis] = this.dragStartScale[this.dragAxis] * Math.max(0.01, factor)

        this.targetNode.setScale(newScale[0], newScale[1], newScale[2])
      }
    } else if (this.mode === 'rotate' && this.dragAxis !== null) {
      const planeNormal = this._getAxisDirection(this.dragAxis)
      const hitPoint = vec3Create()
      if (rayPlaneIntersection(hitPoint, rayOrigin, rayDir, this.dragStartPosition, planeNormal)) {
        const currentAngle = this._planeAngle(hitPoint, this.dragStartPosition, this.dragAxis)
        const deltaAngle = currentAngle - this.dragStartAngle

        // Apply incremental rotation to the start rotation
        const axisVec = this._getAxisDirection(this.dragAxis)
        const deltaQuat = quatCreate()
        quatFromAxisAngle(deltaQuat, axisVec, deltaAngle)

        const newQuat = quatCreate()
        quatMultiply(newQuat, deltaQuat, this.dragStartRotation)

        this.targetNode.setRotation(newQuat[0], newQuat[1], newQuat[2], newQuat[3])
      }
    }

    if (this.targetEntityId) {
      this.callbacks.onTransformChange?.(this.targetEntityId, this._snapshotTransform())
    }
  }

  private _onPointerUp(_e: PointerEvent): void {
    if (!this.dragging) return

    this.dragging = false
    this.canvas.style.cursor = ''
    this.callbacks.enableOrbitControls()

    if (this.targetEntityId) {
      this.callbacks.onTransformEnd?.(this.targetEntityId, this._snapshotTransform())
    }

    this.dragAxis = null
  }

  /** Capture click events during/after gizmo interaction to prevent click-through. */
  private _onClick(e: MouseEvent): void {
    if (this._consumedPointer) {
      e.stopPropagation()
      e.preventDefault()
      this._consumedPointer = false
    }
  }

  /** Compute angle of a point projected onto the plane perpendicular to the given axis, relative to the center. */
  private _planeAngle(point: Float32Array, center: Float32Array, axis: GizmoAxis): number {
    const dx = point[0] - center[0]
    const dy = point[1] - center[1]
    const dz = point[2] - center[2]

    if (axis === AXIS_X) return Math.atan2(dz, dy)
    if (axis === AXIS_Y) return Math.atan2(dx, dz)
    // AXIS_Z
    return Math.atan2(dy, dx)
  }
}
