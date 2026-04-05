// CPU Raycaster for nanothree
//
// Supports two modes:
// 1. setFromCamera(ndc, camera) — unproject NDC screen coords into a world-space ray
// 2. set(origin, direction) — use an explicit world-space ray
//
// intersectObject() tests ray against meshes using their world matrices,
// returning sorted hits with distance, point, and the hit Object3D.

import { mat4Invert } from './math'

import type { PerspectiveCamera, Object3D } from './core'
import type { Mesh } from './mesh'

export interface RaycastHitResult {
  distance: number
  point: [number, number, number]
  object: Object3D
}

// Temp arrays to avoid per-call allocation
const _invVP = new Float32Array(16)
const _origin = new Float32Array(3)
const _direction = new Float32Array(3)

/** Möller–Trumbore ray-triangle intersection. Returns distance or -1 if no hit. */
function rayTriangle(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  v0x: number,
  v0y: number,
  v0z: number,
  v1x: number,
  v1y: number,
  v1z: number,
  v2x: number,
  v2y: number,
  v2z: number,
): number {
  const e1x = v1x - v0x,
    e1y = v1y - v0y,
    e1z = v1z - v0z
  const e2x = v2x - v0x,
    e2y = v2y - v0y,
    e2z = v2z - v0z

  const px = dy * e2z - dz * e2y
  const py = dz * e2x - dx * e2z
  const pz = dx * e2y - dy * e2x

  const det = e1x * px + e1y * py + e1z * pz
  if (Math.abs(det) < 1e-10) return -1

  const invDet = 1 / det

  const tx = ox - v0x,
    ty = oy - v0y,
    tz = oz - v0z
  const u = (tx * px + ty * py + tz * pz) * invDet
  if (u < 0 || u > 1) return -1

  const qx = ty * e1z - tz * e1y
  const qy = tz * e1x - tx * e1z
  const qz = tx * e1y - ty * e1x
  const v = (dx * qx + dy * qy + dz * qz) * invDet
  if (v < 0 || u + v > 1) return -1

  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet
  return t > 0 ? t : -1
}

// Temp for inverse world matrix
const _invWorld = new Float32Array(16)

/** Transform a position by a 4x4 matrix (w=1). */
function transformPoint(out: Float32Array, x: number, y: number, z: number, m: Float32Array): void {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15]
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
}

/** Transform a direction by a 4x4 matrix (w=0, no translation). */
function transformDir(out: Float32Array, x: number, y: number, z: number, m: Float32Array): void {
  out[0] = m[0] * x + m[4] * y + m[8] * z
  out[1] = m[1] * x + m[5] * y + m[9] * z
  out[2] = m[2] * x + m[6] * y + m[10] * z
}

const _tmpOrigin = new Float32Array(3)
const _tmpDir = new Float32Array(3)

export class Raycaster {
  readonly origin = new Float32Array(3)
  readonly direction = new Float32Array(3)

  /**
   * Set up a ray from NDC coordinates (-1 to 1) and a camera.
   * Unprojects near and far clip points to get ray origin and direction.
   */
  setFromCamera(ndc: [number, number], camera: PerspectiveCamera): void {
    // Need inverse of viewProjection
    // camera.viewProjection must be up-to-date (call updateViewProjection first)
    if (!mat4Invert(_invVP, camera.viewProjection)) return

    // Unproject NDC near plane (z = -1 in clip space → z = 0 in NDC for WebGPU)
    // WebGPU NDC z range is [0, 1], but we use the clip-space convention
    transformPoint(_origin, ndc[0], ndc[1], 0, _invVP)
    transformPoint(_direction, ndc[0], ndc[1], 1, _invVP)

    // Direction = far - near, normalized
    const dx = _direction[0] - _origin[0]
    const dy = _direction[1] - _origin[1]
    const dz = _direction[2] - _origin[2]
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1

    this.origin[0] = _origin[0]
    this.origin[1] = _origin[1]
    this.origin[2] = _origin[2]
    this.direction[0] = dx / len
    this.direction[1] = dy / len
    this.direction[2] = dz / len
  }

  /** Set an explicit world-space ray. */
  set(origin: Float32Array | number[], direction: Float32Array | number[]): void {
    this.origin[0] = origin[0]
    this.origin[1] = origin[1]
    this.origin[2] = origin[2]
    this.direction[0] = direction[0]
    this.direction[1] = direction[1]
    this.direction[2] = direction[2]
  }

  /**
   * Test the ray against an Object3D and its descendants.
   * Only Mesh objects with geometry are tested.
   * World matrices must be up-to-date (call scene.updateMatrixWorld() first).
   *
   * Returns hits sorted by distance (nearest first).
   */
  intersectObject(object: Object3D, recursive: boolean, maxDistance = 1e6): RaycastHitResult[] {
    const results: RaycastHitResult[] = []
    this._testObject(object, recursive, maxDistance, results)
    results.sort((a, b) => a.distance - b.distance)
    return results
  }

  private _testObject(object: Object3D, recursive: boolean, maxDistance: number, results: RaycastHitResult[]): void {
    if (!object.visible) return

    if ((object as Mesh).isMesh) {
      const mesh = object as Mesh
      const geo = mesh.geometry
      if (geo.positions && geo.indices) {
        this._testMesh(mesh, geo.positions, geo.indices, maxDistance, results)
      }
    }

    if (recursive) {
      for (const child of object.children) {
        this._testObject(child, true, maxDistance, results)
      }
    }
  }

  private _testMesh(
    mesh: Mesh,
    positions: Float32Array,
    indices: Uint16Array | Uint32Array,
    maxDistance: number,
    results: RaycastHitResult[],
  ): void {
    // Transform ray into object local space via inverse world matrix
    if (!mat4Invert(_invWorld, mesh._worldMatrix)) return

    transformPoint(_tmpOrigin, this.origin[0], this.origin[1], this.origin[2], _invWorld)
    transformDir(_tmpDir, this.direction[0], this.direction[1], this.direction[2], _invWorld)

    // Normalize direction in local space
    const len = Math.sqrt(_tmpDir[0] * _tmpDir[0] + _tmpDir[1] * _tmpDir[1] + _tmpDir[2] * _tmpDir[2]) || 1
    _tmpDir[0] /= len
    _tmpDir[1] /= len
    _tmpDir[2] /= len

    let bestDist = maxDistance
    let hitLocalX = 0,
      hitLocalY = 0,
      hitLocalZ = 0

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3
      const i1 = indices[i + 1] * 3
      const i2 = indices[i + 2] * 3

      const t = rayTriangle(
        _tmpOrigin[0],
        _tmpOrigin[1],
        _tmpOrigin[2],
        _tmpDir[0],
        _tmpDir[1],
        _tmpDir[2],
        positions[i0],
        positions[i0 + 1],
        positions[i0 + 2],
        positions[i1],
        positions[i1 + 1],
        positions[i1 + 2],
        positions[i2],
        positions[i2 + 1],
        positions[i2 + 2],
      )

      if (t >= 0 && t < bestDist) {
        bestDist = t
        hitLocalX = _tmpOrigin[0] + _tmpDir[0] * t
        hitLocalY = _tmpOrigin[1] + _tmpDir[1] * t
        hitLocalZ = _tmpOrigin[2] + _tmpDir[2] * t
      }
    }

    if (bestDist < maxDistance) {
      // Transform hit point back to world space
      const wm = mesh._worldMatrix
      const wx = wm[0] * hitLocalX + wm[4] * hitLocalY + wm[8] * hitLocalZ + wm[12]
      const wy = wm[1] * hitLocalX + wm[5] * hitLocalY + wm[9] * hitLocalZ + wm[13]
      const wz = wm[2] * hitLocalX + wm[6] * hitLocalY + wm[10] * hitLocalZ + wm[14]

      // Compute world-space distance from ray origin
      const dx = wx - this.origin[0]
      const dy = wy - this.origin[1]
      const dz = wz - this.origin[2]
      const worldDist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      results.push({
        distance: worldDist,
        point: [wx, wy, wz],
        object: mesh,
      })
    }
  }
}
