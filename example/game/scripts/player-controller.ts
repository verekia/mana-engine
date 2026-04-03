import type { ManaScript } from 'mana-engine/game'

/** Per-entity state stored via WeakMap to avoid shared module-level variables. */
const groundedMap = new WeakMap<object, boolean>()
const jumpCooldownMap = new WeakMap<object, number>()

export default {
  params: {
    moveSpeed: { type: 'number', default: 5 },
    jumpForce: { type: 'number', default: 7 },
  },
  init(ctx) {
    groundedMap.set(ctx.entity as object, false)
    jumpCooldownMap.set(ctx.entity as object, 0)
  },
  update(ctx) {
    const { rigidBody, input, params, dt } = ctx
    if (!rigidBody) return

    const entityObj = ctx.entity as object
    const moveSpeed = params.moveSpeed as number
    const jumpForce = params.jumpForce as number

    const vel = rigidBody.linvel()

    // Horizontal movement
    const horizontal = input.getAxis('horizontal')
    rigidBody.setLinvel({ x: horizontal * moveSpeed, y: vel.y, z: vel.z }, true)

    // Ground detection: consider grounded if vertical velocity is near zero
    const grounded = Math.abs(vel.y) < 0.1
    groundedMap.set(entityObj, grounded)

    // Jump cooldown
    let jumpCooldown = jumpCooldownMap.get(entityObj) ?? 0
    if (jumpCooldown > 0) jumpCooldown -= dt
    jumpCooldownMap.set(entityObj, jumpCooldown)

    // Jump
    if (
      grounded &&
      jumpCooldown <= 0 &&
      (input.isKeyPressed('Space') || input.isKeyPressed('ArrowUp') || input.isKeyPressed('KeyW'))
    ) {
      rigidBody.setLinvel({ x: vel.x, y: jumpForce, z: vel.z }, true)
      jumpCooldownMap.set(entityObj, 0.3)
    }
  },
} satisfies ManaScript
