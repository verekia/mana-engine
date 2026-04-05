// Interactive 3D Transform Gizmo for nanothree
//
// Solid mesh handles (cones for translate, tori for rotate, cubes for scale)
// with raycasting for hover highlight and click-drag interaction.

import { Group, Object3D, PerspectiveCamera } from './core'
import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from './geometry'
import { DoubleSide, MeshBasicMaterial } from './material'
import { Mesh } from './mesh'
import { Raycaster } from './raycaster'

import type { Transform } from '../scene-data.ts'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

const AXIS_X = 0
const AXIS_Y = 1
const AXIS_Z = 2
const AXIS_ALL = 3 // uniform scale
type GizmoAxis = typeof AXIS_X | typeof AXIS_Y | typeof AXIS_Z | typeof AXIS_ALL

const RED: [number, number, number] = [0.9, 0.2, 0.2]
const GREEN: [number, number, number] = [0.2, 0.9, 0.2]
const BLUE: [number, number, number] = [0.2, 0.4, 0.9]
const YELLOW: [number, number, number] = [0.9, 0.9, 0.2]
const HOVER_RED: [number, number, number] = [1, 0.5, 0.5]
const HOVER_GREEN: [number, number, number] = [0.5, 1, 0.5]
const HOVER_BLUE: [number, number, number] = [0.5, 0.65, 1]
const HOVER_YELLOW: [number, number, number] = [1, 1, 0.5]

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

export interface TransformGizmoCallbacks {
  onTransformStart?: (id: string) => void
  onTransformChange?: (id: string, transform: Transform) => void
  onTransformEnd?: (id: string, transform: Transform) => void
  disableOrbitControls: () => void
  enableOrbitControls: () => void
}

// ── Ray-axis / ray-plane math ──────────────────────────────────────────

/** Project the ray onto an axis line through `axisOrigin`, return the parameter along the axis. */
function closestPointOnAxis(
  rayOrigin: Float32Array,
  rayDir: Float32Array,
  axisOrigin: number[],
  axisDir: number[],
): number {
  // t = dot(ray-origin - axis-origin, axisDir × (rayDir × axisDir)) ...
  // Simplified: project ray onto the axis using the closest-point-between-two-lines formula
  const dox = rayOrigin[0] - axisOrigin[0]
  const doy = rayOrigin[1] - axisOrigin[1]
  const doz = rayOrigin[2] - axisOrigin[2]
  const ax = axisDir[0],
    ay = axisDir[1],
    az = axisDir[2]
  const rx = rayDir[0],
    ry = rayDir[1],
    rz = rayDir[2]
  const dotAR = ax * rx + ay * ry + az * rz
  const dotAO = ax * dox + ay * doy + az * doz
  const dotRO = rx * dox + ry * doy + rz * doz
  const denom = 1 - dotAR * dotAR
  if (Math.abs(denom) < 1e-10) return 0
  return (dotAO - dotAR * dotRO) / denom
}

/** Intersect a ray with a plane. Returns true and sets `out` to the hit point. */
function rayPlaneIntersection(
  out: number[],
  rayOrigin: Float32Array,
  rayDir: Float32Array,
  planePoint: number[],
  planeNormal: number[],
): boolean {
  const denom = planeNormal[0] * rayDir[0] + planeNormal[1] * rayDir[1] + planeNormal[2] * rayDir[2]
  if (Math.abs(denom) < 1e-10) return false
  const dx = planePoint[0] - rayOrigin[0]
  const dy = planePoint[1] - rayOrigin[1]
  const dz = planePoint[2] - rayOrigin[2]
  const t = (dx * planeNormal[0] + dy * planeNormal[1] + dz * planeNormal[2]) / denom
  if (t < 0) return false
  out[0] = rayOrigin[0] + rayDir[0] * t
  out[1] = rayOrigin[1] + rayDir[1] * t
  out[2] = rayOrigin[2] + rayDir[2] * t
  return true
}

// ── Euler ↔ rotation helpers (nanothree uses Euler, not quaternion) ────

function eulerToQuat(ex: number, ey: number, ez: number): [number, number, number, number] {
  const c1 = Math.cos(ex / 2),
    s1 = Math.sin(ex / 2)
  const c2 = Math.cos(ey / 2),
    s2 = Math.sin(ey / 2)
  const c3 = Math.cos(ez / 2),
    s3 = Math.sin(ez / 2)
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

function quatToEuler(qx: number, qy: number, qz: number, qw: number): [number, number, number] {
  const sinr = 2 * (qw * qx + qy * qz)
  const cosr = 1 - 2 * (qx * qx + qy * qy)
  const rx = Math.atan2(sinr, cosr)
  const sinp = 2 * (qw * qy - qz * qx)
  const ry = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)
  const siny = 2 * (qw * qz + qx * qy)
  const cosy = 1 - 2 * (qy * qy + qz * qz)
  const rz = Math.atan2(siny, cosy)
  return [rx, ry, rz]
}

function quatMul(a: number[], b: number[]): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]
}

function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): [number, number, number, number] {
  const s = Math.sin(angle / 2)
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)]
}

// ── TransformGizmo ──────────────────────────────────────────────────────

export class TransformGizmo {
  readonly root = new Group()
  private mode: GizmoMode = 'translate'

  private translateGroup = new Group()
  private rotateGroup = new Group()
  private scaleGroup = new Group()

  private translateMeshes: Object3D[] = []
  private rotateMeshes: Mesh[] = []
  private scaleMeshes: Object3D[] = []

  private translateMaterials: MeshBasicMaterial[] = []
  private rotateMaterials: MeshBasicMaterial[] = []
  private scaleMaterials: MeshBasicMaterial[] = []

  private targetObject: Object3D | null = null
  private targetEntityId: string | null = null
  private hoveredAxis: GizmoAxis | null = null
  private dragging = false
  private _consumedPointer = false
  private dragAxis: GizmoAxis | null = null
  private dragStartValue = 0
  private dragStartPosition = [0, 0, 0]
  private dragStartRotation = [0, 0, 0] // euler
  private dragStartScale = [1, 1, 1]
  private dragStartAngle = 0

  private translateSnap: number | null = null
  private rotateSnap: number | null = null
  private scaleSnap: number | null = null

  private raycaster = new Raycaster()
  private camera: PerspectiveCamera
  private canvas: HTMLCanvasElement
  private callbacks: TransformGizmoCallbacks

  private _onPointerDown: (e: PointerEvent) => void
  private _onPointerMove: (e: PointerEvent) => void
  private _onPointerUp: (e: PointerEvent) => void
  private _onClick: (e: MouseEvent) => void

  constructor(camera: PerspectiveCamera, canvas: HTMLCanvasElement, callbacks: TransformGizmoCallbacks) {
    this.camera = camera
    this.canvas = canvas
    this.callbacks = callbacks

    this._buildTranslateGizmo()
    this._buildRotateGizmo()
    this._buildScaleGizmo()

    this.root.add(this.translateGroup)
    this.root.add(this.rotateGroup)
    this.root.add(this.scaleGroup)
    this.root.visible = false
    this._updateModeVisibility()

    this._onPointerDown = this._handlePointerDown.bind(this)
    this._onPointerMove = this._handlePointerMove.bind(this)
    this._onPointerUp = this._handlePointerUp.bind(this)
    this._onClick = this._handleClick.bind(this)

    canvas.addEventListener('pointerdown', this._onPointerDown)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerup', this._onPointerUp)
    canvas.addEventListener('click', this._onClick, true)
  }

  // ── Build gizmo meshes ──────────────────────────────────────────────

  private _buildTranslateGizmo(): void {
    const shaftGeo = new CylinderGeometry(0.02, 0.02, 1, 8)
    const tipGeo = new ConeGeometry(0.06, 0.2, 12)
    const colors = [RED, GREEN, BLUE]

    for (let i = 0; i < 3; i++) {
      const mat = new MeshBasicMaterial({ color: this._colorToInt(colors[i]) })
      const group = new Group()

      // Shaft — CylinderGeometry extends along Y by default
      const shaft = new Mesh(shaftGeo, mat)
      shaft.castShadow = false
      group.add(shaft)

      // Arrow tip
      const tip = new Mesh(tipGeo, mat)
      tip.position.set(0, 0.6, 0)
      tip.castShadow = false
      group.add(tip)

      // Rotate entire group to align Y-axis with target axis
      this._alignToAxis(group, i)

      this.translateGroup.add(group)
      this.translateMeshes.push(group)
      this.translateMaterials.push(mat)
    }
  }

  private _buildRotateGizmo(): void {
    const torusGeo = new TorusGeometry(1, 0.02, 8, 48)
    const colors = [RED, GREEN, BLUE]
    // Torus is in XY plane (around Z). Rotate to align with each axis.
    // X: torus around X → rotate 90° around Y
    // Y: torus around Y → rotate 90° around X
    // Z: torus around Z → identity (already in XY)
    const rotations: [number, number, number][] = [
      [0, Math.PI / 2, 0], // X
      [Math.PI / 2, 0, 0], // Y
      [0, 0, 0], // Z
    ]

    for (let i = 0; i < 3; i++) {
      const mat = new MeshBasicMaterial({ color: this._colorToInt(colors[i]), side: DoubleSide })
      const torus = new Mesh(torusGeo, mat)
      torus.castShadow = false
      torus.rotation.set(rotations[i][0], rotations[i][1], rotations[i][2])

      this.rotateGroup.add(torus)
      this.rotateMeshes.push(torus)
      this.rotateMaterials.push(mat)
    }
  }

  private _buildScaleGizmo(): void {
    const shaftGeo = new CylinderGeometry(0.02, 0.02, 1, 8)
    const cubeGeo = new BoxGeometry(0.1, 0.1, 0.1)
    const colors = [RED, GREEN, BLUE, YELLOW]

    for (let i = 0; i < 3; i++) {
      const mat = new MeshBasicMaterial({ color: this._colorToInt(colors[i]) })
      const group = new Group()

      const shaft = new Mesh(shaftGeo, mat)
      shaft.castShadow = false
      group.add(shaft)

      const cube = new Mesh(cubeGeo, mat)
      cube.position.set(0, 0.6, 0)
      cube.castShadow = false
      group.add(cube)

      this._alignToAxis(group, i)

      this.scaleGroup.add(group)
      this.scaleMeshes.push(group)
      this.scaleMaterials.push(mat)
    }

    // Uniform scale center handle
    const centerMat = new MeshBasicMaterial({ color: this._colorToInt(YELLOW) })
    const center = new Mesh(new SphereGeometry(0.08, 12, 8), centerMat)
    center.castShadow = false
    this.scaleGroup.add(center)
    this.scaleMeshes.push(center)
    this.scaleMaterials.push(centerMat)
  }

  /** Rotate a group so its local Y-axis points along world axis `i` (0=X, 1=Y, 2=Z). */
  private _alignToAxis(group: Object3D, axis: number): void {
    // CylinderGeometry/ConeGeometry extend along Y.
    // To point along X: rotate -90° around Z
    // To point along Y: identity
    // To point along Z: rotate +90° around X
    if (axis === 0) group.rotation.set(0, 0, -Math.PI / 2)
    else if (axis === 2) group.rotation.set(Math.PI / 2, 0, 0)
  }

  private _colorToInt(c: [number, number, number]): number {
    return ((c[0] * 255) << 16) | ((c[1] * 255) << 8) | (c[2] * 255)
  }

  // ── Public API ──────────────────────────────────────────────────────

  attach(obj: Object3D, entityId: string): void {
    this.targetObject = obj
    this.targetEntityId = entityId
    this.root.visible = true
    this._syncPosition()
  }

  detach(): void {
    this.targetObject = null
    this.targetEntityId = null
    this.root.visible = false
    this.dragging = false
    this.dragAxis = null
    this._clearHover()
  }

  setMode(mode: GizmoMode): void {
    this.mode = mode
    this._updateModeVisibility()
  }

  setSnap(translate: number | null, rotate: number | null, scale: number | null): void {
    this.translateSnap = translate
    this.rotateSnap = rotate != null ? (rotate * Math.PI) / 180 : null
    this.scaleSnap = scale
  }

  isDragging(): boolean {
    return this.dragging
  }

  /** Call each frame to sync position and maintain screen-constant size. */
  update(): void {
    if (!this.targetObject || !this.root.visible) return
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

  // ── Internal ────────────────────────────────────────────────────────

  private _updateModeVisibility(): void {
    this.translateGroup.visible = this.mode === 'translate'
    this.rotateGroup.visible = this.mode === 'rotate'
    this.scaleGroup.visible = this.mode === 'scale'
  }

  private _syncPosition(): void {
    if (!this.targetObject) return
    this.root.position.set(this.targetObject.position.x, this.targetObject.position.y, this.targetObject.position.z)
  }

  private _updateScale(): void {
    const p = this.root.position
    const cp = this.camera.position
    const dx = p.x - cp.x,
      dy = p.y - cp.y,
      dz = p.z - cp.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const s = dist * 0.15
    this.root.scale.set(s, s, s)
  }

  private _getNDC(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1)]
  }

  private _getAxisDirection(axis: GizmoAxis): number[] {
    if (axis === AXIS_X) return [1, 0, 0]
    if (axis === AXIS_Y) return [0, 1, 0]
    return [0, 0, 1]
  }

  // ── Raycast ─────────────────────────────────────────────────────────

  private _hitTestGizmo(ndcX: number, ndcY: number): GizmoAxis | null {
    if (!this.root.visible) return null

    this.camera.updateViewProjection()
    this.raycaster.setFromCamera([ndcX, ndcY], this.camera)

    const meshes =
      this.mode === 'translate' ? this.translateMeshes : this.mode === 'rotate' ? this.rotateMeshes : this.scaleMeshes

    let closestDist = Infinity
    let closestAxis: GizmoAxis | null = null

    for (let i = 0; i < meshes.length; i++) {
      const hits = this.raycaster.intersectObject(meshes[i], true)
      if (hits.length > 0 && hits[0].distance < closestDist) {
        closestDist = hits[0].distance
        closestAxis = i as GizmoAxis
      }
    }

    return closestAxis
  }

  // ── Hover ───────────────────────────────────────────────────────────

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
      const c = hoverColors[axis]
      mats[axis].color.set(c[0], c[1], c[2])
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
      const c = defaultColors[axis]
      mats[axis].color.set(c[0], c[1], c[2])
    }
    this.hoveredAxis = null
  }

  // ── Snapshot ─────────────────────────────────────────────────────────

  private _snapshotTransform(): Transform {
    if (!this.targetObject) return {}
    const p = this.targetObject.position
    const r = this.targetObject.rotation
    const s = this.targetObject.scale
    return {
      position: [round3(p.x), round3(p.y), round3(p.z)],
      rotation: [round3(r.x), round3(r.y), round3(r.z)],
      scale: [round3(s.x), round3(s.y), round3(s.z)],
    }
  }

  // ── Pointer events ──────────────────────────────────────────────────

  private _handlePointerDown(e: PointerEvent): void {
    if (!this.targetObject || e.button !== 0) return

    const [ndcX, ndcY] = this._getNDC(e)
    const axis = this._hitTestGizmo(ndcX, ndcY)
    if (axis === null) return

    e.preventDefault()
    e.stopPropagation()

    this._consumedPointer = true
    this.dragging = true
    this.dragAxis = axis
    this.callbacks.disableOrbitControls()

    const p = this.targetObject.position
    const r = this.targetObject.rotation
    const s = this.targetObject.scale
    this.dragStartPosition = [p.x, p.y, p.z]
    this.dragStartRotation = [r.x, r.y, r.z]
    this.dragStartScale = [s.x, s.y, s.z]

    this.camera.updateViewProjection()
    this.raycaster.setFromCamera([ndcX, ndcY], this.camera)

    if (this.mode === 'translate' || (this.mode === 'scale' && axis !== AXIS_ALL)) {
      const axisDir = this._getAxisDirection(axis)
      this.dragStartValue = closestPointOnAxis(
        this.raycaster.origin,
        this.raycaster.direction,
        this.dragStartPosition,
        axisDir,
      )
    } else if (this.mode === 'scale' && axis === AXIS_ALL) {
      this.dragStartValue = ndcY
    } else if (this.mode === 'rotate') {
      const planeNormal = this._getAxisDirection(axis)
      const hitPoint = [0, 0, 0]
      if (
        rayPlaneIntersection(
          hitPoint,
          this.raycaster.origin,
          this.raycaster.direction,
          this.dragStartPosition,
          planeNormal,
        )
      ) {
        this.dragStartAngle = this._planeAngle(hitPoint, this.dragStartPosition, axis)
      }
    }

    if (this.targetEntityId) {
      this.callbacks.onTransformStart?.(this.targetEntityId)
    }
  }

  private _handlePointerMove(e: PointerEvent): void {
    const [ndcX, ndcY] = this._getNDC(e)

    if (!this.dragging) {
      const axis = this._hitTestGizmo(ndcX, ndcY)
      this._setHover(axis)
      this.canvas.style.cursor = axis !== null ? 'grab' : ''
      return
    }

    if (!this.targetObject || this.dragAxis === null) return

    this.camera.updateViewProjection()
    this.raycaster.setFromCamera([ndcX, ndcY], this.camera)

    if (this.mode === 'translate') {
      const axisDir = this._getAxisDirection(this.dragAxis)
      const t = closestPointOnAxis(this.raycaster.origin, this.raycaster.direction, this.dragStartPosition, axisDir)
      const delta = t - this.dragStartValue

      const newPos = [...this.dragStartPosition]
      newPos[this.dragAxis] += delta
      if (this.translateSnap) {
        newPos[this.dragAxis] = Math.round(newPos[this.dragAxis] / this.translateSnap) * this.translateSnap
      }
      this.targetObject.position.set(newPos[0], newPos[1], newPos[2])
      this._syncPosition()
    } else if (this.mode === 'scale') {
      if (this.dragAxis === AXIS_ALL) {
        const delta = ndcY - this.dragStartValue
        let factor = 1 + delta * 2
        if (this.scaleSnap) factor = Math.round(factor / this.scaleSnap) * this.scaleSnap || this.scaleSnap
        this.targetObject.scale.set(
          this.dragStartScale[0] * factor,
          this.dragStartScale[1] * factor,
          this.dragStartScale[2] * factor,
        )
      } else {
        const axisDir = this._getAxisDirection(this.dragAxis)
        const t = closestPointOnAxis(this.raycaster.origin, this.raycaster.direction, this.dragStartPosition, axisDir)
        let factor = 1 + (t - this.dragStartValue)
        if (this.scaleSnap) factor = Math.round(factor / this.scaleSnap) * this.scaleSnap || this.scaleSnap
        const newScale = [...this.dragStartScale]
        newScale[this.dragAxis] = this.dragStartScale[this.dragAxis] * Math.max(0.01, factor)
        this.targetObject.scale.set(newScale[0], newScale[1], newScale[2])
      }
    } else if (this.mode === 'rotate' && this.dragAxis !== null) {
      const planeNormal = this._getAxisDirection(this.dragAxis)
      const hitPoint = [0, 0, 0]
      if (
        rayPlaneIntersection(
          hitPoint,
          this.raycaster.origin,
          this.raycaster.direction,
          this.dragStartPosition,
          planeNormal,
        )
      ) {
        let deltaAngle = this._planeAngle(hitPoint, this.dragStartPosition, this.dragAxis) - this.dragStartAngle
        if (this.rotateSnap) deltaAngle = Math.round(deltaAngle / this.rotateSnap) * this.rotateSnap

        // Apply rotation: convert start euler → quat, apply axis rotation, convert back
        const startQ = eulerToQuat(this.dragStartRotation[0], this.dragStartRotation[1], this.dragStartRotation[2])
        const ad = this._getAxisDirection(this.dragAxis)
        const deltaQ = quatFromAxisAngle(ad[0], ad[1], ad[2], deltaAngle)
        const newQ = quatMul(deltaQ, startQ)
        const newEuler = quatToEuler(newQ[0], newQ[1], newQ[2], newQ[3])
        this.targetObject.rotation.set(newEuler[0], newEuler[1], newEuler[2])
      }
    }

    if (this.targetEntityId) {
      this.callbacks.onTransformChange?.(this.targetEntityId, this._snapshotTransform())
    }
  }

  private _handlePointerUp(_e: PointerEvent): void {
    if (!this.dragging) return

    this.dragging = false
    this.canvas.style.cursor = ''
    this.callbacks.enableOrbitControls()

    if (this.targetEntityId) {
      this.callbacks.onTransformEnd?.(this.targetEntityId, this._snapshotTransform())
    }

    this.dragAxis = null
  }

  private _handleClick(e: MouseEvent): void {
    if (this._consumedPointer) {
      e.stopPropagation()
      e.preventDefault()
      this._consumedPointer = false
    }
  }

  private _planeAngle(point: number[], center: number[], axis: GizmoAxis): number {
    const dx = point[0] - center[0]
    const dy = point[1] - center[1]
    const dz = point[2] - center[2]
    if (axis === AXIS_X) return Math.atan2(dz, dy)
    if (axis === AXIS_Y) return Math.atan2(dx, dz)
    return Math.atan2(dy, dx)
  }
}
