// Mesh class for nanothree

import { Object3D } from './core'

import type { BufferGeometry } from './geometry'
import type { MeshLambertMaterial } from './material'
import type { ShaderMaterial } from './shader-material'

export type MeshMaterial = MeshLambertMaterial | ShaderMaterial

export class Mesh extends Object3D {
  readonly isMesh = true

  constructor(
    public geometry: BufferGeometry,
    public material: MeshMaterial,
  ) {
    super()
  }
}
