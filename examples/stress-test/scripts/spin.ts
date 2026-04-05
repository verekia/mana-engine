import type { ManaScript } from 'mana-engine/game'

export default {
  params: {
    speed: { type: 'number', default: 2 },
  },
  update(ctx) {
    const speed = ctx.params.speed as number
    ctx.setRotation(speed * ctx.time, speed * 1.3 * ctx.time, 0)
  },
} satisfies ManaScript
