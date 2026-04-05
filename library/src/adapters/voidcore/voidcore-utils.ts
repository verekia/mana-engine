import {
  BasicMaterial,
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Engine,
  Geometry,
  Group,
  Mesh,
  type Node,
  SphereGeometry,
} from 'voidcore'

import type { ColliderData, SceneEntity } from '../../scene-data.ts'

/** Internal VoidCore renderer properties needed to set clear color. */
interface VoidcoreRendererInternals {
  _opaquePassCA0?: { clearValue: { r: number; g: number; b: number; a: number } }
  _opaquePassCA1?: { clearValue: { r: number; g: number; b: number; a: number } }
  _blitPassCA?: { clearValue: { r: number; g: number; b: number; a: number } }
}

/** Build an orthographic projection matrix (clip-space Z from 0 to 1 for WebGPU). */
export function orthoMatrixZO(
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

/** Parse a CSS hex color string into [r, g, b] in 0-1 range. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16)
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

/** Convert Euler angles (x, y, z in radians) to a quaternion [x, y, z, w]. */
export function eulerToQuat(ex: number, ey: number, ez: number): [number, number, number, number] {
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
 * Y-up (x, y, z) -> Z-up (x, -z, y)
 */
export function yUpToZUp(x: number, y: number, z: number): [number, number, number] {
  return [x, -z, y]
}

/**
 * Convert a VoidCore Z-up position back to Y-up.
 * Z-up (x, y, z) -> Y-up (x, z, -y)
 */
export function zUpToYUp(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]
}

export function applyTransform(node: Node, transform?: SceneEntity['transform']): void {
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
 * VoidCore has no public API for this -- we patch the internal clear values directly.
 */
export function setClearColor(engine: Engine, r: number, g: number, b: number): void {
  const renderer = engine.renderer as VoidcoreRendererInternals
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

/** Create a grid of thin quads in the XY plane (z-up). sceneRoot rotation handles y-up. */
export function createGridGroup(size: number, divisions: number): Group {
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

export function addQuad(
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
export function createColliderWireframe(collider: ColliderData, isYUp: boolean): Node {
  let geometry: BoxGeometry | SphereGeometry | CapsuleGeometry | CylinderGeometry
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
    case 'cylinder': {
      const r = collider.radius ?? 0.5
      const hh = collider.halfHeight ?? 0.5
      geometry = new CylinderGeometry({ radiusTop: r, radiusBottom: r, height: hh * 2, radialSegments: 16 })
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
