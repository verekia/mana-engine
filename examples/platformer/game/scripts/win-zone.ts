import type { ManaScript } from 'mana-engine/game'

/** Per-entity triggered state to avoid shared module-level variables. */
const triggeredMap = new WeakMap<object, boolean>()

export default {
  init(ctx) {
    triggeredMap.set(ctx.entity as object, false)
  },
  update(ctx) {
    const entityObj = ctx.entity as object
    if (triggeredMap.get(entityObj)) return

    const playerPos = ctx.findEntityPosition('Player')
    if (!playerPos) return

    const pos = ctx.getPosition()
    const dx = playerPos.x - pos.x
    const dy = playerPos.y - pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 2) {
      triggeredMap.set(entityObj, true)
      document.dispatchEvent(new CustomEvent('mana:level-complete'))
    }
  },
} satisfies ManaScript
