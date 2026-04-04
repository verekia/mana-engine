import { Group, type Node, Sprite, SpriteMaterial } from 'voidcore'

import type { ParticleData } from '../../scene-data.ts'

interface Particle {
  sprite: Sprite
  age: number
  lifetime: number
  vx: number
  vy: number
  vz: number
  /** Base position (emitter origin at spawn time). */
  ox: number
  oy: number
  oz: number
  active: boolean
}

interface ParticleEmitter {
  entityId: string
  config: ParticleEmitterConfig
  particles: Particle[]
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
  texture: string
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
    texture: data?.texture ?? '',
    blending: data?.blending ?? 'additive',
    loop: data?.loop ?? true,
    burst: data?.burst ?? false,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Manages particle emitters for the VoidCore adapter.
 * Uses individual Sprite objects with SpriteMaterial. CPU-driven updates.
 * SpriteMaterial custom shaders (WGSL/GLSL) could be added for advanced effects.
 */
export class VoidcoreParticleHelper {
  private emitters = new Map<string, ParticleEmitter>()

  addEmitter(entityId: string, data: ParticleData | undefined, parent: Node): void {
    const config = resolveConfig(data)
    const container = new Group()
    parent.add(container)

    const startColor = hexToRgb(config.startColor)
    const endColor = hexToRgb(config.endColor)

    const particles: Particle[] = []
    for (let i = 0; i < config.maxParticles; i++) {
      const material = new SpriteMaterial({
        color: startColor,
        transparent: true,
        side: 'double',
      })
      material.opacity = 0
      const sprite = new Sprite(material)
      sprite.visible = false
      sprite.castShadow = false
      sprite.setScale(0, 0, 0)
      container.add(sprite)

      particles.push({
        sprite,
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
      p.sprite.visible = false
    }
    emitter.emitAccumulator = 0
    emitter.active = true
  }

  private updateEmitter(emitter: ParticleEmitter, dt: number): void {
    const { config, particles, startColor, endColor } = emitter
    // Gravity applies downward in scene Y (or scene Z for z-up, but particle
    // positions are in the emitter's local space which inherits the sceneRoot rotation)
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

    // Update each particle
    for (const p of particles) {
      if (!p.active) continue

      p.age += dt
      if (p.age >= p.lifetime) {
        p.active = false
        p.sprite.visible = false
        continue
      }

      const t = p.age / p.lifetime

      // Apply gravity
      p.vy += gravity * dt

      // Integrate position
      p.ox += p.vx * dt
      p.oy += p.vy * dt
      p.oz += p.vz * dt
      p.sprite.setPosition(p.ox, p.oy, p.oz)

      // Size
      const size = lerp(config.startSize, config.endSize, t)
      p.sprite.setScale(size, size, size)

      // Opacity
      const alpha = lerp(config.startOpacity, config.endOpacity, t)
      const mat = p.sprite.material as SpriteMaterial
      mat.opacity = alpha
      mat.needsUpdate = true

      // Color
      mat.color = [
        lerp(startColor[0], endColor[0], t),
        lerp(startColor[1], endColor[1], t),
        lerp(startColor[2], endColor[2], t),
      ]
    }
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
    p.sprite.setPosition(0, 0, 0)
    p.sprite.visible = true

    // Random direction within cone
    const spreadRad = (config.spread * Math.PI) / 180
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * spreadRad
    const sinPhi = Math.sin(phi)
    p.vx = Math.cos(theta) * sinPhi * config.speed
    p.vy = Math.cos(phi) * config.speed // Scene-up axis
    p.vz = Math.sin(theta) * sinPhi * config.speed
  }

  private emitBurst(emitter: ParticleEmitter, count: number): void {
    for (let i = 0; i < Math.min(count, emitter.config.maxParticles); i++) {
      this.emitOne(emitter)
    }
    emitter.active = false
  }
}
