import type { ManaScript } from 'mana-engine/game'

let grounded = false
let jumpCooldown = 0

export default {
  params: {
    moveSpeed: { type: 'number', default: 5 },
    jumpForce: { type: 'number', default: 7 },
  },
  init() {
    grounded = false
    jumpCooldown = 0
  },
  update(ctx) {
    const { rigidBody, input, params, dt } = ctx
    if (!rigidBody) return

    const moveSpeed = params.moveSpeed as number
    const jumpForce = params.jumpForce as number

    const vel = rigidBody.linvel()

    // Horizontal movement
    const horizontal = input.getAxis('horizontal')
    rigidBody.setLinvel({ x: horizontal * moveSpeed, y: vel.y, z: vel.z }, true)

    // Ground detection: consider grounded if vertical velocity is near zero
    grounded = Math.abs(vel.y) < 0.1

    // Jump cooldown
    if (jumpCooldown > 0) jumpCooldown -= dt

    // Jump
    if (
      grounded &&
      jumpCooldown <= 0 &&
      (input.isKeyPressed('Space') || input.isKeyPressed('ArrowUp') || input.isKeyPressed('KeyW'))
    ) {
      rigidBody.setLinvel({ x: vel.x, y: jumpForce, z: vel.z }, true)
      jumpCooldown = 0.3
    }
  },
} satisfies ManaScript
