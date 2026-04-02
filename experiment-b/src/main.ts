// Experiment B — Minimal WebGPU engine for max non-instanced rotating Lambert cubes

const SHADER = /* wgsl */ `
struct Scene {
  viewProj: mat4x4f,
  lightDir: vec4f,
  ambient: vec4f,
  lightCol: vec4f,
}

struct Cube {
  col0: vec4f,
  col1: vec4f,
  col2: vec4f,
  col3: vec4f,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var<storage, read> cubes: array<Cube>;

struct V {
  @builtin(position) pos: vec4f,
  @location(0) norm: vec3f,
  @location(1) col: vec3f,
}

@vertex fn vs(
  @location(0) p: vec3f,
  @location(1) n: vec3f,
  @builtin(instance_index) i: u32,
) -> V {
  let c = cubes[i];
  let m = mat4x4f(c.col0, c.col1, c.col2, c.col3);
  let wp = m * vec4f(p, 1.0);
  var o: V;
  o.pos = scene.viewProj * wp;
  o.norm = normalize((m * vec4f(n, 0.0)).xyz);
  o.col = c.color.rgb;
  return o;
}

@fragment fn fs(v: V) -> @location(0) vec4f {
  let n = normalize(v.norm);
  let d = max(dot(n, scene.lightDir.xyz), 0.0);
  let c = v.col * (scene.ambient.rgb + scene.lightCol.rgb * d);
  return vec4f(c, 1.0);
}
`

// ─── Geometry ──────────────────────────────────────────────────────

function cubeGeometry() {
  // 24 vertices: 4 per face, interleaved pos(3) + normal(3)
  // prettier-ignore
  const v = new Float32Array([
    // +X
     .5, -.5, -.5,  1, 0, 0,   .5,  .5, -.5,  1, 0, 0,   .5,  .5,  .5,  1, 0, 0,   .5, -.5,  .5,  1, 0, 0,
    // -X
    -.5, -.5,  .5, -1, 0, 0,  -.5,  .5,  .5, -1, 0, 0,  -.5,  .5, -.5, -1, 0, 0,  -.5, -.5, -.5, -1, 0, 0,
    // +Y
    -.5,  .5,  .5,  0, 1, 0,   .5,  .5,  .5,  0, 1, 0,   .5,  .5, -.5,  0, 1, 0,  -.5,  .5, -.5,  0, 1, 0,
    // -Y
    -.5, -.5, -.5,  0,-1, 0,   .5, -.5, -.5,  0,-1, 0,   .5, -.5,  .5,  0,-1, 0,  -.5, -.5,  .5,  0,-1, 0,
    // +Z
    -.5, -.5,  .5,  0, 0, 1,   .5, -.5,  .5,  0, 0, 1,   .5,  .5,  .5,  0, 0, 1,  -.5,  .5,  .5,  0, 0, 1,
    // -Z
     .5, -.5, -.5,  0, 0,-1,  -.5, -.5, -.5,  0, 0,-1,  -.5,  .5, -.5,  0, 0,-1,   .5,  .5, -.5,  0, 0,-1,
  ])
  // prettier-ignore
  const idx = new Uint16Array([
    0,1,2, 0,2,3,  4,5,6, 4,6,7,  8,9,10, 8,10,11,
    12,13,14, 12,14,15,  16,17,18, 16,18,19,  20,21,22, 20,22,23,
  ])
  return { v, idx }
}

// ─── Math helpers (column-major) ───────────────────────────────────

const tmpA = new Float32Array(16)
const tmpB = new Float32Array(16)

function perspective(out: Float32Array, fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov * 0.5)
  const r = 1 / (near - far)
  out[0] = f / aspect
  out[1] = 0
  out[2] = 0
  out[3] = 0
  out[4] = 0
  out[5] = f
  out[6] = 0
  out[7] = 0
  out[8] = 0
  out[9] = 0
  out[10] = far * r
  out[11] = -1
  out[12] = 0
  out[13] = 0
  out[14] = near * far * r
  out[15] = 0
}

function lookAt(out: Float32Array, ex: number, ey: number, ez: number, cx: number, cy: number, cz: number) {
  // forward
  let fx = cx - ex,
    fy = cy - ey,
    fz = cz - ez
  let il = 1 / Math.sqrt(fx * fx + fy * fy + fz * fz)
  fx *= il
  fy *= il
  fz *= il
  // right = cross(forward, up(0,1,0))
  let rx = fz,
    rz = -fx
  il = 1 / Math.sqrt(rx * rx + rz * rz)
  rx *= il
  rz *= il
  // up = cross(right, forward)
  const ux = -fy * rz,
    uy = rz * fx - rx * fz,
    uz = rx * fy
  // column-major
  out[0] = rx
  out[1] = ux
  out[2] = -fx
  out[3] = 0
  out[4] = 0
  out[5] = uy
  out[6] = -fy
  out[7] = 0
  out[8] = rz
  out[9] = uz
  out[10] = -fz
  out[11] = 0
  out[12] = -(rx * ex + rz * ez)
  out[13] = -(ux * ex + uy * ey + uz * ez)
  out[14] = fx * ex + fy * ey + fz * ez
  out[15] = 1
}

function mul4(out: Float32Array, a: Float32Array, b: Float32Array) {
  for (let i = 0; i < 4; i++) {
    const ai0 = a[i],
      ai1 = a[i + 4],
      ai2 = a[i + 8],
      ai3 = a[i + 12]
    out[i] = ai0 * b[0] + ai1 * b[1] + ai2 * b[2] + ai3 * b[3]
    out[i + 4] = ai0 * b[4] + ai1 * b[5] + ai2 * b[6] + ai3 * b[7]
    out[i + 8] = ai0 * b[8] + ai1 * b[9] + ai2 * b[10] + ai3 * b[11]
    out[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15]
  }
}

// ─── Cube state ────────────────────────────────────────────────────

const FLOATS_PER_CUBE = 20 // mat4 (16) + color (4)

interface CubeState {
  count: number
  // Per-cube: px, py, pz, rx, ry, rxSpeed, rySpeed
  meta: Float32Array
  gpu: Float32Array // upload buffer
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c * 0.5
  let r = 0,
    g = 0,
    b = 0
  const sector = (h * 6) | 0
  if (sector === 0) {
    r = c
    g = x
  } else if (sector === 1) {
    r = x
    g = c
  } else if (sector === 2) {
    g = c
    b = x
  } else if (sector === 3) {
    g = x
    b = c
  } else if (sector === 4) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return [r + m, g + m, b + m]
}

function createCubes(count: number): CubeState {
  const grid = Math.ceil(Math.cbrt(count))
  const spacing = 2.2
  const offset = ((grid - 1) * spacing) / 2
  const meta = new Float32Array(count * 7) // px,py,pz,rx,ry,rxSpeed,rySpeed
  const gpu = new Float32Array(count * FLOATS_PER_CUBE)

  for (let i = 0; i < count; i++) {
    const ix = i % grid
    const iy = ((i / grid) | 0) % grid
    const iz = (i / (grid * grid)) | 0
    const m = i * 7
    meta[m] = ix * spacing - offset
    meta[m + 1] = iy * spacing - offset
    meta[m + 2] = iz * spacing - offset
    meta[m + 3] = Math.random() * Math.PI * 2 // initial rx
    meta[m + 4] = Math.random() * Math.PI * 2 // initial ry
    meta[m + 5] = 0.5 + Math.random() * 2 // rx speed
    meta[m + 6] = 0.5 + Math.random() * 2 // ry speed

    // Color
    const [r, g, b] = hslToRgb((i / count + Math.random() * 0.05) % 1, 0.7, 0.55)
    const o = i * FLOATS_PER_CUBE
    gpu[o + 16] = r
    gpu[o + 17] = g
    gpu[o + 18] = b
    gpu[o + 19] = 1
  }
  return { count, meta, gpu }
}

function updateCubes(state: CubeState, dt: number) {
  const { count, meta, gpu } = state
  for (let i = 0; i < count; i++) {
    const m = i * 7
    const rx = (meta[m + 3] += meta[m + 5] * dt)
    const ry = (meta[m + 4] += meta[m + 6] * dt)
    const cx = Math.cos(rx),
      sx = Math.sin(rx)
    const cy = Math.cos(ry),
      sy = Math.sin(ry)
    const tx = meta[m],
      ty = meta[m + 1],
      tz = meta[m + 2]

    // Model = Ry * Rx, column-major
    const o = i * FLOATS_PER_CUBE
    gpu[o] = cy
    gpu[o + 1] = 0
    gpu[o + 2] = -sy
    gpu[o + 3] = 0

    gpu[o + 4] = sy * sx
    gpu[o + 5] = cx
    gpu[o + 6] = cy * sx
    gpu[o + 7] = 0

    gpu[o + 8] = sy * cx
    gpu[o + 9] = -sx
    gpu[o + 10] = cy * cx
    gpu[o + 11] = 0

    gpu[o + 12] = tx
    gpu[o + 13] = ty
    gpu[o + 14] = tz
    gpu[o + 15] = 1
    // color already set at gpu[o+16..19]
  }
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const hud = document.getElementById('hud') as HTMLElement

  if (!navigator.gpu) {
    hud.textContent = 'WebGPU not supported'
    return
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) {
    hud.textContent = 'No WebGPU adapter'
    return
  }

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  })

  const ctx = canvas.getContext('webgpu') as GPUCanvasContext
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: 'opaque' })

  // Geometry buffers
  const { v, idx } = cubeGeometry()
  const vBuf = device.createBuffer({ size: v.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(vBuf, 0, v)
  const iBuf = device.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(iBuf, 0, idx)

  // Scene uniform buffer (viewProj + lighting) — 112 bytes, round to 128
  const sceneData = new Float32Array(28) // 7 vec4f = 28 floats
  const sceneBuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

  // Lighting constants
  // lightDir (normalized, toward light)
  const ldx = 0.5,
    ldy = 1.0,
    ldz = 0.3
  const ldLen = 1 / Math.sqrt(ldx * ldx + ldy * ldy + ldz * ldz)
  sceneData[16] = ldx * ldLen
  sceneData[17] = ldy * ldLen
  sceneData[18] = ldz * ldLen
  sceneData[19] = 0
  // ambient
  sceneData[20] = 0.15
  sceneData[21] = 0.15
  sceneData[22] = 0.18
  sceneData[23] = 0
  // light color
  sceneData[24] = 1.0
  sceneData[25] = 0.95
  sceneData[26] = 0.9
  sceneData[27] = 0

  // Cube state
  let cubeCount = 20_000
  let cubes = createCubes(cubeCount)
  let maxCubesBufSize = cubeCount * FLOATS_PER_CUBE * 4
  let cubeBuf = device.createBuffer({
    size: maxCubesBufSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  // Pipeline
  const shaderModule = device.createShaderModule({ code: SHADER })
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  })

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module: shaderModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        },
      ],
    },
    fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  })

  let bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: sceneBuf } },
      { binding: 1, resource: { buffer: cubeBuf } },
    ],
  })

  // Depth texture
  let depthTex: GPUTexture
  let depthView: GPUTextureView

  function resize() {
    const dpr = window.devicePixelRatio || 1
    const w = (canvas.width = (canvas.clientWidth * dpr) | 0)
    const h = (canvas.height = (canvas.clientHeight * dpr) | 0)
    if (depthTex) depthTex.destroy()
    depthTex = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT })
    depthView = depthTex.createView()
  }
  resize()
  window.addEventListener('resize', resize)

  function setCubeCount(n: number) {
    cubeCount = Math.max(1, n)
    cubes = createCubes(cubeCount)
    const needed = cubeCount * FLOATS_PER_CUBE * 4
    if (needed > maxCubesBufSize) {
      cubeBuf.destroy()
      maxCubesBufSize = needed
      cubeBuf = device.createBuffer({ size: maxCubesBufSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
      bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: sceneBuf } },
          { binding: 1, resource: { buffer: cubeBuf } },
        ],
      })
    }
  }

  // Controls
  document.getElementById('add1k')?.addEventListener('click', () => setCubeCount(cubeCount + 1_000))
  document.getElementById('sub1k')?.addEventListener('click', () => setCubeCount(cubeCount - 1_000))
  document.getElementById('add10k')?.addEventListener('click', () => setCubeCount(cubeCount + 10_000))
  document.getElementById('sub10k')?.addEventListener('click', () => setCubeCount(cubeCount - 10_000))

  // FPS tracking
  const frameTimes: number[] = []
  let lastTime = performance.now()

  function frame(now: number) {
    requestAnimationFrame(frame)
    const dt = (now - lastTime) * 0.001
    lastTime = now

    // FPS
    frameTimes.push(dt)
    if (frameTimes.length > 120) frameTimes.shift()
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
    hud.textContent = `${cubeCount.toLocaleString()} cubes | ${(1 / avg) | 0} fps | ${(avg * 1000).toFixed(1)} ms`

    // Update cube rotations
    updateCubes(cubes, dt)
    device.queue.writeBuffer(cubeBuf, 0, cubes.gpu.buffer, 0, cubeCount * FLOATS_PER_CUBE * 4)

    // Camera orbit
    const time = now * 0.001
    const grid = Math.ceil(Math.cbrt(cubeCount))
    const dist = grid * 2.5
    const ex = Math.cos(time * 0.15) * dist
    const ey = dist * 0.4
    const ez = Math.sin(time * 0.15) * dist

    perspective(tmpA, Math.PI / 4, canvas.width / canvas.height, 0.1, dist * 4)
    lookAt(tmpB, ex, ey, ez, 0, 0, 0)
    mul4(sceneData, tmpA, tmpB)
    device.queue.writeBuffer(sceneBuf, 0, sceneData)

    // Render
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.05, g: 0.05, b: 0.07, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    })

    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindGroup)
    pass.setVertexBuffer(0, vBuf)
    pass.setIndexBuffer(iBuf, 'uint16')

    // Non-instanced: one drawIndexed per cube, using firstInstance to pass cube index
    for (let i = 0; i < cubeCount; i++) {
      pass.drawIndexed(36, 1, 0, 0, i)
    }

    pass.end()
    device.queue.submit([encoder.finish()])
  }

  requestAnimationFrame(frame)
}

main()
