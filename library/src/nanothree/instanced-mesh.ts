// InstancedMesh — renders many copies of one geometry with per-instance transforms and colors.
// Mirrors Three.js InstancedMesh API: setMatrixAt / getMatrixAt / setColorAt / getColorAt.

import { Object3D } from './core'

import type { Color } from './core'
import type { BufferGeometry } from './geometry'
import type { MeshMaterial } from './mesh'

// Instance data layout (WGSL-aligned):
//   struct InstanceData { model: mat4x4f, color: vec4f }   → 80 bytes / 20 floats per instance
const INSTANCE_FLOATS = 20
const INSTANCE_BYTES = INSTANCE_FLOATS * 4

export class InstancedMesh extends Object3D {
  readonly isInstancedMesh = true

  readonly instanceMatrix: Float32Array
  instanceColor: Float32Array | null = null
  count: number

  // GPU resources (managed by _ensureGPU, called by renderer before draw)
  _instanceBuffer: GPUBuffer | null = null
  _instanceBindGroup: GPUBindGroup | null = null
  _instanceDirty = true
  private _instanceStaging: Float32Array
  private _maxCount: number

  constructor(
    public geometry: BufferGeometry,
    public material: MeshMaterial,
    count: number,
  ) {
    super()
    this._maxCount = count
    this.count = count
    this.instanceMatrix = new Float32Array(count * 16)
    // Initialize all instance matrices to identity
    for (let i = 0; i < count; i++) {
      const off = i * 16
      this.instanceMatrix[off] = 1
      this.instanceMatrix[off + 5] = 1
      this.instanceMatrix[off + 10] = 1
      this.instanceMatrix[off + 15] = 1
    }
    this._instanceStaging = new Float32Array(count * INSTANCE_FLOATS)
  }

  setMatrixAt(index: number, matrix: Float32Array) {
    this.instanceMatrix.set(matrix, index * 16)
    this._instanceDirty = true
  }

  getMatrixAt(index: number, target: Float32Array) {
    const off = index * 16
    for (let i = 0; i < 16; i++) target[i] = this.instanceMatrix[off + i]
  }

  setColorAt(index: number, color: Color) {
    if (!this.instanceColor) {
      this.instanceColor = new Float32Array(this._maxCount * 3)
    }
    const off = index * 3
    this.instanceColor[off] = color.r
    this.instanceColor[off + 1] = color.g
    this.instanceColor[off + 2] = color.b
    this._instanceDirty = true
  }

  getColorAt(index: number, target: Color) {
    if (!this.instanceColor) return
    const off = index * 3
    target.r = this.instanceColor[off]
    target.g = this.instanceColor[off + 1]
    target.b = this.instanceColor[off + 2]
  }

  /** Create / update GPU instance buffer and bind group. Called by renderer before draw. */
  _ensureGPU(device: GPUDevice, layout: GPUBindGroupLayout) {
    if (!this._instanceDirty && this._instanceBuffer) return

    const n = this.count
    for (let i = 0; i < n; i++) {
      const src = i * 16
      const dst = i * INSTANCE_FLOATS
      this._instanceStaging.set(this.instanceMatrix.subarray(src, src + 16), dst)
      if (this.instanceColor) {
        const c = i * 3
        this._instanceStaging[dst + 16] = this.instanceColor[c]
        this._instanceStaging[dst + 17] = this.instanceColor[c + 1]
        this._instanceStaging[dst + 18] = this.instanceColor[c + 2]
        this._instanceStaging[dst + 19] = 1 // alpha > 0 → use per-instance color
      } else {
        this._instanceStaging[dst + 16] = 0
        this._instanceStaging[dst + 17] = 0
        this._instanceStaging[dst + 18] = 0
        this._instanceStaging[dst + 19] = 0 // alpha = 0 → use material color
      }
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
