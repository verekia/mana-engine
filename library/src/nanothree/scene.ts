// Scene class for nanothree

import { Object3D } from './core'
import { createFrustumPlanes, extractFrustumPlanes, sphereInFrustum } from './frustum'
import { mat4Identity } from './math'

import type { FrustumPlanes } from './frustum'
import type { BoundingSphere } from './geometry'
import type { InstancedMesh } from './instanced-mesh'
import type { InstancedSprite } from './instanced-sprite'
import type { AmbientLight, DirectionalLight } from './light'
import type { Line } from './line'
import type { Mesh } from './mesh'
import type { Sprite } from './sprite'

export class Scene extends Object3D {
  // Flat lists rebuilt each frame by updateMatrixWorld()
  readonly meshes: Mesh[] = []
  readonly instancedMeshes: InstancedMesh[] = []
  readonly instancedSprites: InstancedSprite[] = []
  readonly lines: Line[] = []
  readonly sprites: Sprite[] = []
  readonly ambientLights: AmbientLight[] = []
  readonly directionalLights: DirectionalLight[] = []

  // Frustum culling state
  private _frustumPlanes: FrustumPlanes = createFrustumPlanes()
  private _frustumCulling = false

  constructor() {
    super()
    // Scene's own world matrix is always identity
    mat4Identity(this._worldMatrix)
  }

  /**
   * Recursively traverse the scene graph in a single pass:
   * 1. Compute world matrices (parent × local)
   * 2. Classify renderables into flat arrays
   * 3. Optionally cull objects outside the camera frustum
   *
   * Called by the renderer once per frame before drawing.
   *
   * @param viewProjection If provided, enables frustum culling for this frame.
   */
  updateMatrixWorld(viewProjection?: Float32Array) {
    this.meshes.length = 0
    this.instancedMeshes.length = 0
    this.instancedSprites.length = 0
    this.lines.length = 0
    this.sprites.length = 0
    this.ambientLights.length = 0
    this.directionalLights.length = 0

    if (viewProjection) {
      this._frustumCulling = true
      extractFrustumPlanes(this._frustumPlanes, viewProjection)
    } else {
      this._frustumCulling = false
    }

    this._traverseChildren(this._worldMatrix, this.children)
  }

  private _traverseChildren(parentWorld: Float32Array, children: Object3D[]) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (!child.visible) continue

      child._updateWorldMatrix(parentWorld)

      // Classify (check instanced types first to avoid double-classification)
      if ((child as any).isInstancedSprite) {
        this.instancedSprites.push(child as unknown as InstancedSprite)
      } else if ((child as any).isInstancedMesh) {
        this.instancedMeshes.push(child as unknown as InstancedMesh)
      } else if ((child as any).isSprite) {
        if (this._frustumCulling) {
          // Cull sprites by world position (they're small billboard quads)
          const m = child._worldMatrix
          if (!sphereInFrustum(this._frustumPlanes, m[12], m[13], m[14], 0)) continue
        }
        this.sprites.push(child as unknown as Sprite)
      } else if ((child as any).isMesh) {
        if (this._frustumCulling && !this._meshInFrustum(child as Mesh)) continue
        this.meshes.push(child as Mesh)
      } else if ((child as any).isLine) {
        if (this._frustumCulling && !this._meshInFrustum(child as any)) continue
        this.lines.push(child as Line)
      } else if ((child as any).intensity !== undefined) {
        // Lights are never culled
        if ((child as any).shadow) {
          this.directionalLights.push(child as DirectionalLight)
        } else {
          this.ambientLights.push(child as AmbientLight)
        }
      }

      // Recurse into children (always — a parent being culled doesn't cull children,
      // since children may have their own geometry extending into view)
      if (child.children.length > 0) {
        this._traverseChildren(child._worldMatrix, child.children)
      }
    }
  }

  /** Test a mesh/line's bounding sphere against the frustum in world space. */
  private _meshInFrustum(obj: {
    geometry: { boundingSphere: BoundingSphere | null; positions: Float32Array | null; computeBoundingSphere(): void }
    _worldMatrix: Float32Array
  }): boolean {
    const geo = obj.geometry
    if (!geo.boundingSphere) {
      geo.computeBoundingSphere()
    }
    const bs = geo.boundingSphere!
    const m = obj._worldMatrix

    // Transform bounding sphere center to world space
    const lx = bs.cx,
      ly = bs.cy,
      lz = bs.cz
    const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12]
    const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13]
    const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14]

    // Scale the radius by the maximum axis scale of the world matrix
    const sx = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2])
    const sy = Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6])
    const sz = Math.sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10])
    const maxScale = Math.max(sx, sy, sz)

    return sphereInFrustum(this._frustumPlanes, wx, wy, wz, bs.radius * maxScale)
  }
}
