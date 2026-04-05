// Core scene graph types for nanothree

import { mat4Perspective, mat4Ortho, mat4Multiply, mat4ComposeTRS, mat4Invert } from './math'

export class Color {
  r: number
  g: number
  b: number

  constructor(rOrHex?: number | Color, g?: number, b?: number) {
    if (rOrHex instanceof Color) {
      this.r = rOrHex.r
      this.g = rOrHex.g
      this.b = rOrHex.b
    } else if (g !== undefined && b !== undefined) {
      this.r = rOrHex!
      this.g = g
      this.b = b
    } else if (typeof rOrHex === 'number') {
      this.r = ((rOrHex >> 16) & 0xff) / 255
      this.g = ((rOrHex >> 8) & 0xff) / 255
      this.b = (rOrHex & 0xff) / 255
    } else {
      this.r = 1
      this.g = 1
      this.b = 1
    }
  }

  set(rOrHex: number | Color, g?: number, b?: number) {
    if (rOrHex instanceof Color) {
      this.r = rOrHex.r
      this.g = rOrHex.g
      this.b = rOrHex.b
    } else if (g !== undefined && b !== undefined) {
      this.r = rOrHex
      this.g = g
      this.b = b
    } else {
      this.r = ((rOrHex >> 16) & 0xff) / 255
      this.g = ((rOrHex >> 8) & 0xff) / 255
      this.b = (rOrHex & 0xff) / 255
    }
    return this
  }
}

export class Vector3 {
  x: number
  y: number
  z: number

  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }

  set(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
    return this
  }
}

export class Euler {
  x: number
  y: number
  z: number

  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }

  set(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
    return this
  }
}

// Shared temp matrix for parent × local multiplication (avoids per-object alloc)
const _localMat = new Float32Array(16)

export class Object3D {
  readonly position = new Vector3()
  readonly rotation = new Euler()
  readonly scale = new Vector3(1, 1, 1)
  visible = true
  castShadow = false
  receiveShadow = false

  parent: Object3D | null = null
  readonly children: Object3D[] = []
  readonly _worldMatrix = new Float32Array(16)

  add(...objects: Object3D[]) {
    for (const obj of objects) {
      if (obj.parent) obj.parent.remove(obj)
      obj.parent = this
      this.children.push(obj)
    }
  }

  remove(obj: Object3D) {
    const idx = this.children.indexOf(obj)
    if (idx !== -1) {
      this.children.splice(idx, 1)
      obj.parent = null
    }
  }

  /** Compute _worldMatrix from local TRS and parent's world matrix. */
  _updateWorldMatrix(parentWorldMatrix: Float32Array | null) {
    if (parentWorldMatrix) {
      // Has parent: compute local into temp, then multiply parent × local
      mat4ComposeTRS(
        _localMat,
        this.position.x,
        this.position.y,
        this.position.z,
        this.rotation.x,
        this.rotation.y,
        this.rotation.z,
        this.scale.x,
        this.scale.y,
        this.scale.z,
      )
      mat4Multiply(this._worldMatrix, parentWorldMatrix, _localMat)
    } else {
      // No parent: compute TRS directly into world matrix (fast path)
      mat4ComposeTRS(
        this._worldMatrix,
        this.position.x,
        this.position.y,
        this.position.z,
        this.rotation.x,
        this.rotation.y,
        this.rotation.z,
        this.scale.x,
        this.scale.y,
        this.scale.z,
      )
    }
  }
}

export class Group extends Object3D {
  readonly isGroup = true
}

export class PerspectiveCamera extends Object3D {
  aspect: number
  private _fov: number
  private _near: number
  private _far: number

  private proj = new Float32Array(16)
  private view = new Float32Array(16)
  readonly viewProjection = new Float32Array(16)

  /**
   * When set, `updateViewProjection` uses orthographic projection instead of
   * perspective. Set to `null` to return to perspective mode.
   * Values: `{ left, right, bottom, top }`
   */
  orthoOverride: { left: number; right: number; bottom: number; top: number } | null = null

  get fov() {
    return this._fov * (180 / Math.PI)
  }
  get near() {
    return this._near
  }
  get far() {
    return this._far
  }

  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    super()
    this._fov = fov * (Math.PI / 180)
    this.aspect = aspect
    this._near = near
    this._far = far
  }

  /**
   * Set the camera rotation to face the target point from the current position.
   * Like Three.js, this is a one-time operation that sets `this.rotation` —
   * it does NOT store a target. Moving the camera afterward preserves the
   * look direction (rotation), it does not keep tracking the target point.
   */
  lookAt(x: number, y: number, z: number) {
    // Backward direction: z-axis = normalize(position - target)
    let bx = this.position.x - x
    let by = this.position.y - y
    let bz = this.position.z - z
    let len = Math.sqrt(bx * bx + by * by + bz * bz)
    if (len < 1e-10) return
    bx /= len
    by /= len
    bz /= len

    // Right = normalize(cross(worldUp=(0,1,0), backward))
    let rx = bz,
      rz = -bx
    len = Math.sqrt(rx * rx + rz * rz)
    if (len < 1e-10) {
      // Looking straight up or down — use fallback
      rx = 1
      rz = 0
    } else {
      rx /= len
      rz /= len
    }

    // Up = cross(backward, right)
    const ux = by * rz
    const uy = bz * rx - bx * rz
    const uz = -by * rx

    // Extract XYZ euler from the rotation matrix [right, up, backward]
    // Column-major: R[0]=rx, R[1]=0, R[2]=rz, R[6]=uz, R[10]=bz, R[9]=by, R[5]=uy
    if (Math.abs(rz) < 0.9999) {
      this.rotation.set(
        Math.atan2(uz, bz), // rx = atan2(R[6], R[10])
        Math.asin(-rz), // ry = asin(-R[2])
        Math.atan2(0, rx), // rz = atan2(R[1], R[0]) — R[1] is always 0
      )
    } else {
      // Gimbal lock (looking nearly straight up or down)
      this.rotation.set(Math.atan2(-by, uy), rz > 0 ? -Math.PI / 2 : Math.PI / 2, 0)
    }
  }

  updateProjectionMatrix() {
    // Projection will be recalculated on next updateViewProjection
  }

  /**
   * Recompute the projection and view-projection matrices.
   * The view matrix is always derived from the inverse of the world matrix
   * (position + rotation), matching Three.js camera behavior.
   *
   * If the camera is in a scene graph, call scene.updateMatrixWorld() first
   * so that `_worldMatrix` includes parent transforms. If the camera is
   * standalone (no parent), this method computes the world matrix from local TRS.
   */
  updateViewProjection(aspect?: number) {
    if (aspect !== undefined) this.aspect = aspect
    if (this.orthoOverride) {
      const o = this.orthoOverride
      mat4Ortho(this.proj, o.left, o.right, o.bottom, o.top, this._near, this._far)
    } else {
      mat4Perspective(this.proj, this._fov, this.aspect, this._near, this._far)
    }

    // Ensure world matrix is current for standalone cameras (no parent).
    // Scene-graph cameras already have _worldMatrix set by updateMatrixWorld().
    if (!this.parent) {
      this._updateWorldMatrix(null)
    }

    mat4Invert(this.view, this._worldMatrix)
    mat4Multiply(this.viewProjection, this.proj, this.view)
  }
}
