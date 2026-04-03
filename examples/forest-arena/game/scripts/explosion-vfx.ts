import { LEVELS, state } from '../lib/game-state'

import type { ManaScript } from 'mana-engine/game'

const stateMap = new WeakMap<object, { startTime: number; maxRadius: number }>()

export default {
  init(ctx) {
    const levelInfo = LEVELS[state.level - 1]
    stateMap.set(ctx.entity as object, {
      startTime: ctx.time,
      maxRadius: levelInfo.explosionRadius,
    })

    // Set color and transparency based on current level
    const obj = ctx.entity as any
    obj.traverse?.((child: any) => {
      if (child.isMesh && child.material) {
        child.material.color.set(levelInfo.explosionColor)
        child.material.transparent = true
        child.material.opacity = 0.5
      }
    })

    ctx.setScale(0.1, 0.1, 0.1)
  },
  update(ctx) {
    const s = stateMap.get(ctx.entity as object)
    if (!s) return

    const elapsed = ctx.time - s.startTime
    const duration = 0.6
    const progress = Math.min(elapsed / duration, 1)

    // SphereGeometry default radius is 1, so scale = desired radius
    const scale = s.maxRadius * progress
    ctx.setScale(scale, scale, scale)

    // Fade out
    const obj = ctx.entity as any
    obj.traverse?.((child: any) => {
      if (child.isMesh && child.material) {
        child.material.opacity = 0.5 * (1 - progress)
      }
    })

    if (progress >= 1) {
      ctx.destroyEntity(ctx.entityId)
    }
  },
} satisfies ManaScript
