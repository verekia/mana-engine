import { AdditiveBlending, Group, InstancedSprite, NormalBlending, type Object3D } from '../../nanothree/index.ts'

import type { ParticleData } from '../../scene-data.ts'

interface Particle {
  age: number
  lifetime: number
  vx: number
  vy: number
  vz: number
  ox: number
  oy: number
  oz: number
  active: boolean
}

interface ParticleEmitter {
  entityId: string
  config: ParticleEmitterConfig
  particles: Particle[]
  sprite: InstancedSprite
  container: Group
  emitAccumulator: number
  startColor: [number, number, number]
  endColor: [number, number, number]
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
  blending: 'normal' | 'additive'
  loop: boolean
  burst: boolean
}

function hexToRgb(hex: string): [number, number, number] {
  const c = parseInt(hex.replace('#', ''), 16)
  return [(c >> 16) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255]
}

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
    blending: data?.blending ?? 'additive',
    loop: data?.loop ?? true,
    burst: data?.burst ?? false,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Manages particle emitters for the nanothree adapter.
 * Uses InstancedSprite for GPU-billboarded instanced rendering — one draw call per emitter.
 */
export class NanothreeParticleHelper {
  private emitters = new Map<string, ParticleEmitter>()

  addEmitter(entityId: string, data: ParticleData | undefined, parent: Object3D): void {
    const config = resolveConfig(data)
    const container = new Group()
    parent.add(container)

    const startColor = hexToRgb(config.startColor)
    const endColor = hexToRgb(config.endColor)

    const blending = config.blending === 'additive' ? AdditiveBlending : NormalBlending
    const sprite = new InstancedSprite(config.maxParticles, blending)
    sprite.count = 0 // No visible particles initially
    container.add(sprite)

    const particles: Particle[] = []
    for (let i = 0; i < config.maxParticles; i++) {
      particles.push({
        age: 0,
        lifetime: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        ox: 0,
        oy: 0,
        oz: 0,
        active: false,
      })
    }

    const emitter: ParticleEmitter = {
      entityId,
      config,
      particles,
      sprite,
      container,
      emitAccumulator: 0,
      startColor,
      endColor,
      active: true,
    }

    if (config.burst) {
      this.emitBurst(emitter, config.maxParticles)
    }

    this.emitters.set(entityId, emitter)
  }

  removeEmitter(entityId: string): void {
    const emitter = this.emitters.get(entityId)
    if (!emitter) return
    emitter.sprite.dispose()
    emitter.container.parent?.remove(emitter.container)
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
    emitter.sprite.count = 0
    emitter.emitAccumulator = 0
    emitter.active = true
  }

  private updateEmitter(emitter: ParticleEmitter, dt: number): void {
    const { config, particles, sprite, startColor, endColor } = emitter
    const gravity = config.gravity * -9.81

    // Continuous emission
    if (emitter.active && !config.burst) {
      emitter.emitAccumulator += dt * config.rate
      while (emitter.emitAccumulator >= 1) {
        emitter.emitAccumulator -= 1
        this.emitOne(emitter)
      }
      if (!config.loop) {
        const allUsed = particles.every(p => p.active || p.age >= p.lifetime)
        if (allUsed) emitter.active = false
      }
    }

    // Update particles and pack active ones into the InstancedSprite arrays
    let activeCount = 0
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      if (!p.active) continue

      p.age += dt
      if (p.age >= p.lifetime) {
        p.active = false
        continue
      }

      const t = p.age / p.lifetime

      // Apply gravity
      p.vy += gravity * dt

      // Integrate position
      p.ox += p.vx * dt
      p.oy += p.vy * dt
      p.oz += p.vz * dt

      // Pack into InstancedSprite arrays (active particles are tightly packed at front)
      const off3 = activeCount * 3
      sprite.positions[off3] = p.ox
      sprite.positions[off3 + 1] = p.oy
      sprite.positions[off3 + 2] = p.oz
      sprite.sizes[activeCount] = lerp(config.startSize, config.endSize, t)
      sprite.colors[off3] = lerp(startColor[0], endColor[0], t)
      sprite.colors[off3 + 1] = lerp(startColor[1], endColor[1], t)
      sprite.colors[off3 + 2] = lerp(startColor[2], endColor[2], t)
      sprite.alphas[activeCount] = lerp(config.startOpacity, config.endOpacity, t)

      activeCount++
    }

    sprite.count = activeCount
    sprite._instanceDirty = true
  }

  private emitOne(emitter: ParticleEmitter): void {
    const { config, particles } = emitter
    const p = particles.find(item => !item.active)
    if (!p) return

    p.active = true
    p.age = 0
    p.lifetime = config.lifetime
    p.ox = 0
    p.oy = 0
    p.oz = 0

    // Random direction within cone
    const spreadRad = (config.spread * Math.PI) / 180
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * spreadRad
    const sinPhi = Math.sin(phi)
    p.vx = Math.cos(theta) * sinPhi * config.speed
    p.vy = Math.cos(phi) * config.speed
    p.vz = Math.sin(theta) * sinPhi * config.speed
  }

  private emitBurst(emitter: ParticleEmitter, count: number): void {
    for (let i = 0; i < Math.min(count, emitter.config.maxParticles); i++) {
      this.emitOne(emitter)
    }
    emitter.active = false
  }
}
