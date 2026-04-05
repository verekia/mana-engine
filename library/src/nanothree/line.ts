// Line class for nanothree

import { Object3D } from './core'

import type { BufferGeometry } from './geometry'
import type { LineBasicMaterial } from './material'

export class Line extends Object3D {
  readonly isLine = true

  constructor(
    public geometry: BufferGeometry,
    public material: LineBasicMaterial,
  ) {
    super()
  }
}
