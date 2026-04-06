import type { ManaScript } from 'mana-engine/game'

export default {
  params: {
    name: { type: 'string', default: 'mixamo.com' },
  },
  init(ctx) {
    ctx.playAnimation(ctx.params.name as string, { loop: true })
  },
} satisfies ManaScript
