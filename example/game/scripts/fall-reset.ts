import { damagePlayer, state } from '../lib/game-state'

import type { ManaScript } from 'mana-engine/game'

export default {
  params: {
    minY: { type: 'number', default: -10 },
    resetX: { type: 'number', default: 0 },
    resetY: { type: 'number', default: 3 },
  },
  update(ctx) {
    const { rigidBody, params } = ctx
    if (!rigidBody || state.playerDead) return

    const pos = rigidBody.translation()
    if (pos.y < (params.minY as number)) {
      rigidBody.setTranslation({ x: params.resetX as number, y: params.resetY as number, z: 0 }, true)
      rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
      damagePlayer()
    }
  },
} satisfies ManaScript
