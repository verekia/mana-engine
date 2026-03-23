import type { ManaScript } from 'mana-engine/game'

export default {
  update({ rigidBody }) {
    if (rigidBody) {
      rigidBody.setAngvel({ x: 0, y: 2, z: 0 }, true)
    }
  },
} satisfies ManaScript
