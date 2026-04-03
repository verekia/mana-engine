import { state } from '../lib/game-state'

import type { ManaScript } from 'mana-engine/game'

const SPEED = 18
const LIFETIME = 2

const deadSet = new WeakSet<object>()
const spawnTimeMap = new WeakMap<object, number>()

export default {
  init(ctx) {
    const dir = state.playerFacingRight ? 1 : -1
    spawnTimeMap.set(ctx.entity as object, ctx.time)
    if (ctx.rigidBody) {
      ctx.rigidBody.setLinvel({ x: SPEED * dir, y: 0, z: 0 }, true)
    }
  },
  update(ctx) {
    const entityObj = ctx.entity as object
    if (deadSet.has(entityObj)) return

    const spawnTime = spawnTimeMap.get(entityObj) ?? 0
    if (ctx.time - spawnTime > LIFETIME) {
      deadSet.add(entityObj)
      ctx.destroyEntity(ctx.entityId)
    }
  },
  onCollisionEnter(ctx, other) {
    const entityObj = ctx.entity as object
    if (deadSet.has(entityObj)) return

    // Ignore collision with the player who shot us
    if (other.entityId === 'player') return

    deadSet.add(entityObj)

    // Hit an enemy
    if (other.entityId.startsWith('enemy-')) {
      ctx.destroyEntity(other.entityId)
      state.enemiesKilled++
      document.dispatchEvent(new CustomEvent('mana:enemy-killed'))
      ctx.playSound('audio/explosion.mp3', { volume: 0.6 })
    } else {
      ctx.playSound('audio/explosion.mp3', { volume: 0.3 })
    }

    ctx.destroyEntity(ctx.entityId)
  },
} satisfies ManaScript
