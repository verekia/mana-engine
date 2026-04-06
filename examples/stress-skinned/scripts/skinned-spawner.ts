import type { ManaScript } from 'mana-engine/game'

export default {
  params: {
    count: { type: 'number', default: 1000 },
    spacing: { type: 'number', default: 2 },
  },
  init(ctx) {
    const count = ctx.params.count as number
    const spacing = ctx.params.spacing as number
    const cols = Math.ceil(Math.sqrt(count))

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols
      const x = (col - (cols - 1) / 2) * spacing
      const z = (row - (cols - 1) / 2) * spacing

      ctx.instantiatePrefab('michelle', { x, y: 0, z })
    }
  },
} satisfies ManaScript
