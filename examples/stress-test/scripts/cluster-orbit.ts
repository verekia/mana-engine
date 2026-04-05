import type { ManaScript } from 'mana-engine/game'

interface OrbitConfig {
  orbitRadius: number
  baseAngle: number
  orbitSpeed: number
  offsetX: number
  offsetY: number
  offsetZ: number
}

const configs = new WeakMap<object, OrbitConfig>()

export default {
  init(ctx) {
    ctx.on('orbit-config', (data: unknown) => {
      const d = data as { entityId: string } & OrbitConfig
      if (d.entityId !== ctx.entityId) return
      configs.set(ctx.entity as object, d)
    })
  },
  update(ctx) {
    const cfg = configs.get(ctx.entity as object)
    if (!cfg) return
    const angle = cfg.baseAngle + ctx.time * cfg.orbitSpeed
    const cx = Math.cos(angle) * cfg.orbitRadius
    const cz = Math.sin(angle) * cfg.orbitRadius
    ctx.setPosition(cx + cfg.offsetX, cfg.offsetY, cz + cfg.offsetZ)
  },
} satisfies ManaScript
