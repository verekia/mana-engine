// Basis Universal transcoder for nanothree
//
// Loads the Basis Universal WASM transcoder on first use and caches it.
// Provides transcodeKTX2toRGBA() to decode KTX2 textures to RGBA8 pixel data.

// ── Basis module types (Embind-exposed API) ──────────────────────────

interface BasisModule {
  initializeBasis(): void
  KTX2File: new (data: Uint8Array) => KTX2File
}

interface KTX2File {
  isValid(): boolean
  getWidth(): number
  getHeight(): number
  getLevels(): number
  getHasAlpha(): boolean
  startTranscoding(): boolean
  getImageTranscodedSizeInBytes(level: number, layer: number, face: number, format: number): number
  transcodeImage(
    dst: Uint8Array,
    level: number,
    layer: number,
    face: number,
    format: number,
    flags: number,
    rowPitch: number,
    outputRows: number,
  ): boolean
  close(): void
  delete(): void
}

/** Basis transcoder format constant for uncompressed RGBA32. */
const TRANSCODER_FORMAT_RGBA32 = 13

// ── Cached module singleton ──────────────────────────────────────────

let cachedModule: BasisModule | null = null
let loadingPromise: Promise<BasisModule> | null = null

async function loadBasisTranscoder(transcoderPath: string): Promise<BasisModule> {
  if (cachedModule) return cachedModule
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const [jsText, wasmBinary] = await Promise.all([
      fetch(transcoderPath + 'basis_transcoder.js').then(r => r.text()),
      fetch(transcoderPath + 'basis_transcoder.wasm').then(r => r.arrayBuffer()),
    ])

    // The transcoder is a UMD module that defines BASIS.
    const fn = new Function('module', 'exports', jsText + '\nreturn BASIS;')
    const BASIS = fn({}, {})

    cachedModule = await (BASIS({ wasmBinary }) as Promise<BasisModule>)
    cachedModule!.initializeBasis()
    return cachedModule!
  })()

  return loadingPromise
}

// ── Public API ───────────────────────────────────────────────────────

export interface TranscodedImage {
  width: number
  height: number
  rgba: Uint8Array
}

/**
 * Transcode a KTX2 buffer to RGBA8 pixel data using the Basis Universal transcoder.
 * @param transcoderPath URL path to the directory containing basis_transcoder.js/wasm (with trailing slash)
 * @param ktx2Data The raw KTX2 file bytes
 */
export async function transcodeKTX2toRGBA(transcoderPath: string, ktx2Data: ArrayBuffer): Promise<TranscodedImage> {
  const module = await loadBasisTranscoder(transcoderPath)

  const ktx2File = new module.KTX2File(new Uint8Array(ktx2Data))

  if (!ktx2File.isValid()) {
    ktx2File.close()
    ktx2File.delete()
    throw new Error('[nanothree] Invalid KTX2 file')
  }

  const width = ktx2File.getWidth()
  const height = ktx2File.getHeight()

  if (!ktx2File.startTranscoding()) {
    ktx2File.close()
    ktx2File.delete()
    throw new Error('[nanothree] KTX2 startTranscoding failed')
  }

  // Transcode level 0 to RGBA32
  const size = ktx2File.getImageTranscodedSizeInBytes(0, 0, 0, TRANSCODER_FORMAT_RGBA32)
  const rgba = new Uint8Array(size)
  const ok = ktx2File.transcodeImage(rgba, 0, 0, 0, TRANSCODER_FORMAT_RGBA32, 0, -1, -1)

  ktx2File.close()
  ktx2File.delete()

  if (!ok) {
    throw new Error('[nanothree] KTX2 transcodeImage failed')
  }

  return { width, height, rgba }
}
