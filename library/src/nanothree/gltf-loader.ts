// GLTF/GLB loader for nanothree
//
// Parses GLTF 2.0 (JSON) and GLB (binary) formats.
// Builds a nanothree scene graph from the GLTF node hierarchy with:
// - Mesh geometry (positions, normals, UVs, indices)
// - Lambert materials with optional albedo texture
// - Shadow properties (castShadow, receiveShadow) applied to all meshes
//
// Does not support: skeletal animation, morph targets, cameras, lights,
// KHR extensions, sparse accessors, or multi-primitive meshes with
// different materials.

import { Color, Group, Object3D } from './core'
import { BufferGeometry, Float32BufferAttribute } from './geometry'
import { MeshLambertMaterial, NanoTexture } from './material'
import { Mesh } from './mesh'

// ── GLTF JSON types (subset) ──────────────────────────────────────────

interface GLTFJson {
  asset: { version: string }
  scene?: number
  scenes?: Array<{ nodes?: number[] }>
  nodes?: GLTFNode[]
  meshes?: GLTFMesh[]
  accessors?: GLTFAccessor[]
  bufferViews?: GLTFBufferView[]
  buffers?: GLTFBuffer[]
  materials?: GLTFMaterial[]
  textures?: GLTFTextureRef[]
  images?: GLTFImage[]
  samplers?: GLTFSampler[]
}

interface GLTFNode {
  name?: string
  mesh?: number
  children?: number[]
  translation?: [number, number, number]
  rotation?: [number, number, number, number]
  scale?: [number, number, number]
  matrix?: number[]
}

interface GLTFMesh {
  name?: string
  primitives: GLTFPrimitive[]
}

interface GLTFPrimitive {
  attributes: Record<string, number>
  indices?: number
  material?: number
  mode?: number
}

interface GLTFAccessor {
  bufferView?: number
  byteOffset?: number
  componentType: number
  count: number
  type: string
  max?: number[]
  min?: number[]
}

interface GLTFBufferView {
  buffer: number
  byteOffset?: number
  byteLength: number
  byteStride?: number
  target?: number
}

interface GLTFBuffer {
  uri?: string
  byteLength: number
}

interface GLTFMaterial {
  name?: string
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number]
    baseColorTexture?: { index: number }
    metallicFactor?: number
    roughnessFactor?: number
  }
  emissiveFactor?: [number, number, number]
  doubleSided?: boolean
}

interface GLTFTextureRef {
  source?: number
  sampler?: number
}

interface GLTFImage {
  uri?: string
  mimeType?: string
  bufferView?: number
}

interface GLTFSampler {
  magFilter?: number
  minFilter?: number
  wrapS?: number
  wrapT?: number
}

// ── Component type sizes ──────────────────────────────────────────────

const COMPONENT_SIZES: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
}

const TYPE_COUNTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
}

// ── GLB magic constants ───────────────────────────────────────────────

const GLB_MAGIC = 0x46546c67 // 'glTF'
const GLB_CHUNK_JSON = 0x4e4f534a // 'JSON'
const GLB_CHUNK_BIN = 0x004e4942 // 'BIN\0'

// ── Loader result ─────────────────────────────────────────────────────

export interface GLTFResult {
  scene: Group
}

// ── GLTFLoader class ──────────────────────────────────────────────────

export class GLTFLoader {
  /**
   * Load a GLTF/GLB file from a URL.
   * Calls onLoad with the parsed result, or onError on failure.
   */
  load(
    url: string,
    onLoad: (result: GLTFResult) => void,
    _onProgress?: unknown,
    onError?: (err: unknown) => void,
  ): void {
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
        return res.arrayBuffer()
      })
      .then(buffer => this.parse(buffer, url))
      .then(onLoad)
      .catch(err => {
        if (onError) onError(err)
        else console.warn(`[nanothree] Failed to load GLTF "${url}":`, err)
      })
  }

  private async parse(buffer: ArrayBuffer, url: string): Promise<GLTFResult> {
    const view = new DataView(buffer)
    let json: GLTFJson
    let binChunk: ArrayBuffer | null = null

    // Check if GLB
    if (buffer.byteLength >= 12 && view.getUint32(0, true) === GLB_MAGIC) {
      const result = parseGLB(buffer)
      json = result.json
      binChunk = result.bin
    } else {
      // Plain GLTF JSON
      const text = new TextDecoder().decode(buffer)
      json = JSON.parse(text)
    }

    // Resolve base URL for relative URIs
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)

    // Load binary buffers
    const buffers = await loadBuffers(json, binChunk, baseUrl)

    // Load textures
    const textures = await loadTextures(json, buffers, baseUrl)

    // Build materials
    const materials = buildMaterials(json, textures)

    // Build scene graph
    const scene = buildScene(json, buffers, materials)

    return { scene }
  }
}

// ── GLB parser ────────────────────────────────────────────────────────

function parseGLB(buffer: ArrayBuffer): { json: GLTFJson; bin: ArrayBuffer | null } {
  const view = new DataView(buffer)
  // Header: magic(4) + version(4) + length(4)
  let offset = 12

  let json: GLTFJson | null = null
  let bin: ArrayBuffer | null = null

  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    offset += 8

    if (chunkType === GLB_CHUNK_JSON) {
      const text = new TextDecoder().decode(new Uint8Array(buffer, offset, chunkLength))
      json = JSON.parse(text)
    } else if (chunkType === GLB_CHUNK_BIN) {
      bin = buffer.slice(offset, offset + chunkLength)
    }

    offset += chunkLength
  }

  if (!json) throw new Error('GLB: No JSON chunk found')
  return { json, bin }
}

// ── Buffer loading ────────────────────────────────────────────────────

async function loadBuffers(json: GLTFJson, binChunk: ArrayBuffer | null, baseUrl: string): Promise<ArrayBuffer[]> {
  const buffers: ArrayBuffer[] = []
  if (!json.buffers) return buffers

  for (let i = 0; i < json.buffers.length; i++) {
    const bufDef = json.buffers[i]
    if (i === 0 && binChunk) {
      // GLB embedded binary
      buffers.push(binChunk)
    } else if (bufDef.uri) {
      if (bufDef.uri.startsWith('data:')) {
        // Data URI
        const base64 = bufDef.uri.split(',')[1]
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j)
        buffers.push(bytes.buffer)
      } else {
        // External URI
        const res = await fetch(baseUrl + bufDef.uri)
        buffers.push(await res.arrayBuffer())
      }
    } else {
      buffers.push(new ArrayBuffer(bufDef.byteLength))
    }
  }

  return buffers
}

// ── Texture loading ───────────────────────────────────────────────────

async function loadTextures(json: GLTFJson, buffers: ArrayBuffer[], baseUrl: string): Promise<(NanoTexture | null)[]> {
  if (!json.textures || !json.images) return []

  const imagePromises: Promise<ImageBitmap | null>[] = json.images.map(async img => {
    try {
      if (img.bufferView !== undefined) {
        // Image embedded in buffer
        const bv = json.bufferViews![img.bufferView]
        const data = new Uint8Array(buffers[bv.buffer], bv.byteOffset ?? 0, bv.byteLength)
        const blob = new Blob([data], { type: img.mimeType ?? 'image/png' })
        return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      } else if (img.uri) {
        if (img.uri.startsWith('data:')) {
          const res = await fetch(img.uri)
          const blob = await res.blob()
          return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
        }
        const res = await fetch(baseUrl + img.uri)
        const blob = await res.blob()
        return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      }
    } catch (err) {
      console.warn('[nanothree] Failed to load GLTF image:', err)
    }
    return null
  })

  const bitmaps = await Promise.all(imagePromises)

  return json.textures.map(texRef => {
    if (texRef.source === undefined) return null
    const bitmap = bitmaps[texRef.source]
    if (!bitmap) return null
    return new NanoTexture(bitmap)
  })
}

// ── Material building ─────────────────────────────────────────────────

function buildMaterials(json: GLTFJson, textures: (NanoTexture | null)[]): MeshLambertMaterial[] {
  if (!json.materials) return []

  return json.materials.map(matDef => {
    const pbr = matDef.pbrMetallicRoughness
    const color = new Color(1, 1, 1)
    let map: NanoTexture | null = null

    if (pbr?.baseColorFactor) {
      color.r = pbr.baseColorFactor[0]
      color.g = pbr.baseColorFactor[1]
      color.b = pbr.baseColorFactor[2]
    }

    if (pbr?.baseColorTexture && textures.length > 0) {
      const texIdx = pbr.baseColorTexture.index
      if (texIdx < textures.length) {
        map = textures[texIdx]
      }
    }

    const mat = new MeshLambertMaterial({ color })
    if (map) mat.map = map
    if (matDef.doubleSided) mat.side = 2 // DoubleSide
    return mat
  })
}

// ── Accessor reading ──────────────────────────────────────────────────

function readAccessor(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  accessorIdx: number,
): Float32Array | Uint16Array | Uint32Array {
  const acc = json.accessors![accessorIdx]
  const bv = json.bufferViews![acc.bufferView!]
  const buffer = buffers[bv.buffer]
  const byteOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const count = acc.count
  const numComponents = TYPE_COUNTS[acc.type] ?? 1
  const componentSize = COMPONENT_SIZES[acc.componentType] ?? 4
  const byteStride = bv.byteStride ?? 0

  if (byteStride && byteStride !== numComponents * componentSize) {
    // Strided access — need to unpack
    const totalElements = count * numComponents
    if (acc.componentType === 5126) {
      const result = new Float32Array(totalElements)
      const srcView = new DataView(buffer)
      for (let i = 0; i < count; i++) {
        const srcOff = byteOffset + i * byteStride
        for (let j = 0; j < numComponents; j++) {
          result[i * numComponents + j] = srcView.getFloat32(srcOff + j * 4, true)
        }
      }
      return result
    } else if (acc.componentType === 5123) {
      const result = new Uint16Array(totalElements)
      const srcView = new DataView(buffer)
      for (let i = 0; i < count; i++) {
        const srcOff = byteOffset + i * byteStride
        for (let j = 0; j < numComponents; j++) {
          result[i * numComponents + j] = srcView.getUint16(srcOff + j * 2, true)
        }
      }
      return result
    } else if (acc.componentType === 5125) {
      const result = new Uint32Array(totalElements)
      const srcView = new DataView(buffer)
      for (let i = 0; i < count; i++) {
        const srcOff = byteOffset + i * byteStride
        for (let j = 0; j < numComponents; j++) {
          result[i * numComponents + j] = srcView.getUint32(srcOff + j * 4, true)
        }
      }
      return result
    }
  }

  // Tight-packed access
  const totalBytes = count * numComponents * componentSize
  switch (acc.componentType) {
    case 5126: // FLOAT
      return new Float32Array(buffer, byteOffset, count * numComponents)
    case 5123: // UNSIGNED_SHORT
      return new Uint16Array(buffer, byteOffset, count * numComponents)
    case 5125: // UNSIGNED_INT
      return new Uint32Array(buffer, byteOffset, count * numComponents)
    case 5121: {
      // UNSIGNED_BYTE → promote to Uint16
      const src = new Uint8Array(buffer, byteOffset, totalBytes)
      const result = new Uint16Array(src.length)
      for (let i = 0; i < src.length; i++) result[i] = src[i]
      return result
    }
    default:
      return new Float32Array(buffer, byteOffset, count * numComponents)
  }
}

// ── Scene graph building ──────────────────────────────────────────────

function buildScene(json: GLTFJson, buffers: ArrayBuffer[], materials: MeshLambertMaterial[]): Group {
  const root = new Group()

  // Build all nodes first
  const nodes: Object3D[] = (json.nodes ?? []).map(nodeDef => {
    let obj: Object3D

    if (nodeDef.mesh !== undefined && json.meshes) {
      obj = buildMesh(json, buffers, materials, nodeDef.mesh)
    } else {
      obj = new Group()
    }

    // Apply transform
    if (nodeDef.matrix) {
      applyMatrix(obj, nodeDef.matrix)
    } else {
      if (nodeDef.translation) {
        obj.position.set(nodeDef.translation[0], nodeDef.translation[1], nodeDef.translation[2])
      }
      if (nodeDef.rotation) {
        const [qx, qy, qz, qw] = nodeDef.rotation
        quatToEuler(obj, qx, qy, qz, qw)
      }
      if (nodeDef.scale) {
        obj.scale.set(nodeDef.scale[0], nodeDef.scale[1], nodeDef.scale[2])
      }
    }

    return obj
  })

  // Set up parent-child relationships
  for (let i = 0; i < (json.nodes ?? []).length; i++) {
    const nodeDef = json.nodes![i]
    if (nodeDef.children) {
      for (const childIdx of nodeDef.children) {
        nodes[i].add(nodes[childIdx])
      }
    }
  }

  // Add scene root nodes
  const sceneIdx = json.scene ?? 0
  const sceneDef = json.scenes?.[sceneIdx]
  if (sceneDef?.nodes) {
    for (const nodeIdx of sceneDef.nodes) {
      root.add(nodes[nodeIdx])
    }
  } else {
    // No scene defined, add all root nodes (nodes without parents)
    const hasParent = new Set<number>()
    for (const node of json.nodes ?? []) {
      if (node.children) {
        for (const c of node.children) hasParent.add(c)
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      if (!hasParent.has(i)) root.add(nodes[i])
    }
  }

  return root
}

function buildMesh(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  materials: MeshLambertMaterial[],
  meshIdx: number,
): Object3D {
  const meshDef = json.meshes![meshIdx]
  const primitives = meshDef.primitives

  if (primitives.length === 1) {
    return buildPrimitive(json, buffers, materials, primitives[0])
  }

  // Multiple primitives → group them
  const group = new Group()
  for (const prim of primitives) {
    group.add(buildPrimitive(json, buffers, materials, prim))
  }
  return group
}

function buildPrimitive(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  materials: MeshLambertMaterial[],
  prim: GLTFPrimitive,
): Mesh {
  const geometry = new BufferGeometry()

  // Positions (required)
  if (prim.attributes.POSITION !== undefined) {
    const positions = readAccessor(json, buffers, prim.attributes.POSITION) as Float32Array
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  }

  // Normals
  if (prim.attributes.NORMAL !== undefined) {
    const normals = readAccessor(json, buffers, prim.attributes.NORMAL) as Float32Array
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  } else if (geometry.positions) {
    // Generate flat normals if none provided
    computeFlatNormals(geometry)
  }

  // UVs
  if (prim.attributes.TEXCOORD_0 !== undefined) {
    const uvs = readAccessor(json, buffers, prim.attributes.TEXCOORD_0) as Float32Array
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  }

  // Indices
  if (prim.indices !== undefined) {
    const indices = readAccessor(json, buffers, prim.indices)
    geometry.setIndex(indices)
  }

  // Material
  let material: MeshLambertMaterial
  if (prim.material !== undefined && prim.material < materials.length) {
    material = materials[prim.material]
  } else {
    material = new MeshLambertMaterial({ color: new Color(0.8, 0.8, 0.8) })
  }

  const mesh = new Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function computeFlatNormals(geometry: BufferGeometry): void {
  const pos = geometry.positions
  if (!pos) return
  const normals = new Float32Array(pos.length)
  const indices = geometry.indices

  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3
      const ib = indices[i + 1] * 3
      const ic = indices[i + 2] * 3

      const e1x = pos[ib] - pos[ia],
        e1y = pos[ib + 1] - pos[ia + 1],
        e1z = pos[ib + 2] - pos[ia + 2]
      const e2x = pos[ic] - pos[ia],
        e2y = pos[ic + 1] - pos[ia + 1],
        e2z = pos[ic + 2] - pos[ia + 2]
      let nx = e1y * e2z - e1z * e2y
      let ny = e1z * e2x - e1x * e2z
      let nz = e1x * e2y - e1y * e2x
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      nx /= len
      ny /= len
      nz /= len

      // Accumulate
      for (const idx of [ia, ib, ic]) {
        normals[idx] += nx
        normals[idx + 1] += ny
        normals[idx + 2] += nz
      }
    }
    // Normalize accumulated normals
    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2) || 1
      normals[i] /= len
      normals[i + 1] /= len
      normals[i + 2] /= len
    }
  } else {
    // Non-indexed: compute per-face
    for (let i = 0; i < pos.length; i += 9) {
      const e1x = pos[i + 3] - pos[i],
        e1y = pos[i + 4] - pos[i + 1],
        e1z = pos[i + 5] - pos[i + 2]
      const e2x = pos[i + 6] - pos[i],
        e2y = pos[i + 7] - pos[i + 1],
        e2z = pos[i + 8] - pos[i + 2]
      let nx = e1y * e2z - e1z * e2y
      let ny = e1z * e2x - e1x * e2z
      let nz = e1x * e2y - e1y * e2x
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      nx /= len
      ny /= len
      nz /= len
      normals[i] = nx
      normals[i + 1] = ny
      normals[i + 2] = nz
      normals[i + 3] = nx
      normals[i + 4] = ny
      normals[i + 5] = nz
      normals[i + 6] = nx
      normals[i + 7] = ny
      normals[i + 8] = nz
    }
  }

  geometry.normals = normals
}

// ── Transform helpers ─────────────────────────────────────────────────

function quatToEuler(obj: Object3D, qx: number, qy: number, qz: number, qw: number): void {
  // Convert quaternion to XYZ Euler angles
  const sinr = 2 * (qw * qx + qy * qz)
  const cosr = 1 - 2 * (qx * qx + qy * qy)
  const rx = Math.atan2(sinr, cosr)
  const sinp = 2 * (qw * qy - qz * qx)
  const ry = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)
  const siny = 2 * (qw * qz + qx * qy)
  const cosy = 1 - 2 * (qy * qy + qz * qz)
  const rz = Math.atan2(siny, cosy)
  obj.rotation.set(rx, ry, rz)
}

function applyMatrix(obj: Object3D, m: number[]): void {
  // Extract translation
  obj.position.set(m[12], m[13], m[14])

  // Extract scale
  const sx = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2])
  const sy = Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6])
  const sz = Math.sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10])
  obj.scale.set(sx, sy, sz)

  // Extract rotation (remove scale from rotation columns)
  const isx = 1 / sx,
    isy = 1 / sy
  const r00 = m[0] * isx,
    r10 = m[1] * isx,
    r20 = m[2] * isx
  const r01 = m[4] * isy,
    r11 = m[5] * isy
  const r12 = m[6] * (1 / sz),
    r22 = m[10] * (1 / sz)

  // XYZ Euler extraction
  const ry = Math.asin(Math.max(-1, Math.min(1, -r20)))
  if (Math.abs(r20) < 0.9999) {
    obj.rotation.set(Math.atan2(r12, r22), ry, Math.atan2(r10, r00))
  } else {
    obj.rotation.set(Math.atan2(-r01, r11), ry, 0)
  }
}
