// Custom WGSL shader material for nanothree
//
// The renderer auto-prepends PREAMBLE before your code, giving you access to:
//   scene.viewProj, scene.lightDir, scene.ambient, scene.lightColor
//   objectData.model, objectData.color
//
// Your code provides @vertex fn vs(...) and @fragment fn fs(...).
// Use @group(2) for your own custom uniforms.
//
// Vertex inputs are always:
//   @location(0) position: vec3f
//   @location(1) normal: vec3f

import { Color } from './core'

export const SHADER_PREAMBLE = /* wgsl */ `
struct Scene {
  viewProj: mat4x4f,
  lightDir: vec4f,
  ambient: vec4f,
  lightColor: vec4f,
  lightViewProj: mat4x4f,
  shadowParams: vec4f,  // x: enabled, y: bias, z: texelSize
}

struct ObjectData {
  model: mat4x4f,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<storage, read> objectData: ObjectData;
`

export interface ShaderMaterialParams {
  code: string
  uniforms?: Float32Array
  color?: Color | number
  wireframe?: boolean
}

export class ShaderMaterial {
  readonly isShaderMaterial = true

  color: Color
  wireframe: boolean
  readonly code: string
  readonly uniforms: Float32Array | null

  // GPU resources managed by the renderer
  _uniformBuffer: GPUBuffer | null = null
  _uniformBindGroup: GPUBindGroup | null = null
  _device: GPUDevice | null = null

  constructor(params: ShaderMaterialParams) {
    this.code = params.code
    this.uniforms = params.uniforms ?? null
    this.wireframe = params.wireframe ?? false

    if (params.color instanceof Color) {
      this.color = params.color
    } else if (typeof params.color === 'number') {
      this.color = new Color(params.color)
    } else {
      this.color = new Color(1, 1, 1)
    }
  }

  // Full WGSL including the auto-prepended preamble
  get fullCode(): string {
    return SHADER_PREAMBLE + this.code
  }

  // Cache key for pipeline lookup (code content + uniforms presence)
  get _cacheKey(): string {
    return this.code + (this.uniforms ? '\0:u' : '\0:n') + (this.wireframe ? '\0:w' : '\0:s')
  }

  _ensureGPU(device: GPUDevice, uniformLayout: GPUBindGroupLayout) {
    if (!this.uniforms) return

    if (!this._uniformBuffer || this._device !== device) {
      this._device = device
      if (this._uniformBuffer) this._uniformBuffer.destroy()

      // Pad to 16 bytes minimum (WebGPU requirement)
      const size = Math.max(this.uniforms.byteLength, 16)
      this._uniformBuffer = device.createBuffer({
        size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
      this._uniformBindGroup = device.createBindGroup({
        layout: uniformLayout,
        entries: [{ binding: 0, resource: { buffer: this._uniformBuffer } }],
      })
    }

    // Upload uniform data every frame (user mutates the Float32Array directly)
    device.queue.writeBuffer(this._uniformBuffer, 0, this.uniforms)
  }

  dispose() {
    this._uniformBuffer?.destroy()
    this._uniformBuffer = null
    this._uniformBindGroup = null
    this._device = null
  }
}
