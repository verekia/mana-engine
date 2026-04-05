// Material classes for nanothree

import { Color } from './core'

export const FrontSide = 0
export const BackSide = 1
export const DoubleSide = 2
export type Side = typeof FrontSide | typeof BackSide | typeof DoubleSide

/** GPU texture wrapper for nanothree. */
export class NanoTexture {
  _gpuTexture: GPUTexture | null = null
  _gpuView: GPUTextureView | null = null
  _device: GPUDevice | null = null
  _dirty = true

  constructor(public image: ImageBitmap | HTMLImageElement | null = null) {}

  _ensureGPU(device: GPUDevice) {
    if (!this._dirty && this._device === device) return
    if (!this.image) return
    this._device = device

    const w = this.image.width
    const h = this.image.height

    if (this._gpuTexture) this._gpuTexture.destroy()
    this._gpuTexture = device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this._gpuView = this._gpuTexture.createView()

    device.queue.copyExternalImageToTexture({ source: this.image }, { texture: this._gpuTexture }, [w, h])
    this._dirty = false
  }

  dispose() {
    this._gpuTexture?.destroy()
    this._gpuTexture = null
    this._gpuView = null
    this._device = null
  }
}

export class MeshLambertMaterial {
  color: Color
  wireframe: boolean
  side: Side
  /** When true, per-vertex colors from the geometry are used (multiplied with material color). */
  vertexColors: boolean
  /** Albedo/diffuse texture map. When set, texture color is multiplied with material color. */
  map: NanoTexture | null = null

  // GPU bind group for texture (lazily created)
  _textureBindGroup: GPUBindGroup | null = null
  _textureDirty = true

  constructor(params?: {
    color?: Color | number
    wireframe?: boolean
    side?: Side
    map?: NanoTexture
    vertexColors?: boolean
  }) {
    if (params?.color instanceof Color) {
      this.color = params.color
    } else if (typeof params?.color === 'number') {
      this.color = new Color(params.color)
    } else {
      this.color = new Color(0xffffff)
    }
    this.wireframe = params?.wireframe ?? false
    this.side = params?.side ?? FrontSide
    this.vertexColors = params?.vertexColors ?? false
    if (params?.map) this.map = params.map
  }

  get hasTexture(): boolean {
    return this.map !== null && this.map.image !== null
  }

  dispose() {
    this.map?.dispose()
    this._textureBindGroup = null
  }
}

export class MeshBasicMaterial {
  readonly isBasic = true
  color: Color
  wireframe: boolean
  side: Side
  /** When true, per-vertex colors from the geometry are used (multiplied with material color). */
  vertexColors: boolean

  constructor(params?: { color?: Color | number; wireframe?: boolean; side?: Side; vertexColors?: boolean }) {
    if (params?.color instanceof Color) {
      this.color = params.color
    } else if (typeof params?.color === 'number') {
      this.color = new Color(params.color)
    } else {
      this.color = new Color(0xffffff)
    }
    this.wireframe = params?.wireframe ?? false
    this.side = params?.side ?? FrontSide
    this.vertexColors = params?.vertexColors ?? false
  }

  dispose() {}
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
