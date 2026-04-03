import type { ManaScript } from 'mana-engine/game'

const directionMap = new WeakMap<object, number>()

export default {
  params: {
    minX: { type: 'number', default: -3 },
    maxX: { type: 'number', default: 3 },
    speed: { type: 'number', default: 2 },
  },
  init(ctx) {
    directionMap.set(ctx.entity as object, 1)
  },
  update(ctx) {
    const { rigidBody, params, dt } = ctx
    if (!rigidBody) return

    const entityObj = ctx.entity as object
    const minX = params.minX as number
    const maxX = params.maxX as number
    const speed = params.speed as number

    let dir = directionMap.get(entityObj) ?? 1
    const pos = rigidBody.translation()

    if (pos.x >= maxX) dir = -1
    if (pos.x <= minX) dir = 1
    directionMap.set(entityObj, dir)

    rigidBody.setTranslation({ x: pos.x + dir * speed * dt, y: pos.y, z: pos.z }, true)
  },
} satisfies ManaScript
