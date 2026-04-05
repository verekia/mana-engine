// InstancedSprite — renders many camera-facing billboard quads in a single draw call.
// Per-instance data is lightweight: position(3) + size(1) + color(3) + alpha(1) = 8 floats.
// Billboarding is computed on the GPU using camera right/up vectors from scene uniforms.

import { Object3D } from './core'

import type { Color } from './core'
import type { Blending } from './sprite'

// Instance data layout (WGSL-aligned):
//   struct SpriteInstance { position: vec3f, size: f32, color: vec3f, alpha: f32 }
//   → 32 bytes / 8 floats per instance
const INSTANCE_FLOATS = 8
const INSTANCE_BYTES = INSTANCE_FLOATS * 4

export class InstancedSprite extends Object3D {
  readonly isInstancedSprite = true

  count: number
  blending: Blending

  // Per-instance typed arrays (positions[i*3..i*3+2], sizes[i], colors[i*3..i*3+2], alphas[i])
  readonly positions: Float32Array
  readonly sizes: Float32Array
  readonly colors: Float32Array
  readonly alphas: Float32Array

  // GPU resources (managed by _ensureGPU, called by renderer before draw)
  _instanceBuffer: GPUBuffer | null = null
  _instanceBindGroup: GPUBindGroup | null = null
  _instanceDirty = true
  private _instanceStaging: Float32Array
  private _maxCount: number

  constructor(count: number, blending: Blending = 0) {
    super()
    this._maxCount = count
    this.count = count
    this.blending = blending
    this.positions = new Float32Array(count * 3)
    this.sizes = new Float32Array(count)
    this.colors = new Float32Array(count * 3)
    this.alphas = new Float32Array(count)
    this._instanceStaging = new Float32Array(count * INSTANCE_FLOATS)
  }

  setPositionAt(index: number, x: number, y: number, z: number) {
    const off = index * 3
    this.positions[off] = x
    this.positions[off + 1] = y
    this.positions[off + 2] = z
    this._instanceDirty = true
  }

  setSizeAt(index: number, size: number) {
    this.sizes[index] = size
    this._instanceDirty = true
  }

  setColorAt(index: number, color: Color) {
    const off = index * 3
    this.colors[off] = color.r
    this.colors[off + 1] = color.g
    this.colors[off + 2] = color.b
    this._instanceDirty = true
  }

  setAlphaAt(index: number, alpha: number) {
    this.alphas[index] = alpha
    this._instanceDirty = true
  }

  /** Create / update GPU instance buffer and bind group. Called by renderer before draw. */
  _ensureGPU(device: GPUDevice, layout: GPUBindGroupLayout) {
    if (!this._instanceDirty && this._instanceBuffer) return

    const n = this.count
    for (let i = 0; i < n; i++) {
      const src3 = i * 3
      const dst = i * INSTANCE_FLOATS
      this._instanceStaging[dst] = this.positions[src3]
      this._instanceStaging[dst + 1] = this.positions[src3 + 1]
      this._instanceStaging[dst + 2] = this.positions[src3 + 2]
      this._instanceStaging[dst + 3] = this.sizes[i]
      this._instanceStaging[dst + 4] = this.colors[src3]
      this._instanceStaging[dst + 5] = this.colors[src3 + 1]
      this._instanceStaging[dst + 6] = this.colors[src3 + 2]
      this._instanceStaging[dst + 7] = this.alphas[i]
    }

    const bufSize = this._maxCount * INSTANCE_BYTES
    if (!this._instanceBuffer) {
      this._instanceBuffer = device.createBuffer({
        size: bufSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
      this._instanceBindGroup = device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer: this._instanceBuffer } }],
      })
    }

    device.queue.writeBuffer(this._instanceBuffer, 0, this._instanceStaging.buffer, 0, n * INSTANCE_BYTES)
    this._instanceDirty = false
  }

  dispose() {
    this._instanceBuffer?.destroy()
    this._instanceBuffer = null
    this._instanceBindGroup = null
  }
}
