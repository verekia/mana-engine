import { attribute, vec4 } from 'three/tsl'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  type Object3D,
  Points,
  SpriteNodeMaterial,
  TextureLoader,
} from 'three/webgpu'

import { resolveAsset } from '../../assets.ts'

import type { ParticleData } from '../../scene-data.ts'

interface Particle {
  age: number
  lifetime: number
  vx: number
  vy: number
  vz: number
  active: boolean
}

interface ParticleEmitter {
  entityId: string
  config: Required<ParticleEmitterConfig>
  particles: Particle[]
  positions: Float32Array
  sizes: Float32Array
  alphas: Float32Array
  colors: Float32Array
  geometry: BufferGeometry
  points: Points
  emitAccumulator: number
  startColor: Color
  endColor: Color
  active: boolean
}

interface ParticleEmitterConfig {
  maxParticles: number
  rate: number
  lifetime: number
  speed: number
  spread: number
  startSize: number
  endSize: number
  startColor: string
  endColor: string
  startOpacity: number
  endOpacity: number
  gravity: number
  texture: string
  blending: 'normal' | 'additive'
  loop: boolean
  burst: boolean
}

const textureLoader = new TextureLoader()

function resolveConfig(data?: ParticleData): ParticleEmitterConfig {
  return {
    maxParticles: data?.maxParticles ?? 100,
    rate: data?.rate ?? 10,
    lifetime: data?.lifetime ?? 2,
    speed: data?.speed ?? 1,
    spread: data?.spread ?? 15,
    startSize: data?.startSize ?? 0.2,
    endSize: data?.endSize ?? 0,
    startColor: data?.startColor ?? '#ffffff',
    endColor: data?.endColor ?? '#ffffff',
    startOpacity: data?.startOpacity ?? 1,
    endOpacity: data?.endOpacity ?? 0,
    gravity: data?.gravity ?? 0,
    texture: data?.texture ?? '',
    blending: data?.blending ?? 'additive',
    loop: data?.loop ?? true,
    burst: data?.burst ?? false,
  }
}

/**
 * Manages GPU-friendly particle emitters for the Three.js adapter.
 * Uses Points + BufferGeometry with TSL SpriteNodeMaterial for rendering.
 */
export class ThreeParticleHelper {
  private emitters = new Map<string, ParticleEmitter>()

  addEmitter(entityId: string, data: ParticleData | undefined, parent: Object3D): void {
    const config = resolveConfig(data)
    const n = config.maxParticles

    const positions = new Float32Array(n * 3)
    const sizes = new Float32Array(n)
    const alphas = new Float32Array(n)
    const colors = new Float32Array(n * 3)

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('particleSize', new BufferAttribute(sizes, 1))
    geometry.setAttribute('particleAlpha', new BufferAttribute(alphas, 1))
    geometry.setAttribute('particleColor', new BufferAttribute(colors, 3))

    // TSL material — reads per-particle attributes for size, color, and opacity
    const material = new SpriteNodeMaterial()
    material.transparent = true
    material.depthWrite = false
    material.blending = config.blending === 'additive' ? AdditiveBlending : NormalBlending

    // Scale points by attribute
    material.scaleNode = attribute('particleSize')

    // Color from attribute
    const pColor = attribute('particleColor')
    const pAlpha = attribute('particleAlpha')
    material.colorNode = vec4(pColor, pAlpha)

    if (config.texture) {
      const texture = textureLoader.load(resolveAsset(config.texture))
      material.map = texture
    }

    const points = new Points(geometry, material)
    points.frustumCulled = false
    parent.add(points)

    const particles: Particle[] = []
    for (let i = 0; i < n; i++) {
      particles.push({ age: 0, lifetime: 0, vx: 0, vy: 0, vz: 0, active: false })
    }

    const emitter: ParticleEmitter = {
      entityId,
      config,
      particles,
      positions,
      sizes,
      alphas,
      colors,
      geometry,
      points,
      emitAccumulator: 0,
      startColor: new Color(config.startColor),
      endColor: new Color(config.endColor),
      active: true,
    }

    // Burst mode: emit all particles immediately
    if (config.burst) {
      this.emitBurst(emitter, config.maxParticles)
    }

    this.emitters.set(entityId, emitter)
  }

  removeEmitter(entityId: string): void {
    const emitter = this.emitters.get(entityId)
    if (!emitter) return
    emitter.points.parent?.remove(emitter.points)
    emitter.geometry.dispose()
    ;(emitter.points.material as SpriteNodeMaterial).dispose()
    this.emitters.delete(entityId)
  }

  update(dt: number): void {
    for (const emitter of this.emitters.values()) {
      this.updateEmitter(emitter, dt)
    }
  }

  emitParticleBurst(entityId: string, count?: number): void {
    const emitter = this.emitters.get(entityId)
    if (!emitter) return
    this.emitBurst(emitter, count ?? emitter.config.maxParticles)
  }

  resetParticles(entityId: string): void {
    const emitter = this.emitters.get(entityId)
    if (!emitter) return
    for (const p of emitter.particles) {
      p.active = false
    }
    emitter.emitAccumulator = 0
    emitter.active = true
  }

  private updateEmitter(emitter: ParticleEmitter, dt: number): void {
    const { config, particles, positions, sizes, alphas, colors } = emitter
    const gravity = config.gravity * -9.81

    // Emit new particles
    if (emitter.active && !config.burst) {
      emitter.emitAccumulator += dt * config.rate
      while (emitter.emitAccumulator >= 1) {
        emitter.emitAccumulator -= 1
        this.emitOne(emitter)
      }
      // Stop emitting if not looping and we've filled the pool
      if (!config.loop) {
        const allUsed = particles.every(p => p.active || p.age >= p.lifetime)
        if (allUsed) emitter.active = false
      }
    }

    // Update particles
    const tmpColor = new Color()
    let anyActive = false

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      if (!p.active) {
        sizes[i] = 0
        alphas[i] = 0
        continue
      }

      p.age += dt
      if (p.age >= p.lifetime) {
        p.active = false
        sizes[i] = 0
        alphas[i] = 0
        continue
      }

      anyActive = true
      const t = p.age / p.lifetime // 0..1 progress

      // Apply gravity to velocity (scene Y is up)
      p.vy += gravity * dt

      // Integrate position
      const i3 = i * 3
      positions[i3] += p.vx * dt
      positions[i3 + 1] += p.vy * dt
      positions[i3 + 2] += p.vz * dt

      // Lerp size
      sizes[i] = config.startSize + (config.endSize - config.startSize) * t

      // Lerp opacity
      alphas[i] = config.startOpacity + (config.endOpacity - config.startOpacity) * t

      // Lerp color
      tmpColor.copy(emitter.startColor).lerp(emitter.endColor, t)
      colors[i3] = tmpColor.r
      colors[i3 + 1] = tmpColor.g
      colors[i3 + 2] = tmpColor.b
    }

    // Mark buffer attributes as needing upload
    emitter.geometry.attributes.position.needsUpdate = true
    emitter.geometry.attributes.particleSize.needsUpdate = true
    emitter.geometry.attributes.particleAlpha.needsUpdate = true
    emitter.geometry.attributes.particleColor.needsUpdate = true

    // For burst mode with no loop, check if all particles are dead
    if (config.burst && !config.loop && !anyActive && !emitter.active) {
      // All done — leave emitter inactive
    }
  }

  private emitOne(emitter: ParticleEmitter): void {
    const { config, particles, positions } = emitter
    const idx = particles.findIndex(p => !p.active)
    if (idx === -1) return

    const p = particles[idx]
    p.active = true
    p.age = 0
    p.lifetime = config.lifetime

    // Reset position to origin (particles move in local space of the Points object)
    const i3 = idx * 3
    positions[i3] = 0
    positions[i3 + 1] = 0
    positions[i3 + 2] = 0

    // Random direction within emission cone
    const spreadRad = (config.spread * Math.PI) / 180
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * spreadRad
    const sinPhi = Math.sin(phi)
    p.vx = Math.cos(theta) * sinPhi * config.speed
    p.vy = Math.cos(phi) * config.speed // Up is Y
    p.vz = Math.sin(theta) * sinPhi * config.speed
  }

  private emitBurst(emitter: ParticleEmitter, count: number): void {
    for (let i = 0; i < Math.min(count, emitter.config.maxParticles); i++) {
      this.emitOne(emitter)
    }
    emitter.active = false
  }
}
