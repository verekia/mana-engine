// Scene class for nanothree

import { Object3D } from './core'
import { mat4Identity } from './math'

import type { AmbientLight, DirectionalLight } from './light'
import type { Line } from './line'
import type { Mesh } from './mesh'

export class Scene extends Object3D {
  // Flat lists rebuilt each frame by updateMatrixWorld()
  readonly meshes: Mesh[] = []
  readonly lines: Line[] = []
  readonly ambientLights: AmbientLight[] = []
  readonly directionalLights: DirectionalLight[] = []

  constructor() {
    super()
    // Scene's own world matrix is always identity
    mat4Identity(this._worldMatrix)
  }

  /**
   * Recursively traverse the scene graph in a single pass:
   * 1. Compute world matrices (parent × local)
   * 2. Classify renderables into flat arrays
   *
   * Called by the renderer once per frame before drawing.
   */
  updateMatrixWorld() {
    this.meshes.length = 0
    this.lines.length = 0
    this.ambientLights.length = 0
    this.directionalLights.length = 0
    this._traverseChildren(this._worldMatrix, this.children)
  }

  private _traverseChildren(parentWorld: Float32Array, children: Object3D[]) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (!child.visible) continue

      child._updateWorldMatrix(parentWorld)

      // Classify
      if ((child as any).isMesh) {
        this.meshes.push(child as Mesh)
      } else if ((child as any).isLine) {
        this.lines.push(child as Line)
      } else if ((child as any).intensity !== undefined) {
        if ((child as any).shadow) {
          this.directionalLights.push(child as DirectionalLight)
        } else {
          this.ambientLights.push(child as AmbientLight)
        }
      }

      // Recurse into children
      if (child.children.length > 0) {
        this._traverseChildren(child._worldMatrix, child.children)
      }
    }
  }
}
