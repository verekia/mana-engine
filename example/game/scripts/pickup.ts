import type { ManaScript } from 'mana-engine/game'

/** Track which entities have been collected using native object refs as keys. */
const collectedSet = new WeakSet<object>()

/** Store base Y positions per entity for bobbing. */
const baseYMap = new WeakMap<object, number>()

/** Track accumulated spin angle per entity. */
const spinAngleMap = new WeakMap<object, number>()

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
    spinAngleMap.set(ctx.entity as object, 0)
  },
  update(ctx) {
    const entityObj = ctx.entity as object
    if (collectedSet.has(entityObj)) return

    const { rigidBody, params, time, dt } = ctx
    if (!rigidBody) return

    const spinSpeed = params.spinSpeed as number
    const bobAmplitude = params.bobAmplitude as number
    const bobSpeed = params.bobSpeed as number
    const collectRadius = params.collectRadius as number

    // Spin the cube using rotation quaternion (works on all body types)
    let angle = spinAngleMap.get(entityObj) ?? 0
    angle += spinSpeed * dt
    spinAngleMap.set(entityObj, angle)
    // Tilted spin: rotate around a tilted axis (Y + slight Z)
    const tilt = 0.3
    const axisLen = Math.sqrt(1 + tilt * tilt)
    const ay = 1 / axisLen
    const az = tilt / axisLen
    const halfAngle = angle / 2
    const sinH = Math.sin(halfAngle)
    rigidBody.setRotation({ x: 0, y: ay * sinH, z: az * sinH, w: Math.cos(halfAngle) }, false)

    // Bob up and down by setting position directly (kinematic body, no gravity)
    const pos = rigidBody.translation()
    const baseY = baseYMap.get(entityObj) ?? pos.y
    const targetY = baseY + Math.sin(time * bobSpeed) * bobAmplitude
    rigidBody.setTranslation({ x: pos.x, y: targetY, z: pos.z }, false)

    // Check distance to player for collection
    const playerPos = ctx.findEntityPosition('Player')
    if (!playerPos) return

    const dx = playerPos.x - pos.x
    const dy = playerPos.y - pos.y
    const dz = playerPos.z - pos.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (dist < collectRadius) {
      collectedSet.add(entityObj)
      // Move far away via physics so the transform sync hides it
      rigidBody.setTranslation({ x: 0, y: -100, z: 0 }, false)
      rigidBody.setEnabled(false)
      document.dispatchEvent(new CustomEvent('mana:pickup-collected'))
    }
  },
} satisfies ManaScript
