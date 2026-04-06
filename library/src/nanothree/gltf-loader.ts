// GLTF/GLB loader for nanothree
//
// Parses GLTF 2.0 (JSON) and GLB (binary) formats.
// Builds a nanothree scene graph from the GLTF node hierarchy with:
// - Mesh geometry (positions, normals, UVs, indices)
// - Draco-compressed mesh decompression (KHR_draco_mesh_compression)
// - Lambert materials with optional albedo texture
// - Shadow properties (castShadow, receiveShadow) applied to all meshes
//
// Animation support: parses GLTF animation channels/samplers into
// AnimationClip/KeyframeTrack for node-level transform animation
// (translation, rotation, scale) and skeletal/skinned animation
// via Bone/Skeleton/SkinnedMesh.
//
// Does not support: morph targets, cameras, lights,
// sparse accessors, or multi-primitive meshes with
// different materials.

import { AnimationClip, KeyframeTrack, type TrackPath } from './animation'
import { transcodeKTX2toRGBA } from './basis-transcoder'
import { Color, Group, Object3D } from './core'
import { decodeDracoData } from './draco-decoder'
import { BufferGeometry, Float32BufferAttribute } from './geometry'
import { MeshLambertMaterial, NanoTexture } from './material'
import { Mesh } from './mesh'
import { Bone, Skeleton, SkinnedMesh } from './skinned-mesh'

// ── GLTF JSON types (subset) ──────────────────────────────────────────

interface GLTFSkin {
  inverseBindMatrices?: number
  joints: number[]
  skeleton?: number
  name?: string
}

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
  animations?: GLTFAnimation[]
  skins?: GLTFSkin[]
}

interface GLTFAnimation {
  name?: string
  channels: GLTFChannel[]
  samplers: GLTFAnimationSampler[]
}

interface GLTFChannel {
  sampler: number
  target: {
    node?: number
    path: string // 'translation' | 'rotation' | 'scale' | 'weights'
  }
}

interface GLTFAnimationSampler {
  input: number // accessor index for keyframe times
  output: number // accessor index for keyframe values
  interpolation?: string // 'LINEAR' | 'STEP' | 'CUBICSPLINE'
}

interface GLTFNode {
  name?: string
  mesh?: number
  skin?: number
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
  extensions?: {
    KHR_draco_mesh_compression?: {
      bufferView: number
      attributes: Record<string, number>
    }
  }
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
  extensions?: {
    EXT_texture_webp?: { source: number }
    EXT_texture_avif?: { source: number }
    KHR_texture_basisu?: { source: number }
  }
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
  animations: AnimationClip[]
}

// ── GLTFLoader class ──────────────────────────────────────────────────

// ── GLTFResult cloning ───────────────────────────────────────────────
// Deep-clones the Object3D hierarchy so each consumer gets independent
// transforms and skeleton state, while sharing geometry & material GPU data.

function cloneObject3D(src: Object3D): Object3D {
  let dst: Object3D
  if ((src as any).isSkinnedMesh) {
    const sm = src as SkinnedMesh
    dst = new SkinnedMesh(sm.geometry, sm.material)
  } else if ((src as any).isMesh) {
    const m = src as Mesh
    dst = new Mesh(m.geometry, m.material)
  } else if ((src as any).isBone) {
    dst = new Bone()
  } else {
    dst = new Group()
  }
  dst.position.set(src.position.x, src.position.y, src.position.z)
  dst.rotation.set(src.rotation.x, src.rotation.y, src.rotation.z)
  dst.scale.set(src.scale.x, src.scale.y, src.scale.z)
  dst.visible = src.visible
  dst.castShadow = src.castShadow
  dst.receiveShadow = src.receiveShadow
  if (src._quaternion) dst._quaternion = [...src._quaternion]
  if ((src as any)._gltfNodeIndex !== undefined) {
    ;(dst as any)._gltfNodeIndex = (src as any)._gltfNodeIndex
  }
  for (const child of src.children) {
    dst.add(cloneObject3D(child))
  }
  return dst
}

function collectNodes(root: Object3D, map: Map<number, Object3D>): void {
  const idx = (root as any)._gltfNodeIndex
  if (idx !== undefined) map.set(idx, root)
  for (const child of root.children) collectNodes(child, map)
}

function cloneGLTFResult(src: GLTFResult, srcNodeMap: Map<number, Object3D>): GLTFResult {
  const scene = cloneObject3D(src.scene) as Group
  // Build a node map for the clone to re-bind skeletons
  const dstNodeMap = new Map<number, Object3D>()
  collectNodes(scene, dstNodeMap)

  // Re-bind skeletons: find SkinnedMesh nodes and reconstruct their skeletons
  // using the cloned Bone instances that share the same _gltfNodeIndex
  const rebindSkinned = (node: Object3D) => {
    if ((node as any).isSkinnedMesh) {
      const srcSM = findMatchingSrc(srcNodeMap, (node as any)._gltfNodeIndex) as SkinnedMesh | null
      if (srcSM?.skeleton) {
        const clonedBones = srcSM.skeleton.bones.map(srcBone => {
          const idx = (srcBone as any)._gltfNodeIndex as number
          return (dstNodeMap.get(idx) as Bone) ?? srcBone
        })
        const boneInverses = srcSM.skeleton.boneInverses.map(inv => {
          const copy = new Float32Array(16)
          copy.set(inv)
          return copy
        })
        const skeleton = new Skeleton(clonedBones, boneInverses)
        ;(node as SkinnedMesh).bind(skeleton)
      }
    }
    for (const child of node.children) rebindSkinned(child)
  }
  rebindSkinned(scene)

  return { scene, animations: src.animations }
}

function findMatchingSrc(srcNodeMap: Map<number, Object3D>, idx: number | undefined): Object3D | null {
  if (idx === undefined) return null
  return srcNodeMap.get(idx) ?? null
}

// ── URL → parsed result cache ────────────────────────────────────────

const gltfCache = new Map<string, { result: GLTFResult; nodeMap: Map<number, Object3D> }>()
const gltfPending = new Map<string, Promise<{ result: GLTFResult; nodeMap: Map<number, Object3D> }>>()

export class GLTFLoader {
  private dracoDecoderPath: string | null = null
  private basisTranscoderPath: string | null = null

  /**
   * Set the URL path to the directory containing Draco decoder files.
   * Required for loading models with KHR_draco_mesh_compression.
   * The path must end with a trailing slash (e.g. '/__mana/draco/').
   */
  setDracoDecoderPath(path: string): this {
    this.dracoDecoderPath = path
    return this
  }

  /**
   * Set the URL path to the directory containing Basis Universal transcoder files.
   * Required for loading models with KHR_texture_basisu (KTX2 textures).
   * The path must end with a trailing slash (e.g. '/__mana/basis/').
   */
  setBasisTranscoderPath(path: string): this {
    this.basisTranscoderPath = path
    return this
  }

  /**
   * Load a GLTF/GLB file from a URL.
   * Results are cached by URL — subsequent loads of the same URL return a
   * deep-cloned scene graph that shares geometry and material GPU data but
   * has independent transforms and skeleton state.
   */
  load(
    url: string,
    onLoad: (result: GLTFResult) => void,
    _onProgress?: unknown,
    onError?: (err: unknown) => void,
  ): void {
    const cached = gltfCache.get(url)
    if (cached) {
      // Defer so the caller can finish parenting the entity before onLoad fires
      queueMicrotask(() => onLoad(cloneGLTFResult(cached.result, cached.nodeMap)))
      return
    }

    let pending = gltfPending.get(url)
    if (!pending) {
      pending = fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
          return res.arrayBuffer()
        })
        .then(buffer => this.parse(buffer, url))
        .then(result => {
          const nodeMap = new Map<number, Object3D>()
          collectNodes(result.scene, nodeMap)
          const entry = { result, nodeMap }
          gltfCache.set(url, entry)
          gltfPending.delete(url)
          return entry
        })
        .catch(err => {
          gltfPending.delete(url)
          throw err
        })
      gltfPending.set(url, pending)
    }

    pending
      .then(entry => {
        onLoad(cloneGLTFResult(entry.result, entry.nodeMap))
      })
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

    // Load textures (handles standard images, WebP, AVIF, and KTX2/Basis)
    const textures = await loadTextures(json, buffers, baseUrl, this.basisTranscoderPath)

    // Build materials
    const materials = buildMaterials(json, textures)

    // Build scene graph (async — Draco primitives need async decode)
    const scene = await buildScene(json, buffers, materials, this.dracoDecoderPath)

    // Build animations
    const animations = buildAnimations(json, buffers)

    return { scene, animations }
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

/** Load a single GLTF image as an ImageBitmap. Handles standard images, WebP, AVIF via createImageBitmap. */
async function loadImageBitmap(
  img: GLTFImage,
  buffers: ArrayBuffer[],
  bufferViews: GLTFBufferView[],
  baseUrl: string,
): Promise<ImageBitmap | null> {
  try {
    if (img.bufferView !== undefined) {
      const bv = bufferViews[img.bufferView]
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
}

/** Load a KTX2 image via the Basis Universal transcoder, returning an ImageBitmap with RGBA pixels. */
async function loadKTX2Image(
  img: GLTFImage,
  buffers: ArrayBuffer[],
  bufferViews: GLTFBufferView[],
  baseUrl: string,
  basisTranscoderPath: string,
): Promise<ImageBitmap | null> {
  try {
    let ktx2Data: ArrayBuffer
    if (img.bufferView !== undefined) {
      const bv = bufferViews[img.bufferView]
      ktx2Data = buffers[bv.buffer].slice(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)
    } else if (img.uri) {
      const url = img.uri.startsWith('data:') || img.uri.startsWith('http') ? img.uri : baseUrl + img.uri
      const res = await fetch(url)
      ktx2Data = await res.arrayBuffer()
    } else {
      return null
    }

    const { width, height, rgba } = await transcodeKTX2toRGBA(basisTranscoderPath, ktx2Data)
    const clamped = new Uint8ClampedArray(rgba.length)
    clamped.set(rgba)
    const imageData = new ImageData(clamped, width, height)
    return await createImageBitmap(imageData, { premultiplyAlpha: 'none' })
  } catch (err) {
    console.warn('[nanothree] Failed to load KTX2 image:', err)
  }
  return null
}

async function loadTextures(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  baseUrl: string,
  basisTranscoderPath: string | null,
): Promise<(NanoTexture | null)[]> {
  if (!json.textures || !json.images) return []

  const bufferViews = json.bufferViews ?? []

  // Pre-load all images as bitmaps (lazy — only loaded when referenced by a texture)
  const imageCache = new Map<number, Promise<ImageBitmap | null>>()

  function getImage(idx: number, forceKTX2 = false): Promise<ImageBitmap | null> {
    const key = forceKTX2 ? idx + 100000 : idx
    let promise = imageCache.get(key)
    if (promise) return promise
    const img = json.images![idx]
    if (forceKTX2 && basisTranscoderPath) {
      promise = loadKTX2Image(img, buffers, bufferViews, baseUrl, basisTranscoderPath)
    } else {
      promise = loadImageBitmap(img, buffers, bufferViews, baseUrl)
    }
    imageCache.set(key, promise)
    return promise
  }

  // Resolve each texture ref, preferring extension-provided sources
  const texturePromises = json.textures.map(async (texRef): Promise<NanoTexture | null> => {
    let sourceIdx: number | undefined
    let isKTX2 = false

    // Prefer browser-native formats first, then KTX2 as fallback
    if (texRef.extensions?.EXT_texture_webp !== undefined) {
      sourceIdx = texRef.extensions.EXT_texture_webp.source
    } else if (texRef.extensions?.EXT_texture_avif !== undefined) {
      sourceIdx = texRef.extensions.EXT_texture_avif.source
    } else if (texRef.extensions?.KHR_texture_basisu !== undefined) {
      sourceIdx = texRef.extensions.KHR_texture_basisu.source
      isKTX2 = true
    } else {
      sourceIdx = texRef.source
    }

    if (sourceIdx === undefined) return null

    const bitmap = await getImage(sourceIdx, isKTX2)
    if (!bitmap) return null
    return new NanoTexture(bitmap)
  })

  return Promise.all(texturePromises)
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
    } else if (acc.componentType === 5121) {
      // UNSIGNED_BYTE strided → promote to Uint16
      const result = new Uint16Array(totalElements)
      const srcView = new DataView(buffer)
      for (let i = 0; i < count; i++) {
        const srcOff = byteOffset + i * byteStride
        for (let j = 0; j < numComponents; j++) {
          result[i * numComponents + j] = srcView.getUint8(srcOff + j)
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

async function buildScene(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  materials: MeshLambertMaterial[],
  dracoDecoderPath: string | null,
): Promise<Group> {
  const root = new Group()

  // Collect all joint node indices from skins (so we create Bone instances for them)
  const jointNodes = new Set<number>()
  if (json.skins) {
    for (const skin of json.skins) {
      for (const j of skin.joints) jointNodes.add(j)
    }
  }

  // Build all nodes first (async because Draco primitives need decode)
  const nodes: Object3D[] = await Promise.all(
    (json.nodes ?? []).map(async (nodeDef, nodeIdx) => {
      let obj: Object3D
      const isSkinned = nodeDef.skin !== undefined

      if (nodeDef.mesh !== undefined && json.meshes) {
        obj = await buildMesh(json, buffers, materials, nodeDef.mesh, dracoDecoderPath, isSkinned)
      } else if (jointNodes.has(nodeIdx)) {
        obj = new Bone()
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
          obj._quaternion = [qx, qy, qz, qw]
        }
        if (nodeDef.scale) {
          obj.scale.set(nodeDef.scale[0], nodeDef.scale[1], nodeDef.scale[2])
        }
      }

      return obj
    }),
  )

  // Tag each node with its GLTF index so AnimationMixer can map tracks correctly
  for (let i = 0; i < nodes.length; i++) {
    ;(nodes[i] as any)._gltfNodeIndex = i
  }

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

  // Build skeletons and bind to skinned meshes
  if (json.skins) {
    // Compute initial world matrices so bind matrices are correct
    const computeWorldMatrices = (node: Object3D, parentWorld: Float32Array | null) => {
      node._updateWorldMatrix(parentWorld)
      for (const child of node.children) {
        computeWorldMatrices(child, node._worldMatrix)
      }
    }
    for (const child of root.children) {
      computeWorldMatrices(child, root._worldMatrix)
    }

    for (let si = 0; si < json.skins.length; si++) {
      const skinDef = json.skins[si]
      const bones = skinDef.joints.map(ji => nodes[ji] as Bone)

      let boneInverses: Float32Array[] | undefined
      if (skinDef.inverseBindMatrices !== undefined) {
        const ibm = readAccessor(json, buffers, skinDef.inverseBindMatrices) as Float32Array
        boneInverses = []
        for (let i = 0; i < bones.length; i++) {
          const inv = new Float32Array(16)
          for (let j = 0; j < 16; j++) inv[j] = ibm[i * 16 + j]
          boneInverses.push(inv)
        }
      }

      const skeleton = new Skeleton(bones, boneInverses)

      // Find all nodes that reference this skin and bind their SkinnedMesh descendants
      for (let ni = 0; ni < (json.nodes ?? []).length; ni++) {
        if (json.nodes![ni].skin === si) {
          bindSkinnedMeshes(nodes[ni], skeleton)
        }
      }
    }
  }

  return root
}

/** Recursively bind all SkinnedMesh nodes to the given skeleton. */
function bindSkinnedMeshes(node: Object3D, skeleton: Skeleton): void {
  if ((node as any).isSkinnedMesh) {
    ;(node as SkinnedMesh).bind(skeleton)
  }
  for (const child of node.children) {
    bindSkinnedMeshes(child, skeleton)
  }
}

async function buildMesh(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  materials: MeshLambertMaterial[],
  meshIdx: number,
  dracoDecoderPath: string | null,
  isSkinned = false,
): Promise<Object3D> {
  const meshDef = json.meshes![meshIdx]
  const primitives = meshDef.primitives

  if (primitives.length === 1) {
    return buildPrimitive(json, buffers, materials, primitives[0], dracoDecoderPath, isSkinned)
  }

  // Multiple primitives → group them
  const group = new Group()
  const built = await Promise.all(
    primitives.map(prim => buildPrimitive(json, buffers, materials, prim, dracoDecoderPath, isSkinned)),
  )
  for (const mesh of built) {
    group.add(mesh)
  }
  return group
}

async function buildPrimitive(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  materials: MeshLambertMaterial[],
  prim: GLTFPrimitive,
  dracoDecoderPath: string | null,
  isSkinned = false,
): Promise<Mesh | SkinnedMesh> {
  const geometry = new BufferGeometry()
  const dracoExt = prim.extensions?.KHR_draco_mesh_compression

  if (dracoExt) {
    // ── Draco-compressed primitive ─────────────────────────────────
    if (!dracoDecoderPath) {
      console.warn(
        '[nanothree] Model uses Draco compression but no decoder path is set. Call GLTFLoader.setDracoDecoderPath().',
      )
    } else {
      const bv = json.bufferViews![dracoExt.bufferView]
      const compressedData = buffers[bv.buffer].slice(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)
      const decoded = await decodeDracoData(dracoDecoderPath, compressedData, dracoExt.attributes)

      if (decoded.positions) {
        geometry.setAttribute('position', new Float32BufferAttribute(decoded.positions, 3))
      }
      if (decoded.normals) {
        geometry.setAttribute('normal', new Float32BufferAttribute(decoded.normals, 3))
      } else if (decoded.positions) {
        computeFlatNormals(geometry)
      }
      if (decoded.uvs) {
        geometry.setAttribute('uv', new Float32BufferAttribute(decoded.uvs, 2))
      }
      if (decoded.indices) {
        geometry.setIndex(decoded.indices)
      }
    }
  } else {
    // ── Standard (uncompressed) primitive ──────────────────────────
    if (prim.attributes.POSITION !== undefined) {
      const positions = readAccessor(json, buffers, prim.attributes.POSITION) as Float32Array
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    }

    if (prim.attributes.NORMAL !== undefined) {
      const normals = readAccessor(json, buffers, prim.attributes.NORMAL) as Float32Array
      geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    } else if (geometry.positions) {
      computeFlatNormals(geometry)
    }

    if (prim.attributes.TEXCOORD_0 !== undefined) {
      const uvs = readAccessor(json, buffers, prim.attributes.TEXCOORD_0) as Float32Array
      geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    }

    if (prim.indices !== undefined) {
      const indices = readAccessor(json, buffers, prim.indices)
      geometry.setIndex(indices)
    }
  }

  // Skinning attributes (JOINTS_0 and WEIGHTS_0)
  if (isSkinned) {
    if (prim.attributes.JOINTS_0 !== undefined) {
      const jointsRaw = readAccessor(json, buffers, prim.attributes.JOINTS_0)
      // Convert integer joint indices to Float32Array
      const joints = new Float32Array(jointsRaw.length)
      for (let i = 0; i < jointsRaw.length; i++) joints[i] = jointsRaw[i]
      geometry.setAttribute('skinIndex', new Float32BufferAttribute(joints, 4))
    }

    if (prim.attributes.WEIGHTS_0 !== undefined) {
      const weightsRaw = readAccessor(json, buffers, prim.attributes.WEIGHTS_0)
      let weights: Float32Array
      if (weightsRaw instanceof Float32Array) {
        weights = weightsRaw
      } else {
        // Normalized integer weights → [0, 1] floats
        const acc = json.accessors![prim.attributes.WEIGHTS_0]
        const max = acc.componentType === 5121 ? 255 : 65535
        weights = new Float32Array(weightsRaw.length)
        for (let i = 0; i < weightsRaw.length; i++) weights[i] = weightsRaw[i] / max
      }
      geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
    }
  }

  // Material
  let material: MeshLambertMaterial
  if (prim.material !== undefined && prim.material < materials.length) {
    material = materials[prim.material]
  } else {
    material = new MeshLambertMaterial({ color: new Color(0.8, 0.8, 0.8) })
  }

  if (isSkinned && geometry.skinIndices && geometry.skinWeights) {
    const mesh = new SkinnedMesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
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

// ── Animation building ───────────────────────────────────────────────

const SUPPORTED_PATHS: Record<string, TrackPath> = {
  translation: 'translation',
  rotation: 'rotation',
  scale: 'scale',
}

function buildAnimations(json: GLTFJson, buffers: ArrayBuffer[]): AnimationClip[] {
  if (!json.animations || json.animations.length === 0) return []

  return json.animations.map((animDef, idx) => {
    const tracks: KeyframeTrack[] = []
    let duration = 0

    for (const channel of animDef.channels) {
      const path = SUPPORTED_PATHS[channel.target.path]
      if (!path || channel.target.node === undefined) continue

      const sampler = animDef.samplers[channel.sampler]
      if (!sampler) continue

      const times = readAccessor(json, buffers, sampler.input) as Float32Array
      const values = readAccessor(json, buffers, sampler.output) as Float32Array

      // Track the max time to compute clip duration
      if (times.length > 0) {
        const maxTime = times[times.length - 1]
        if (maxTime > duration) duration = maxTime
      }

      tracks.push(new KeyframeTrack(channel.target.node, path, times, values))
    }

    const name = animDef.name ?? `animation_${idx}`
    return new AnimationClip(name, duration, tracks)
  })
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
