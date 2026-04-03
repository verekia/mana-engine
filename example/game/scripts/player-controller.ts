import { damagePlayer, resetState, state } from '../lib/game-state'

import type { ManaScript } from 'mana-engine/game'

const jumpCooldownMap = new WeakMap<object, number>()

export default {
  params: {
    moveSpeed: { type: 'number', default: 5 },
    jumpForce: { type: 'number', default: 7 },
  },
  init(ctx) {
    jumpCooldownMap.set(ctx.entity as object, 0)
    resetState()
    document.dispatchEvent(
      new CustomEvent('mana:health-changed', {
        detail: { health: state.playerHealth, maxHealth: state.maxHealth },
      }),
    )
  },
  update(ctx) {
    const { rigidBody, input, params, dt } = ctx
    if (!rigidBody || state.playerDead) return

    const entityObj = ctx.entity as object
    const moveSpeed = params.moveSpeed as number
    const jumpForce = params.jumpForce as number

    // Update timers
    if (state.invincibleTimer > 0) state.invincibleTimer -= dt
    if (state.shootCooldown > 0) state.shootCooldown -= dt

    const vel = rigidBody.linvel()

    // Horizontal movement
    const horizontal = input.getAxis('horizontal')
    rigidBody.setLinvel({ x: horizontal * moveSpeed, y: vel.y, z: vel.z }, true)

    // Track facing direction
    if (horizontal > 0.1) state.playerFacingRight = true
    if (horizontal < -0.1) state.playerFacingRight = false

    // Ground detection
    const grounded = Math.abs(vel.y) < 0.1

    // Jump cooldown
    let jumpCooldown = jumpCooldownMap.get(entityObj) ?? 0
    if (jumpCooldown > 0) jumpCooldown -= dt
    jumpCooldownMap.set(entityObj, jumpCooldown)

    // Jump (W or ArrowUp)
    if (grounded && jumpCooldown <= 0 && (input.isKeyPressed('ArrowUp') || input.isKeyPressed('KeyW'))) {
      rigidBody.setLinvel({ x: vel.x, y: jumpForce, z: vel.z }, true)
      jumpCooldownMap.set(entityObj, 0.3)
      ctx.playSound('audio/swoosh.mp3', { volume: 0.4 })
    }

    // Shoot (Space)
    if (input.isKeyPressed('Space') && state.shootCooldown <= 0) {
      const pos = rigidBody.translation()
      const dir = state.playerFacingRight ? 1 : -1
      ctx.instantiatePrefab('projectile', { x: pos.x + dir * 1, y: pos.y, z: 0 })
      state.shootCooldown = 0.4
    }
  },
  onCollisionEnter(ctx, other) {
    if (state.playerDead) return

    if (other.entityId.startsWith('enemy-')) {
      if (damagePlayer()) {
        // Knockback
        if (ctx.rigidBody) {
          const dir = state.playerFacingRight ? -1 : 1
          ctx.rigidBody.setLinvel({ x: dir * 5, y: 6, z: 0 }, true)
        }
        ctx.playSound('audio/explosion.mp3', { volume: 0.3 })
      }
    }
  },
} satisfies ManaScript
