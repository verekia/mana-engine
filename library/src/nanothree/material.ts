// Material classes for nanothree

import { Color } from './core'

export const FrontSide = 0
export const BackSide = 1
export const DoubleSide = 2
export type Side = typeof FrontSide | typeof BackSide | typeof DoubleSide

export class MeshLambertMaterial {
  color: Color
  wireframe: boolean
  side: Side

  constructor(params?: { color?: Color | number; wireframe?: boolean; side?: Side }) {
    if (params?.color instanceof Color) {
      this.color = params.color
    } else if (typeof params?.color === 'number') {
      this.color = new Color(params.color)
    } else {
      this.color = new Color(0xffffff)
    }
    this.wireframe = params?.wireframe ?? false
    this.side = params?.side ?? FrontSide
  }

  dispose() {
    // No GPU resources to free for materials
  }
}

export class LineBasicMaterial {
  color: Color

  constructor(params?: { color?: Color | number }) {
    if (params?.color instanceof Color) {
      this.color = params.color
    } else if (typeof params?.color === 'number') {
      this.color = new Color(params.color)
    } else {
      this.color = new Color(0xffffff)
    }
  }

  dispose() {}
}
