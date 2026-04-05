// High-performance WebGPU renderer for nanothree
//
// Render pipeline:
// 1. Shadow depth pass (depth-only from light's perspective)
// 2. Main color pass:
//    a. Solid meshes (triangle-list, Lambert + shadow sampling)
//    b. Wireframe meshes (line-list, Lambert lit)
//    c. Custom shader meshes (per-ShaderMaterial WGSL)
//    d. Lines (line-list, unlit flat color)

import { PlaneGeometry } from './geometry'
import { BackSide, DoubleSide, MeshBasicMaterial } from './material'
import { mat4Ortho, mat4LookAt, mat4Multiply } from './math'
import { ShaderMaterial } from './shader-material'
import { AdditiveBlending } from './sprite'

import type { PerspectiveCamera } from './core'
import type { BufferGeometry } from './geometry'
import type { InstancedMesh } from './instanced-mesh'
import type { InstancedSprite } from './instanced-sprite'
import type { Line } from './line'
import type { MeshLambertMaterial } from './material'
import type { Mesh } from './mesh'
import type { Scene } from './scene'
import type { Sprite } from './sprite'

// ─── Shadow depth pass shader (vertex-only) ───────────────────────────

const SHADOW_SHADER = /* wgsl */ `
@group(0) @binding(0) var<uniform> lightViewProj: mat4x4f;

struct ObjectData { model: mat4x4f, color: vec4f }
@group(1) @binding(0) var<storage, read> objectData: ObjectData;

@vertex fn vs(
  @location(0) position: vec3f,
  @location(1) _normal: vec3f,
) -> @builtin(position) vec4f {
  return lightViewProj * objectData.model * vec4f(position, 1.0);
}
`

// ─── Main mesh shader (Lambert + shadow map) ──────────────────────────

const MESH_SHADER = /* wgsl */ `
struct Scene {
  viewProj: mat4x4f,
  lightDir: vec4f,
  ambient: vec4f,
  lightColor: vec4f,
  lightViewProj: mat4x4f,
  shadowParams: vec4f,
}

struct ObjectData { model: mat4x4f, color: vec4f }

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<storage, read> objectData: ObjectData;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec3f,
  @location(2) shadowCoord: vec3f,
}

@vertex fn vs(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
) -> VSOut {
  let worldPos = objectData.model * vec4f(position, 1.0);
  let lightClip = scene.lightViewProj * worldPos;
  var out: VSOut;
  out.pos = scene.viewProj * worldPos;
  out.normal = normalize((objectData.model * vec4f(normal, 0.0)).xyz);
  out.color = objectData.color.rgb;
  out.shadowCoord = vec3f(
    lightClip.x * 0.5 + 0.5,
    lightClip.y * -0.5 + 0.5,
    lightClip.z,
  );
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  let light = max(dot(n, scene.lightDir.xyz), 0.0);

  var shadow = 1.0;
  if (scene.shadowParams.x > 0.0) {
    let bias = scene.shadowParams.y;
    let texel = scene.shadowParams.z;
    let c = in.shadowCoord;
    // 4-tap PCF (hardware bilinear comparison gives effective 4x4)
    shadow = (
      textureSampleCompare(shadowMap, shadowSampler, c.xy + vec2f(-texel, -texel), c.z - bias) +
      textureSampleCompare(shadowMap, shadowSampler, c.xy + vec2f( texel, -texel), c.z - bias) +
      textureSampleCompare(shadowMap, shadowSampler, c.xy + vec2f(-texel,  texel), c.z - bias) +
      textureSampleCompare(shadowMap, shadowSampler, c.xy + vec2f( texel,  texel), c.z - bias)
    ) * 0.25;
  }

  let color = in.color * (scene.ambient.rgb + scene.lightColor.rgb * light * shadow);
  return vec4f(color, 1.0);
}
`

// ─── Line shader (unlit, no shadows) ──────────────────────────────────

const LINE_SHADER = /* wgsl */ `
struct Scene {
  viewProj: mat4x4f,
  lightDir: vec4f,
  ambient: vec4f,
  lightColor: vec4f,
}

struct ObjectData { model: mat4x4f, color: vec4f }

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<storage, read> objectData: ObjectData;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
}

@vertex fn vs(
  @location(0) position: vec3f,
  @location(1) _normal: vec3f,
) -> VSOut {
  var out: VSOut;
  out.pos = scene.viewProj * objectData.model * vec4f(position, 1.0);
  out.color = objectData.color.rgb;
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(in.color, 1.0);
}
`

// ─── Sprite shader (unlit, alpha blending) ───────────────────────────

const SPRITE_SHADER = /* wgsl */ `
struct Scene {
  viewProj: mat4x4f,
  lightDir: vec4f,
  ambient: vec4f,
  lightColor: vec4f,
}

struct ObjectData { model: mat4x4f, color: vec4f }

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<storage, read> objectData: ObjectData;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
}

@vertex fn vs(
  @location(0) position: vec3f,
  @location(1) _normal: vec3f,
) -> VSOut {
  var out: VSOut;
  out.pos = scene.viewProj * objectData.model * vec4f(position, 1.0);
  out.color = objectData.color;
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return in.color;
}
`

// ─── Instanced mesh shader (Lambert + shadow + per-instance transform/color) ─

const INSTANCED_MESH_SHADER = /* wgsl */ `
struct Scene {
  viewProj: mat4x4f,
  lightDir: vec4f,
  ambient: vec4f,
  lightColor: vec4f,
  lightViewProj: mat4x4f,
  shadowParams: vec4f,
}

struct ObjectData { model: mat4x4f, color: vec4f }
struct InstanceData { model: mat4x4f, color: vec4f }

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<storage, read> objectData: ObjectData;
@group(2) @binding(0) var<storage, read> instances: array<InstanceData>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec3f,
  @location(2) shadowCoord: vec3f,
}

@vertex fn vs(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @builtin(instance_index) iid: u32,
) -> VSOut {
  let inst = instances[iid];
  let worldModel = objectData.model * inst.model;
  let worldPos = worldModel * vec4f(position, 1.0);
  let lightClip = scene.lightViewProj * worldPos;
  var out: VSOut;
  out.pos = scene.viewProj * worldPos;
  out.normal = normalize((worldModel * vec4f(normal, 0.0)).xyz);
  out.color = select(objectData.color.rgb, inst.color.rgb, inst.color.a > 0.0);
  out.shadowCoord = vec3f(
    lightClip.x * 0.5 + 0.5,
    lightClip.y * -0.5 + 0.5,
    lightClip.z,
  );
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  let light = max(dot(n, scene.lightDir.xyz), 0.0);

  var shadow = 1.0;
  if (scene.shadowParams.x > 0.0) {
    let bias = scene.shadowParams.y;
    let texel = scene.shadowParams.z;
    let c = in.shadowCoord;
    shadow = (
      textureSampleCompare(shadowMap, shadowSampler, c.xy + vec2f(-texel, -texel), c.z - bias) +
      textureSampleCompare(shadowMap, shadowSampler, c.xy + vec2f( texel, -texel), c.z - bias) +
      textureSampleCompare(shadowMap, shadowSampler, c.xy + vec2f(-texel,  texel), c.z - bias) +
      textureSampleCompare(shadowMap, shadowSampler, c.xy + vec2f( texel,  texel), c.z - bias)
    ) * 0.25;
  }

  let color = in.color * (scene.ambient.rgb + scene.lightColor.rgb * light * shadow);
  return vec4f(color, 1.0);
}
`

// ─── Instanced shadow shader ─────────────────────────────────────────

const INSTANCED_SHADOW_SHADER = /* wgsl */ `
struct ObjectData { model: mat4x4f, color: vec4f }
struct InstanceData { model: mat4x4f, color: vec4f }

@group(0) @binding(0) var<uniform> lightViewProj: mat4x4f;
@group(1) @binding(0) var<storage, read> objectData: ObjectData;
@group(2) @binding(0) var<storage, read> instances: array<InstanceData>;

@vertex fn vs(
  @location(0) position: vec3f,
  @location(1) _normal: vec3f,
  @builtin(instance_index) iid: u32,
) -> @builtin(position) vec4f {
  return lightViewProj * objectData.model * instances[iid].model * vec4f(position, 1.0);
}
`

// ─── Instanced sprite shader (GPU billboard + per-instance pos/size/color) ───

const INSTANCED_SPRITE_SHADER = /* wgsl */ `
struct Scene {
  viewProj: mat4x4f,
  lightDir: vec4f,
  ambient: vec4f,
  lightColor: vec4f,
  lightViewProj: mat4x4f,
  shadowParams: vec4f,
  cameraRight: vec4f,
  cameraUp: vec4f,
}

struct ObjectData { model: mat4x4f, color: vec4f }
struct SpriteInstance { position: vec3f, size: f32, color: vec3f, alpha: f32 }

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<storage, read> objectData: ObjectData;
@group(2) @binding(0) var<storage, read> instances: array<SpriteInstance>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
}

@vertex fn vs(
  @location(0) quadPos: vec3f,
  @location(1) _normal: vec3f,
  @builtin(instance_index) iid: u32,
) -> VSOut {
  let inst = instances[iid];
  // Extract uniform scale from model matrix (length of first column)
  let col0 = objectData.model[0].xyz;
  let parentScale = length(col0);
  let worldSize = inst.size * parentScale;
  let worldPos = (objectData.model * vec4f(inst.position, 1.0)).xyz
    + scene.cameraRight.xyz * quadPos.x * worldSize
    + scene.cameraUp.xyz    * quadPos.y * worldSize;
  var out: VSOut;
  out.pos = scene.viewProj * vec4f(worldPos, 1.0);
  out.color = vec4f(inst.color, inst.alpha);
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return in.color;
}
`

// ─── Constants ────────────────────────────────────────────────────────

const OBJECT_FLOATS = 20
const INITIAL_CAPACITY = 1024
const SHADOW_MAP_SIZE = 2048
const SHADOW_BIAS = 0.003

// viewProj(16) + lightDir(4) + ambient(4) + lightColor(4) + lightViewProj(16) + shadowParams(4)
// + cameraRight(4) + cameraUp(4) = 56
const SCENE_FLOATS = 56

const VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 24,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' as GPUVertexFormat },
    { shaderLocation: 1, offset: 12, format: 'float32x3' as GPUVertexFormat },
  ],
}

const DEPTH_STENCIL: GPUDepthStencilState = {
  format: 'depth24plus',
  depthWriteEnabled: true,
  depthCompare: 'less',
}

const SHADOW_DEPTH_STENCIL: GPUDepthStencilState = {
  format: 'depth32float',
  depthWriteEnabled: true,
  depthCompare: 'less',
}

// ─── Renderer ─────────────────────────────────────────────────────────

export class WebGPURenderer {
  private device!: GPUDevice
  private context!: GPUCanvasContext
  private canvas: HTMLCanvasElement
  private format!: GPUTextureFormat

  // Built-in pipelines (one per cullMode for solid meshes)
  private meshPipeline!: GPURenderPipeline // FrontSide: cull back
  private meshPipelineFront!: GPURenderPipeline // BackSide: cull front
  private meshPipelineDouble!: GPURenderPipeline // DoubleSide: cull none
  // Unlit (basic) mesh pipelines — same shader as lines but triangle topology
  private basicPipeline!: GPURenderPipeline
  private basicPipelineFront!: GPURenderPipeline
  private basicPipelineDouble!: GPURenderPipeline
  private wireframePipeline!: GPURenderPipeline
  private linePipeline!: GPURenderPipeline
  // Sprite pipelines (alpha-blended, depth-write off)
  private spriteNormalPipeline!: GPURenderPipeline
  private spriteAdditivePipeline!: GPURenderPipeline
  private spriteGeometry: PlaneGeometry | null = null
  // Instanced mesh pipelines
  private instancedMeshPipeline!: GPURenderPipeline
  private instancedMeshPipelineFront!: GPURenderPipeline
  private instancedMeshPipelineDouble!: GPURenderPipeline
  private instancedShadowPipeline!: GPURenderPipeline
  private instanceLayout!: GPUBindGroupLayout
  private instancedPipelineLayout!: GPUPipelineLayout
  private instancedShadowPipelineLayout!: GPUPipelineLayout
  // Instanced sprite pipelines (GPU billboard, alpha-blended)
  private instancedSpriteNormalPipeline!: GPURenderPipeline
  private instancedSpriteAdditivePipeline!: GPURenderPipeline

  // Main depth buffer
  private depthTexture!: GPUTexture
  private depthView!: GPUTextureView
  private depthW = 0
  private depthH = 0

  // Buffers
  private sceneBuffer!: GPUBuffer
  private objectBuffer!: GPUBuffer

  // Main pass bind groups / layouts
  private sceneLayout!: GPUBindGroupLayout
  private objectLayout!: GPUBindGroupLayout
  private sceneBindGroup!: GPUBindGroup
  private objectBindGroup!: GPUBindGroup

  // Pipeline layouts
  private standardPipelineLayout!: GPUPipelineLayout
  private customUniformLayout!: GPUBindGroupLayout
  private customPipelineLayout!: GPUPipelineLayout

  // Shadow mapping
  private shadowMapTexture!: GPUTexture
  private shadowMapView!: GPUTextureView
  private shadowSampler!: GPUSampler
  private shadowLightBuffer!: GPUBuffer
  private shadowSceneLayout!: GPUBindGroupLayout
  private shadowSceneBindGroup!: GPUBindGroup
  private shadowPipelineLayout!: GPUPipelineLayout
  private shadowPipeline!: GPURenderPipeline
  private shadowPassDesc!: GPURenderPassDescriptor
  private lightProj = new Float32Array(16)
  private lightView = new Float32Array(16)
  private lightVP = new Float32Array(16)

  // Custom shader pipeline cache
  private customPipelineCache = new Map<string, GPURenderPipeline>()

  // Dynamic offset stride
  private objectStride = 256
  private objectFloatStride = 64

  // Pre-allocated CPU staging
  private sceneData = new Float32Array(SCENE_FLOATS)
  private objectStaging!: Float32Array
  private capacity = INITIAL_CAPACITY

  // Render pass descriptors (reused every frame)
  private colorAtt: GPURenderPassColorAttachment
  private depthAtt: GPURenderPassDepthStencilAttachment
  private passDesc: GPURenderPassDescriptor

  shadowMap = { enabled: false }

  /** Per-frame render statistics, updated after each render() call. */
  info = { drawCalls: 0, triangles: 0 }

  constructor(params: { canvas: HTMLCanvasElement; antialias?: boolean }) {
    this.canvas = params.canvas
    this.colorAtt = {
      view: undefined as unknown as GPUTextureView,
      clearValue: { r: 0.05, g: 0.05, b: 0.07, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }
    this.depthAtt = {
      view: undefined as unknown as GPUTextureView,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    }
    this.passDesc = {
      colorAttachments: [this.colorAtt],
      depthStencilAttachment: this.depthAtt,
    }
  }

  get domElement() {
    return this.canvas
  }

  async init() {
    if (!navigator.gpu) throw new Error('WebGPU not supported')
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('No WebGPU adapter found')
    this.device = (await adapter.requestDevice()) as GPUDevice

    this.context = this.canvas.getContext('webgpu')!
    this.format = navigator.gpu.getPreferredCanvasFormat()

    const dpr = window.devicePixelRatio
    this.canvas.width = (this.canvas.clientWidth * dpr) | 0
    this.canvas.height = (this.canvas.clientHeight * dpr) | 0
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' })

    const align = this.device.limits.minStorageBufferOffsetAlignment
    this.objectStride = Math.ceil((OBJECT_FLOATS * 4) / align) * align
    this.objectFloatStride = this.objectStride / 4
    this.objectStaging = new Float32Array(INITIAL_CAPACITY * this.objectFloatStride)

    this.createBindGroupLayouts()
    this.createShadowResources()
    this.createBuiltinPipelines()
    this.createBuffers(INITIAL_CAPACITY)
    this.createBindGroups()
    this.ensureDepthTexture()
  }

  private createBindGroupLayouts() {
    this.sceneLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
      ],
    })
    this.objectLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage', hasDynamicOffset: true },
        },
      ],
    })
    this.customUniformLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    })
    this.shadowSceneLayout = this.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    })

    this.standardPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.sceneLayout, this.objectLayout],
    })
    this.customPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.sceneLayout, this.objectLayout, this.customUniformLayout],
    })
    this.shadowPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.shadowSceneLayout, this.objectLayout],
    })
    this.instanceLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    })
    this.instancedPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.sceneLayout, this.objectLayout, this.instanceLayout],
    })
    this.instancedShadowPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.shadowSceneLayout, this.objectLayout, this.instanceLayout],
    })
  }

  private createShadowResources() {
    this.shadowMapTexture = this.device.createTexture({
      size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.shadowMapView = this.shadowMapTexture.createView()

    this.shadowSampler = this.device.createSampler({
      compare: 'less',
      magFilter: 'linear',
      minFilter: 'linear',
    })

    this.shadowLightBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.shadowSceneBindGroup = this.device.createBindGroup({
      layout: this.shadowSceneLayout,
      entries: [{ binding: 0, resource: { buffer: this.shadowLightBuffer } }],
    })

    this.shadowPassDesc = {
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowMapView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    }

    const shadowModule = this.device.createShaderModule({ code: SHADOW_SHADER })
    this.shadowPipeline = this.device.createRenderPipeline({
      layout: this.shadowPipelineLayout,
      vertex: { module: shadowModule, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: SHADOW_DEPTH_STENCIL,
    })
  }

  private createBuiltinPipelines() {
    const meshShader = this.device.createShaderModule({ code: MESH_SHADER })
    const lineShader = this.device.createShaderModule({ code: LINE_SHADER })

    const meshPipelineDesc = (cullMode: GPUCullMode) => ({
      layout: this.standardPipelineLayout,
      vertex: { module: meshShader, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      fragment: { module: meshShader, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology, cullMode },
      depthStencil: DEPTH_STENCIL,
    })
    this.meshPipeline = this.device.createRenderPipeline(meshPipelineDesc('back'))
    this.meshPipelineFront = this.device.createRenderPipeline(meshPipelineDesc('front'))
    this.meshPipelineDouble = this.device.createRenderPipeline(meshPipelineDesc('none'))

    // Basic (unlit) mesh pipelines — same shader as lines but triangle topology
    const basicPipelineDesc = (cullMode: GPUCullMode) => ({
      layout: this.standardPipelineLayout,
      vertex: { module: lineShader, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      fragment: { module: lineShader, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology, cullMode },
      depthStencil: DEPTH_STENCIL,
    })
    this.basicPipeline = this.device.createRenderPipeline(basicPipelineDesc('back'))
    this.basicPipelineFront = this.device.createRenderPipeline(basicPipelineDesc('front'))
    this.basicPipelineDouble = this.device.createRenderPipeline(basicPipelineDesc('none'))
    this.wireframePipeline = this.device.createRenderPipeline({
      layout: this.standardPipelineLayout,
      vertex: { module: meshShader, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      fragment: { module: meshShader, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'line-list', cullMode: 'none' },
      depthStencil: DEPTH_STENCIL,
    })
    this.linePipeline = this.device.createRenderPipeline({
      layout: this.standardPipelineLayout,
      vertex: { module: lineShader, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      fragment: { module: lineShader, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'line-list', cullMode: 'none' },
      depthStencil: DEPTH_STENCIL,
    })

    // Sprite pipelines: alpha-blended, depth-write disabled, double-sided
    const spriteShader = this.device.createShaderModule({ code: SPRITE_SHADER })
    const SPRITE_DEPTH: GPUDepthStencilState = { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' }
    const spriteDesc = (blend: GPUBlendState) => ({
      layout: this.standardPipelineLayout,
      vertex: { module: spriteShader, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      fragment: { module: spriteShader, entryPoint: 'fs', targets: [{ format: this.format, blend }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology, cullMode: 'none' as GPUCullMode },
      depthStencil: SPRITE_DEPTH,
    })
    this.spriteNormalPipeline = this.device.createRenderPipeline(
      spriteDesc({
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      }),
    )
    this.spriteAdditivePipeline = this.device.createRenderPipeline(
      spriteDesc({
        color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      }),
    )

    // Instanced mesh pipelines (Lambert + per-instance transform/color)
    const instancedShader = this.device.createShaderModule({ code: INSTANCED_MESH_SHADER })
    const instancedDesc = (cullMode: GPUCullMode) => ({
      layout: this.instancedPipelineLayout,
      vertex: { module: instancedShader, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      fragment: { module: instancedShader, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology, cullMode },
      depthStencil: DEPTH_STENCIL,
    })
    this.instancedMeshPipeline = this.device.createRenderPipeline(instancedDesc('back'))
    this.instancedMeshPipelineFront = this.device.createRenderPipeline(instancedDesc('front'))
    this.instancedMeshPipelineDouble = this.device.createRenderPipeline(instancedDesc('none'))

    const instancedShadowShader = this.device.createShaderModule({ code: INSTANCED_SHADOW_SHADER })
    this.instancedShadowPipeline = this.device.createRenderPipeline({
      layout: this.instancedShadowPipelineLayout,
      vertex: { module: instancedShadowShader, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: SHADOW_DEPTH_STENCIL,
    })

    // Instanced sprite pipelines (GPU billboard, alpha-blended, depth-write off)
    const iSpriteShader = this.device.createShaderModule({ code: INSTANCED_SPRITE_SHADER })
    const iSpriteDesc = (blend: GPUBlendState) => ({
      layout: this.instancedPipelineLayout,
      vertex: { module: iSpriteShader, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      fragment: { module: iSpriteShader, entryPoint: 'fs', targets: [{ format: this.format, blend }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology, cullMode: 'none' as GPUCullMode },
      depthStencil: SPRITE_DEPTH,
    })
    this.instancedSpriteNormalPipeline = this.device.createRenderPipeline(
      iSpriteDesc({
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      }),
    )
    this.instancedSpriteAdditivePipeline = this.device.createRenderPipeline(
      iSpriteDesc({
        color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      }),
    )
  }

  private getOrCreateCustomPipeline(material: ShaderMaterial): GPURenderPipeline {
    const key = material._cacheKey
    const cached = this.customPipelineCache.get(key)
    if (cached) return cached

    const module = this.device.createShaderModule({ code: material.fullCode })
    const layout = material.uniforms ? this.customPipelineLayout : this.standardPipelineLayout
    const topology: GPUPrimitiveTopology = material.wireframe ? 'line-list' : 'triangle-list'
    const cullMode: GPUCullMode = material.wireframe ? 'none' : 'back'

    const pipeline = this.device.createRenderPipeline({
      layout,
      vertex: { module, entryPoint: 'vs', buffers: [VERTEX_BUFFER_LAYOUT] },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology, cullMode },
      depthStencil: DEPTH_STENCIL,
    })
    this.customPipelineCache.set(key, pipeline)
    return pipeline
  }

  private createBuffers(capacity: number) {
    this.sceneBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.objectBuffer = this.device.createBuffer({
      size: capacity * this.objectStride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
  }

  private createBindGroups() {
    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.sceneBuffer } },
        { binding: 1, resource: this.shadowMapView },
        { binding: 2, resource: this.shadowSampler },
      ],
    })
    this.objectBindGroup = this.device.createBindGroup({
      layout: this.objectLayout,
      entries: [{ binding: 0, resource: { buffer: this.objectBuffer, size: OBJECT_FLOATS * 4 } }],
    })
  }

  private ensureDepthTexture() {
    const w = this.canvas.width,
      h = this.canvas.height
    if (w === this.depthW && h === this.depthH) return
    this.depthW = w
    this.depthH = h
    if (this.depthTexture) this.depthTexture.destroy()
    this.depthTexture = this.device.createTexture({
      size: [w, h],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.depthView = this.depthTexture.createView()
  }

  private grow(needed: number) {
    let newCap = this.capacity
    while (newCap < needed) newCap *= 2
    this.capacity = newCap
    this.objectStaging = new Float32Array(newCap * this.objectFloatStride)
    this.objectBuffer.destroy()
    this.objectBuffer = this.device.createBuffer({
      size: newCap * this.objectStride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.objectBindGroup = this.device.createBindGroup({
      layout: this.objectLayout,
      entries: [{ binding: 0, resource: { buffer: this.objectBuffer, size: OBJECT_FLOATS * 4 } }],
    })
  }

  setSize(w: number, h: number, _updateStyle = true) {
    const dpr = window.devicePixelRatio
    this.canvas.width = (w * dpr) | 0
    this.canvas.height = (h * dpr) | 0
    this.ensureDepthTexture()
  }

  setPixelRatio(_r: number) {}

  /** Copy pre-computed world matrix + color into the object staging buffer. */
  private writeObjectData(idx: number, worldMatrix: Float32Array, cr: number, cg: number, cb: number) {
    const off = idx * this.objectFloatStride
    this.objectStaging.set(worldMatrix, off)
    this.objectStaging[off + 16] = cr
    this.objectStaging[off + 17] = cg
    this.objectStaging[off + 18] = cb
    this.objectStaging[off + 19] = 1
  }

  // ── Main render ───────────────────────────────────────────────────

  render(scene: Scene, camera: PerspectiveCamera) {
    this.info.drawCalls = 0
    this.info.triangles = 0

    // Resize early so VP uses the correct aspect ratio
    const dpr = window.devicePixelRatio
    const w = (this.canvas.clientWidth * dpr) | 0
    const h = (this.canvas.clientHeight * dpr) | 0
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      this.ensureDepthTexture()
    }

    // Compute VP before traversal so frustum culling can use it
    camera.updateViewProjection(w / h)

    // Single-pass traversal: compute world matrices + collect renderables + frustum cull
    scene.updateMatrixWorld(camera.viewProjection)

    const solidMeshes: Mesh[] = []
    const basicMeshes: Mesh[] = []
    const wireframeMeshes: Mesh[] = []
    const customMeshes: Mesh[] = []
    const lines: Line[] = []

    for (let i = 0; i < scene.meshes.length; i++) {
      const m = scene.meshes[i]
      if (m.material instanceof ShaderMaterial) customMeshes.push(m)
      else if (m.material instanceof MeshBasicMaterial) {
        if (m.material.wireframe) wireframeMeshes.push(m)
        else basicMeshes.push(m)
      } else if ((m.material as any).wireframe) wireframeMeshes.push(m)
      else solidMeshes.push(m)
    }
    for (let i = 0; i < scene.lines.length; i++) lines.push(scene.lines[i])

    // Split transparent sprites by blending mode (opaque sprites are ignored for now)
    const normalSprites: Sprite[] = []
    const additiveSprites: Sprite[] = []
    for (let i = 0; i < scene.sprites.length; i++) {
      const s = scene.sprites[i]
      if (!s.material.transparent) continue
      if (s.material.blending === AdditiveBlending) additiveSprites.push(s)
      else normalSprites.push(s)
    }

    const solidCount = solidMeshes.length
    const instancedMeshes = scene.instancedMeshes
    const instancedCount = instancedMeshes.length
    const basicCount = basicMeshes.length
    const wireCount = wireframeMeshes.length
    const customCount = customMeshes.length
    const lineCount = lines.length
    const normalSpriteCount = normalSprites.length
    const additiveSpriteCount = additiveSprites.length
    const instancedSprites = scene.instancedSprites
    const instancedSpriteCount = instancedSprites.length
    const totalCount =
      solidCount +
      instancedCount +
      basicCount +
      wireCount +
      customCount +
      lineCount +
      normalSpriteCount +
      additiveSpriteCount +
      instancedSpriteCount
    if (totalCount === 0) return

    if (totalCount > this.capacity) this.grow(totalCount)

    // ── Scene uniforms ──────────────────────────────────────────
    const sd = this.sceneData
    sd.set(camera.viewProjection, 0)

    const dl = scene.directionalLights[0]
    if (dl) {
      const lx = dl.position.x,
        ly = dl.position.y,
        lz = dl.position.z
      const len = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1
      sd[16] = lx / len
      sd[17] = ly / len
      sd[18] = lz / len
      sd[19] = 0
    }
    const al = scene.ambientLights[0]
    if (al) {
      sd[20] = al.color.r * al.intensity
      sd[21] = al.color.g * al.intensity
      sd[22] = al.color.b * al.intensity
      sd[23] = 0
    }
    if (dl) {
      sd[24] = dl.color.r * dl.intensity
      sd[25] = dl.color.g * dl.intensity
      sd[26] = dl.color.b * dl.intensity
      sd[27] = 0
    }

    const shadowsOn = this.shadowMap.enabled && dl !== undefined
    if (dl) {
      const sc = dl.shadow.camera
      mat4Ortho(this.lightProj, sc.left, sc.right, sc.bottom, sc.top, sc.near, sc.far)
      mat4LookAt(this.lightView, dl.position.x, dl.position.y, dl.position.z, 0, 0, 0, 0, 1, 0)
      mat4Multiply(this.lightVP, this.lightProj, this.lightView)
      sd.set(this.lightVP, 28)
    }
    sd[44] = shadowsOn ? 1 : 0
    sd[45] = SHADOW_BIAS
    sd[46] = 1 / SHADOW_MAP_SIZE
    sd[47] = 0
    // Camera right/up vectors for GPU billboard (from camera world matrix, column-major)
    const cm = camera._worldMatrix
    sd[48] = cm[0]
    sd[49] = cm[1]
    sd[50] = cm[2]
    sd[51] = 0
    sd[52] = cm[4]
    sd[53] = cm[5]
    sd[54] = cm[6]
    sd[55] = 0
    this.device.queue.writeBuffer(this.sceneBuffer, 0, sd)

    // ── Stage object data (world matrices already computed by updateMatrixWorld) ──
    // Order: solid, instanced, basic, wireframe, custom, lines, normalSprites, additiveSprites, instancedSprites
    let idx = 0
    for (let i = 0; i < solidCount; i++, idx++) {
      const m = solidMeshes[i]
      this.writeObjectData(idx, m._worldMatrix, m.material.color.r, m.material.color.g, m.material.color.b)
    }
    for (let i = 0; i < instancedCount; i++, idx++) {
      const m = instancedMeshes[i]
      this.writeObjectData(idx, m._worldMatrix, m.material.color.r, m.material.color.g, m.material.color.b)
    }
    for (let i = 0; i < basicCount; i++, idx++) {
      const m = basicMeshes[i]
      this.writeObjectData(idx, m._worldMatrix, m.material.color.r, m.material.color.g, m.material.color.b)
    }
    for (let i = 0; i < wireCount; i++, idx++) {
      const m = wireframeMeshes[i]
      this.writeObjectData(idx, m._worldMatrix, m.material.color.r, m.material.color.g, m.material.color.b)
    }
    for (let i = 0; i < customCount; i++, idx++) {
      const m = customMeshes[i]
      this.writeObjectData(idx, m._worldMatrix, m.material.color.r, m.material.color.g, m.material.color.b)
    }
    for (let i = 0; i < lineCount; i++, idx++) {
      const l = lines[i]
      this.writeObjectData(idx, l._worldMatrix, l.material.color.r, l.material.color.g, l.material.color.b)
    }
    // Stage sprite data with billboard matrices
    const spriteList = normalSprites.concat(additiveSprites)
    if (spriteList.length > 0) {
      // Camera right/up/forward from camera world matrix (column-major)
      const cm = camera._worldMatrix
      const crx = cm[0],
        cry = cm[1],
        crz = cm[2] // right
      const cux = cm[4],
        cuy = cm[5],
        cuz = cm[6] // up
      const cfx = cm[8],
        cfy = cm[9],
        cfz = cm[10] // forward

      for (let i = 0; i < spriteList.length; i++, idx++) {
        const s = spriteList[i]
        const m = s._worldMatrix
        // Extract world position
        const px = m[12],
          py = m[13],
          pz = m[14]
        // Extract uniform scale (length of first column)
        const sx = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2])
        const sy = Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6])
        // Build billboard matrix (column-major)
        const off = idx * this.objectFloatStride
        this.objectStaging[off] = crx * sx
        this.objectStaging[off + 1] = cry * sx
        this.objectStaging[off + 2] = crz * sx
        this.objectStaging[off + 3] = 0
        this.objectStaging[off + 4] = cux * sy
        this.objectStaging[off + 5] = cuy * sy
        this.objectStaging[off + 6] = cuz * sy
        this.objectStaging[off + 7] = 0
        this.objectStaging[off + 8] = cfx
        this.objectStaging[off + 9] = cfy
        this.objectStaging[off + 10] = cfz
        this.objectStaging[off + 11] = 0
        this.objectStaging[off + 12] = px
        this.objectStaging[off + 13] = py
        this.objectStaging[off + 14] = pz
        this.objectStaging[off + 15] = 1
        this.objectStaging[off + 16] = s.material.color.r
        this.objectStaging[off + 17] = s.material.color.g
        this.objectStaging[off + 18] = s.material.color.b
        this.objectStaging[off + 19] = s.material.opacity
      }
    }
    // Stage instanced sprite world matrices (one slot per InstancedSprite)
    for (let i = 0; i < instancedSpriteCount; i++, idx++) {
      const is = instancedSprites[i]
      this.writeObjectData(idx, is._worldMatrix, 1, 1, 1)
    }
    this.device.queue.writeBuffer(this.objectBuffer, 0, this.objectStaging.buffer, 0, totalCount * this.objectStride)

    for (let i = 0; i < customCount; i++)
      (customMeshes[i].material as ShaderMaterial)._ensureGPU(this.device, this.customUniformLayout)
    for (let i = 0; i < instancedCount; i++) instancedMeshes[i]._ensureGPU(this.device, this.instanceLayout)
    for (let i = 0; i < instancedSpriteCount; i++) instancedSprites[i]._ensureGPU(this.device, this.instanceLayout)

    const encoder = this.device.createCommandEncoder()

    // ── Shadow depth pass ───────────────────────────────────────
    if (shadowsOn) {
      this.device.queue.writeBuffer(this.shadowLightBuffer, 0, this.lightVP)
      const sp = encoder.beginRenderPass(this.shadowPassDesc)
      sp.setPipeline(this.shadowPipeline)
      sp.setBindGroup(0, this.shadowSceneBindGroup)

      let curGeo: BufferGeometry | null = null
      for (let i = 0; i < solidCount; i++) {
        if (!solidMeshes[i].castShadow) continue
        const geo = solidMeshes[i].geometry
        if (geo !== curGeo) {
          curGeo = geo
          geo._ensureGPU(this.device)
          sp.setVertexBuffer(0, geo._vertexBuffer!)
          sp.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)
        }
        sp.setBindGroup(1, this.objectBindGroup, [i * this.objectStride])
        sp.drawIndexed(geo._indexCount)
        this.info.drawCalls++
        this.info.triangles += (geo._indexCount / 3) | 0
      }

      // Instanced mesh shadows
      if (instancedCount > 0) {
        sp.setPipeline(this.instancedShadowPipeline)
        const instBase = solidCount
        for (let i = 0; i < instancedCount; i++) {
          const im = instancedMeshes[i]
          if (!im.castShadow) continue
          const geo = im.geometry
          if (geo !== curGeo) {
            curGeo = geo
            geo._ensureGPU(this.device)
            sp.setVertexBuffer(0, geo._vertexBuffer!)
            sp.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)
          }
          sp.setBindGroup(1, this.objectBindGroup, [(instBase + i) * this.objectStride])
          sp.setBindGroup(2, im._instanceBindGroup!)
          sp.drawIndexed(geo._indexCount, im.count)
          this.info.drawCalls++
          this.info.triangles += ((geo._indexCount / 3) | 0) * im.count
        }
        sp.setPipeline(this.shadowPipeline)
      }

      const customBase = solidCount + instancedCount + basicCount + wireCount
      for (let i = 0; i < customCount; i++) {
        const mesh = customMeshes[i]
        if (!mesh.castShadow || (mesh.material as ShaderMaterial).wireframe) continue
        const geo = mesh.geometry
        if (geo !== curGeo) {
          curGeo = geo
          geo._ensureGPU(this.device)
          sp.setVertexBuffer(0, geo._vertexBuffer!)
          sp.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)
        }
        sp.setBindGroup(1, this.objectBindGroup, [(customBase + i) * this.objectStride])
        sp.drawIndexed(geo._indexCount)
        this.info.drawCalls++
        this.info.triangles += (geo._indexCount / 3) | 0
      }
      sp.end()
    }

    // ── Main color pass ─────────────────────────────────────────
    this.colorAtt.view = this.context.getCurrentTexture().createView()
    this.depthAtt.view = this.depthView
    const pass = encoder.beginRenderPass(this.passDesc)
    pass.setBindGroup(0, this.sceneBindGroup)

    // 1: solid meshes (switch pipeline per material.side)
    if (solidCount > 0) {
      let curPipeline: GPURenderPipeline | null = null
      let curGeo: BufferGeometry | null = null
      for (let i = 0; i < solidCount; i++) {
        const mat = solidMeshes[i].material as MeshLambertMaterial
        const pipeline =
          mat.side === BackSide
            ? this.meshPipelineFront
            : mat.side === DoubleSide
              ? this.meshPipelineDouble
              : this.meshPipeline
        if (pipeline !== curPipeline) {
          curPipeline = pipeline
          pass.setPipeline(pipeline)
          curGeo = null
        }
        const geo = solidMeshes[i].geometry
        if (geo !== curGeo) {
          curGeo = geo
          geo._ensureGPU(this.device)
          pass.setVertexBuffer(0, geo._vertexBuffer!)
          pass.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)
        }
        pass.setBindGroup(1, this.objectBindGroup, [i * this.objectStride])
        pass.drawIndexed(geo._indexCount)
        this.info.drawCalls++
        this.info.triangles += (geo._indexCount / 3) | 0
      }
    }

    // 2: instanced meshes (one draw call per InstancedMesh, N instances each)
    if (instancedCount > 0) {
      const base = solidCount
      for (let i = 0; i < instancedCount; i++) {
        const im = instancedMeshes[i]
        const mat = im.material as MeshLambertMaterial
        const pipeline =
          mat.side === BackSide
            ? this.instancedMeshPipelineFront
            : mat.side === DoubleSide
              ? this.instancedMeshPipelineDouble
              : this.instancedMeshPipeline
        pass.setPipeline(pipeline)
        const geo = im.geometry
        geo._ensureGPU(this.device)
        pass.setVertexBuffer(0, geo._vertexBuffer!)
        pass.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)
        pass.setBindGroup(1, this.objectBindGroup, [(base + i) * this.objectStride])
        pass.setBindGroup(2, im._instanceBindGroup!)
        pass.drawIndexed(geo._indexCount, im.count)
        this.info.drawCalls++
        this.info.triangles += ((geo._indexCount / 3) | 0) * im.count
      }
    }

    // 3: basic (unlit) meshes
    if (basicCount > 0) {
      let curPipeline: GPURenderPipeline | null = null
      let curGeo: BufferGeometry | null = null
      const base = solidCount + instancedCount
      for (let i = 0; i < basicCount; i++) {
        const mat = basicMeshes[i].material as MeshBasicMaterial
        const pipeline =
          mat.side === BackSide
            ? this.basicPipelineFront
            : mat.side === DoubleSide
              ? this.basicPipelineDouble
              : this.basicPipeline
        if (pipeline !== curPipeline) {
          curPipeline = pipeline
          pass.setPipeline(pipeline)
          curGeo = null
        }
        const geo = basicMeshes[i].geometry
        if (geo !== curGeo) {
          curGeo = geo
          geo._ensureGPU(this.device)
          pass.setVertexBuffer(0, geo._vertexBuffer!)
          pass.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)
        }
        pass.setBindGroup(1, this.objectBindGroup, [(base + i) * this.objectStride])
        pass.drawIndexed(geo._indexCount)
        this.info.drawCalls++
        this.info.triangles += (geo._indexCount / 3) | 0
      }
    }

    // 4: wireframe meshes
    if (wireCount > 0) {
      pass.setPipeline(this.wireframePipeline)
      const base = solidCount + instancedCount + basicCount
      let curGeo: BufferGeometry | null = null
      for (let i = 0; i < wireCount; i++) {
        const geo = wireframeMeshes[i].geometry
        if (geo !== curGeo) {
          curGeo = geo
          geo._ensureWireframeGPU(this.device)
          pass.setVertexBuffer(0, geo._vertexBuffer!)
          pass.setIndexBuffer(geo._wireframeIndexBuffer!, geo._wireframeIndexFormat)
        }
        pass.setBindGroup(1, this.objectBindGroup, [(base + i) * this.objectStride])
        pass.drawIndexed(geo._wireframeIndexCount)
        this.info.drawCalls++
      }
    }

    // 5: custom shader meshes
    if (customCount > 0) {
      const base = solidCount + instancedCount + basicCount + wireCount
      let curPipeline: GPURenderPipeline | null = null
      let curGeo: BufferGeometry | null = null
      for (let i = 0; i < customCount; i++) {
        const mesh = customMeshes[i]
        const mat = mesh.material as ShaderMaterial
        const geo = mesh.geometry
        const pipeline = this.getOrCreateCustomPipeline(mat)
        if (pipeline !== curPipeline) {
          curPipeline = pipeline
          pass.setPipeline(pipeline)
          curGeo = null
        }
        if (geo !== curGeo) {
          curGeo = geo
          if (mat.wireframe) {
            geo._ensureWireframeGPU(this.device)
            pass.setVertexBuffer(0, geo._vertexBuffer!)
            pass.setIndexBuffer(geo._wireframeIndexBuffer!, geo._wireframeIndexFormat)
          } else {
            geo._ensureGPU(this.device)
            pass.setVertexBuffer(0, geo._vertexBuffer!)
            pass.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)
          }
        }
        pass.setBindGroup(1, this.objectBindGroup, [(base + i) * this.objectStride])
        if (mat._uniformBindGroup) pass.setBindGroup(2, mat._uniformBindGroup)
        const idxCount = mat.wireframe ? geo._wireframeIndexCount : geo._indexCount
        pass.drawIndexed(idxCount)
        this.info.drawCalls++
        if (!mat.wireframe) this.info.triangles += (idxCount / 3) | 0
      }
    }

    // 6: lines
    if (lineCount > 0) {
      pass.setPipeline(this.linePipeline)
      const base = solidCount + instancedCount + basicCount + wireCount + customCount
      let curGeo: BufferGeometry | null = null
      for (let i = 0; i < lineCount; i++) {
        const geo = lines[i].geometry
        if (geo !== curGeo) {
          curGeo = geo
          geo._ensureGPU(this.device)
          pass.setVertexBuffer(0, geo._vertexBuffer!)
          if (geo._indexBuffer) pass.setIndexBuffer(geo._indexBuffer, geo._indexFormat)
        }
        pass.setBindGroup(1, this.objectBindGroup, [(base + i) * this.objectStride])
        if (geo._indexCount > 0) pass.drawIndexed(geo._indexCount)
        else pass.draw(geo._vertexCount)
        this.info.drawCalls++
      }
    }

    // 7: sprites (alpha-blended, rendered after all opaque geometry)
    if (normalSpriteCount + additiveSpriteCount > 0) {
      if (!this.spriteGeometry) this.spriteGeometry = new PlaneGeometry(1, 1)
      const geo = this.spriteGeometry
      geo._ensureGPU(this.device)
      pass.setVertexBuffer(0, geo._vertexBuffer!)
      pass.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)

      const spriteBase = solidCount + instancedCount + basicCount + wireCount + customCount + lineCount
      if (normalSpriteCount > 0) {
        pass.setPipeline(this.spriteNormalPipeline)
        for (let i = 0; i < normalSpriteCount; i++) {
          pass.setBindGroup(1, this.objectBindGroup, [(spriteBase + i) * this.objectStride])
          pass.drawIndexed(geo._indexCount)
          this.info.drawCalls++
          this.info.triangles += 2
        }
      }
      if (additiveSpriteCount > 0) {
        pass.setPipeline(this.spriteAdditivePipeline)
        for (let i = 0; i < additiveSpriteCount; i++) {
          pass.setBindGroup(1, this.objectBindGroup, [(spriteBase + normalSpriteCount + i) * this.objectStride])
          pass.drawIndexed(geo._indexCount)
          this.info.drawCalls++
          this.info.triangles += 2
        }
      }
    }

    // 8: instanced sprites (GPU billboard, one draw call per InstancedSprite)
    if (instancedSpriteCount > 0) {
      if (!this.spriteGeometry) this.spriteGeometry = new PlaneGeometry(1, 1)
      const geo = this.spriteGeometry
      geo._ensureGPU(this.device)
      pass.setVertexBuffer(0, geo._vertexBuffer!)
      pass.setIndexBuffer(geo._indexBuffer!, geo._indexFormat)

      const iSpriteBase =
        solidCount +
        instancedCount +
        basicCount +
        wireCount +
        customCount +
        lineCount +
        normalSpriteCount +
        additiveSpriteCount
      for (let i = 0; i < instancedSpriteCount; i++) {
        const is = instancedSprites[i]
        if (is.count === 0) continue
        const pipeline =
          is.blending === AdditiveBlending ? this.instancedSpriteAdditivePipeline : this.instancedSpriteNormalPipeline
        pass.setPipeline(pipeline)
        pass.setBindGroup(1, this.objectBindGroup, [(iSpriteBase + i) * this.objectStride])
        pass.setBindGroup(2, is._instanceBindGroup!)
        pass.drawIndexed(geo._indexCount, is.count)
        this.info.drawCalls++
        this.info.triangles += 2 * is.count
      }
    }

    pass.end()
    this.device.queue.submit([encoder.finish()])
  }

  dispose() {
    this.sceneBuffer?.destroy()
    this.objectBuffer?.destroy()
    this.depthTexture?.destroy()
    this.shadowMapTexture?.destroy()
    this.shadowLightBuffer?.destroy()
    this.customPipelineCache.clear()
    this.device?.destroy()
  }
}
