import type { ManaScript } from 'mana-engine/game'

export default {
  params: {
    speed: { type: 'number', default: 2 },
  },
  update({ rigidBody, params }) {
    if (rigidBody) {
      const speed = params.speed as number
      rigidBody.setAngvel({ x: 0, y: speed, z: 0 }, true)
    }
  },
} satisfies ManaScript
