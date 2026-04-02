import type { ManaScript } from 'mana-engine/game'

let triggered = false

export default {
  init() {
    triggered = false
  },
  update(ctx) {
    if (triggered) return

    const playerPos = ctx.findEntityPosition('Player')
    if (!playerPos) return

    const pos = ctx.getPosition()
    const dx = playerPos.x - pos.x
    const dy = playerPos.y - pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 2) {
      triggered = true
      document.dispatchEvent(new CustomEvent('mana:level-complete'))
    }
  },
} satisfies ManaScript
