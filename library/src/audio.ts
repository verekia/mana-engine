import { resolveAsset } from './assets.ts'

/**
 * Game audio manager using the Web Audio API.
 * Supports one-shot sound effects and looping music tracks.
 * Created automatically in play mode; not available in editor edit mode.
 */
export class Audio {
  private ctx: AudioContext
  private masterGain: GainNode
  private bufferCache = new Map<string, AudioBuffer>()
  /** Active sound effect sources, keyed by a caller-provided or auto-generated ID. */
  private activeSounds = new Map<string, AudioBufferSourceNode>()
  /** Currently playing music source + gain, if any. */
  private music: { source: AudioBufferSourceNode; gain: GainNode; path: string } | null = null
  private idCounter = 0

  constructor() {
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.connect(this.ctx.destination)
  }

  private async loadBuffer(path: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(path)
    if (cached) return cached

    const resolved = resolveAsset(path)
    const response = await fetch(resolved)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer)
    this.bufferCache.set(path, audioBuffer)
    return audioBuffer
  }

  /**
   * Play a one-shot sound effect.
   * @param path Asset path relative to assets/ (e.g. 'audio/hit.mp3')
   * @param options.volume Volume multiplier 0–1 (default 1)
   * @param options.loop Whether to loop (default false)
   * @returns A sound ID that can be passed to stopSound()
   */
  async playSound(path: string, options?: { volume?: number; loop?: boolean }): Promise<string> {
    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }

    const buffer = await this.loadBuffer(path)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = options?.loop ?? false

    const gain = this.ctx.createGain()
    gain.gain.value = options?.volume ?? 1
    source.connect(gain)
    gain.connect(this.masterGain)

    const id = `snd_${++this.idCounter}`
    this.activeSounds.set(id, source)
    source.onended = () => {
      this.activeSounds.delete(id)
    }
    source.start()
    return id
  }

  /** Stop a playing sound effect by its ID. */
  stopSound(id: string): void {
    const source = this.activeSounds.get(id)
    if (source) {
      source.stop()
      this.activeSounds.delete(id)
    }
  }

  /**
   * Play a music track (looping by default). Stops any currently playing music.
   * @param path Asset path relative to assets/ (e.g. 'audio/bgm.mp3')
   * @param options.volume Volume multiplier 0–1 (default 1)
   * @param options.loop Whether to loop (default true)
   */
  async playMusic(path: string, options?: { volume?: number; loop?: boolean }): Promise<void> {
    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }

    // Stop current music if any
    this.stopMusic()

    const buffer = await this.loadBuffer(path)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = options?.loop ?? true

    const gain = this.ctx.createGain()
    gain.gain.value = options?.volume ?? 1
    source.connect(gain)
    gain.connect(this.masterGain)

    this.music = { source, gain, path }
    source.onended = () => {
      if (this.music?.source === source) {
        this.music = null
      }
    }
    source.start()
  }

  /** Stop the currently playing music track. */
  stopMusic(): void {
    if (this.music) {
      this.music.source.stop()
      this.music = null
    }
  }

  /** Set the master volume (0–1). Affects all sounds and music. */
  setMasterVolume(volume: number): void {
    this.masterGain.gain.value = volume
  }

  /** Clean up all audio resources. Called on scene dispose. */
  dispose(): void {
    for (const source of this.activeSounds.values()) {
      source.stop()
    }
    this.activeSounds.clear()
    this.stopMusic()
    this.bufferCache.clear()
    this.ctx.close()
  }
}
