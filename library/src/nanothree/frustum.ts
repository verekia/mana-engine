// Frustum culling for nanothree
//
// Extracts 6 frustum planes from a view-projection matrix (Gribb-Hartmann method)
// and tests bounding spheres against them.
//
// A bounding sphere is culled only if it lies entirely outside ANY plane,
// meaning objects partially in view are never culled.

/**
 * 6 frustum planes stored as [nx, ny, nz, d] × 6 = 24 floats.
 * Plane equation: dot(normal, point) + d >= -radius means "inside or intersecting".
 */
export type FrustumPlanes = Float32Array // length 24

/**
 * Pre-allocated frustum planes array. Reuse across frames to avoid allocation.
 */
export function createFrustumPlanes(): FrustumPlanes {
  return new Float32Array(24)
}

/**
 * Extract 6 frustum planes from a column-major view-projection matrix.
 * Uses Gribb-Hartmann method: each plane is a row combination of the VP matrix.
 * Planes are normalized so distance tests return world-space units.
 *
 * WebGPU clip space: x,y ∈ [-1,1], z ∈ [0,1].
 */
export function extractFrustumPlanes(out: FrustumPlanes, vp: Float32Array): void {
  // Column-major: vp[col*4 + row]
  // Row 0: vp[0], vp[4], vp[8],  vp[12]
  // Row 1: vp[1], vp[5], vp[9],  vp[13]
  // Row 2: vp[2], vp[6], vp[10], vp[14]
  // Row 3: vp[3], vp[7], vp[11], vp[15]

  // Left:   row3 + row0
  setPlane(out, 0, vp[3] + vp[0], vp[7] + vp[4], vp[11] + vp[8], vp[15] + vp[12])
  // Right:  row3 - row0
  setPlane(out, 1, vp[3] - vp[0], vp[7] - vp[4], vp[11] - vp[8], vp[15] - vp[12])
  // Bottom: row3 + row1
  setPlane(out, 2, vp[3] + vp[1], vp[7] + vp[5], vp[11] + vp[9], vp[15] + vp[13])
  // Top:    row3 - row1
  setPlane(out, 3, vp[3] - vp[1], vp[7] - vp[5], vp[11] - vp[9], vp[15] - vp[13])
  // Near:   row2  (WebGPU z ∈ [0,1], so near = row2, not row3+row2)
  setPlane(out, 4, vp[2], vp[6], vp[10], vp[14])
  // Far:    row3 - row2
  setPlane(out, 5, vp[3] - vp[2], vp[7] - vp[6], vp[11] - vp[10], vp[15] - vp[14])
}

function setPlane(out: FrustumPlanes, index: number, a: number, b: number, c: number, d: number): void {
  const len = Math.sqrt(a * a + b * b + c * c) || 1
  const off = index * 4
  out[off] = a / len
  out[off + 1] = b / len
  out[off + 2] = c / len
  out[off + 3] = d / len
}

/**
 * Test whether a bounding sphere (world-space center + radius) intersects the frustum.
 * Returns true if the sphere is at least partially inside (should be rendered).
 */
export function sphereInFrustum(planes: FrustumPlanes, cx: number, cy: number, cz: number, radius: number): boolean {
  for (let i = 0; i < 6; i++) {
    const off = i * 4
    const dist = planes[off] * cx + planes[off + 1] * cy + planes[off + 2] * cz + planes[off + 3]
    if (dist < -radius) return false
  }
  return true
}
