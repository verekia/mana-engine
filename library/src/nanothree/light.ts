// Light classes for nanothree

import { Object3D, Color } from './core'

export class AmbientLight extends Object3D {
  color: Color
  intensity: number

  constructor(color: number | Color = 0xffffff, intensity = 1) {
    super()
    this.color = color instanceof Color ? color : new Color(color)
    this.intensity = intensity
  }
}

export class ShadowMapSize {
  width = 2048
  height = 2048
  set(w: number, h: number) {
    this.width = w
    this.height = h
  }
}

export class ShadowCamera {
  near = 0.5
  far = 200
  left = -60
  right = 60
  top = 60
  bottom = -60
}

export class DirectionalLight extends Object3D {
  color: Color
  intensity: number
  readonly shadow = {
    mapSize: new ShadowMapSize(),
    camera: new ShadowCamera(),
  }

  constructor(color: number | Color = 0xffffff, intensity = 1) {
    super()
    this.color = color instanceof Color ? color : new Color(color)
    this.intensity = intensity
  }
}
