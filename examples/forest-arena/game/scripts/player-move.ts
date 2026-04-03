import { addXP, damagePlayer, LEVELS, resetState, state } from '../lib/game-state'

import type { ManaScript } from 'mana-engine/game'

const stateMap = new WeakMap<object, { invincibleTimer: number; explosionCooldown: number }>()

function dispatchStats() {
  document.dispatchEvent(
    new CustomEvent('mana:stats-changed', {
      detail: {
        health: state.playerHealth,
        maxHealth: state.maxHealth,
        xp: state.xp,
        level: state.level,
        explosionCooldown: state.explosionCooldown,
      },
    }),
  )
}

export default {
  params: {
    moveSpeed: { type: 'number', default: 6 },
  },
  init(ctx) {
    stateMap.set(ctx.entity as object, { invincibleTimer: 0, explosionCooldown: 0 })
    resetState()
    dispatchStats()

    ctx.on('enemy-killed', () => {
      addXP(1)
      dispatchStats()
    })
  },
  update(ctx) {
    const { rigidBody, input, params, dt } = ctx
    if (!rigidBody || state.playerDead) return

    const s = stateMap.get(ctx.entity as object)
    if (!s) return

    const speed = params.moveSpeed as number
    const h = input.getAxis('horizontal')
    const v = input.getAxis('vertical')

    // Movement on XY plane (z-up)
    rigidBody.setLinvel({ x: h * speed, y: v * speed, z: 0 }, true)

    // Keep on ground plane
    const pos = rigidBody.translation()
    if (Math.abs(pos.z - 1) > 0.1) {
      rigidBody.setTranslation({ x: pos.x, y: pos.y, z: 1 }, true)
    }

    // Clamp to arena bounds
    const bound = 13
    const cx = Math.max(-bound, Math.min(bound, pos.x))
    const cy = Math.max(-bound, Math.min(bound, pos.y))
    if (cx !== pos.x || cy !== pos.y) {
      rigidBody.setTranslation({ x: cx, y: cy, z: pos.z }, true)
    }

    // Update timers
    if (s.invincibleTimer > 0) s.invincibleTimer -= dt
    if (s.explosionCooldown > 0) {
      s.explosionCooldown -= dt
      state.explosionCooldown = Math.max(0, s.explosionCooldown)
    }

    // Explosion (Space)
    if (input.isKeyPressed('Space') && s.explosionCooldown <= 0) {
      const levelInfo = LEVELS[state.level - 1]
      ctx.emit('explosion', {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        radius: levelInfo.explosionRadius,
        damage: 1,
      })
      ctx.instantiatePrefab('explosion', { x: pos.x, y: pos.y, z: 0.5 })
      s.explosionCooldown = 2.0
      state.explosionCooldown = 2.0
      dispatchStats()
    }
  },
  onCollisionEnter(ctx, other) {
    if (state.playerDead) return
    const s = stateMap.get(ctx.entity as object)
    if (!s || s.invincibleTimer > 0) return

    const enemies = ctx.findEntitiesByTag('enemy')
    if (enemies.includes(other.entityId)) {
      damagePlayer()
      s.invincibleTimer = 1.5
      dispatchStats()
    }
  },
} satisfies ManaScript
