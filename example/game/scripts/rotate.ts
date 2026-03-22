import type { ManaScript } from 'mana-engine/game'

export default {
  update({ entity, dt }) {
    entity.rotation.x += 0.6 * dt
    entity.rotation.y += 0.9 * dt
  },
} satisfies ManaScript
