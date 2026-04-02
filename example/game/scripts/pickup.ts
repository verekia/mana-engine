import type { ManaScript } from 'mana-engine/game'

/** Track which entities have been collected using native object refs as keys. */
const collectedSet = new WeakSet<object>()

/** Store base Y positions per entity for bobbing. */
const baseYMap = new WeakMap<object, number>()

export default {
  params: {
    spinSpeed: { type: 'number', default: 3 },
    bobAmplitude: { type: 'number', default: 0.3 },
    bobSpeed: { type: 'number', default: 2 },
    collectRadius: { type: 'number', default: 1.5 },
  },
  init(ctx) {
    const pos = ctx.getPosition()
    baseYMap.set(ctx.entity as object, pos.y)
  },
  fixedUpdate(ctx) {
    const entityObj = ctx.entity as object
    if (collectedSet.has(entityObj)) return

    const { rigidBody, params, time } = ctx
    if (!rigidBody) return

    const spinSpeed = params.spinSpeed as number
    const bobAmplitude = params.bobAmplitude as number
    const bobSpeed = params.bobSpeed as number

    // Spin the cube using angular velocity
    rigidBody.setAngvel({ x: 0, y: spinSpeed, z: spinSpeed * 0.3 }, false)

    // Bob up and down: spring force toward sine target + gravity compensation
    const pos = rigidBody.translation()
    const baseY = baseYMap.get(entityObj) ?? pos.y
    const targetY = baseY + Math.sin(time * bobSpeed) * bobAmplitude
    const yError = targetY - pos.y
    const yVel = rigidBody.linvel().y
    // PD controller: spring + damping to prevent oscillation
    rigidBody.applyForce({ x: 0, y: yError * 40 - yVel * 4 + rigidBody.mass() * 9.81, z: 0 })
    // Keep horizontal velocity zeroed so cubes don't drift
    rigidBody.setLinvel({ x: 0, y: yVel, z: 0 }, false)
  },
  update(ctx) {
    const entityObj = ctx.entity as object
    if (collectedSet.has(entityObj)) return

    const { rigidBody, params } = ctx
    if (!rigidBody) return

    const collectRadius = params.collectRadius as number

    // Check distance to player for collection
    const pos = rigidBody.translation()
    const playerPos = ctx.findEntityPosition('Player')
    if (!playerPos) return

    const dx = playerPos.x - pos.x
    const dy = playerPos.y - pos.y
    const dz = playerPos.z - pos.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (dist < collectRadius) {
      collectedSet.add(entityObj)
      rigidBody.setEnabled(false)
      ctx.setPosition(0, -100, 0)
      document.dispatchEvent(new CustomEvent('mana:pickup-collected'))
    }
  },
} satisfies ManaScript
