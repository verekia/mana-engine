import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  SphereGeometry,
} from '../../nanothree/index.ts'

import type { ColliderData, SceneEntity } from '../../scene-data.ts'

/** Parse a CSS hex color string into a nanothree Color. */
export function hexToColor(hex: string): Color {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16)
  return new Color(n)
}

/** Apply a SceneEntity transform to a nanothree Object3D. */
export function applyTransform(obj: Object3D, transform?: SceneEntity['transform']): void {
  if (!transform) return
  if (transform.position) {
    obj.position.set(transform.position[0], transform.position[1], transform.position[2])
  }
  if (transform.rotation) {
    obj.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2])
  }
  if (transform.scale) {
    obj.scale.set(transform.scale[0], transform.scale[1], transform.scale[2])
  }
}

/** Create a grid of lines in the XZ plane (Y-up). */
export function createGridGroup(size: number, divisions: number): Group {
  const group = new Group()
  const half = size / 2
  const step = size / divisions

  const positions: number[] = []
  const indices: number[] = []
  let vi = 0

  for (let i = 0; i <= divisions; i++) {
    const offset = -half + i * step
    // Line along X at z=offset
    positions.push(-half, 0, offset, half, 0, offset)
    indices.push(vi, vi + 1)
    vi += 2
    // Line along Z at x=offset
    positions.push(offset, 0, -half, offset, 0, half)
    indices.push(vi, vi + 1)
    vi += 2
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  const line = new Line(geo, new LineBasicMaterial({ color: 0x444444 }))
  group.add(line)
  return group
}

/** Create a green wireframe mesh for a collider shape. */
export function createColliderWireframe(collider: ColliderData): Object3D {
  let geo

  switch (collider.shape) {
    case 'sphere': {
      const r = collider.radius ?? 0.5
      geo = new SphereGeometry(r, 16, 12)
      break
    }
    case 'capsule': {
      const r = collider.radius ?? 0.5
      const hh = collider.halfHeight ?? 0.5
      geo = new CapsuleGeometry(r, hh * 2, 4, 8)
      break
    }
    case 'cylinder': {
      const r = collider.radius ?? 0.5
      const hh = collider.halfHeight ?? 0.5
      geo = new CylinderGeometry(r, r, hh * 2, 16)
      break
    }
    default: {
      const he = collider.halfExtents ?? [0.5, 0.5, 0.5]
      geo = new BoxGeometry(he[0] * 2, he[1] * 2, he[2] * 2)
      break
    }
  }

  const mat = new MeshLambertMaterial({ color: 0x00ff00, wireframe: true })
  const mesh = new Mesh(geo, mat)
  mesh.castShadow = false
  return mesh
}
