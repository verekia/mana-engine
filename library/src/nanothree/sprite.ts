// Sprite (billboard quad) + SpriteMaterial for nanothree

import { Color, Object3D } from './core'

export const NormalBlending = 0
export const AdditiveBlending = 1
export type Blending = typeof NormalBlending | typeof AdditiveBlending

export class SpriteMaterial {
  color: Color
  opacity: number
  transparent: boolean
  blending: Blending

  constructor(params?: { color?: Color | number; opacity?: number; transparent?: boolean; blending?: Blending }) {
    if (params?.color instanceof Color) {
      this.color = params.color
    } else if (typeof params?.color === 'number') {
      this.color = new Color(params.color)
    } else {
      this.color = new Color(0xffffff)
    }
    this.opacity = params?.opacity ?? 1
    this.transparent = params?.transparent ?? false
    this.blending = params?.blending ?? NormalBlending
  }

  dispose() {}
}

export class Sprite extends Object3D {
  readonly isSprite = true

  constructor(public material: SpriteMaterial) {
    super()
  }
}
