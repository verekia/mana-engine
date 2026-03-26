import type { ManaScript } from 'mana-engine/game'

let playerEntity: THREE.Object3D | null = null

export default {
  params: {
    offsetX: { type: 'number', default: 0 },
    offsetY: { type: 'number', default: 3 },
    offsetZ: { type: 'number', default: 8 },
    smoothing: { type: 'number', default: 5 },
  },
  init({ scene }) {
    playerEntity = scene.getObjectByName('Player') ?? null
  },
  update({ entity, params, dt }) {
    if (!playerEntity) return

    const ox = params.offsetX as number
    const oy = params.offsetY as number
    const oz = params.offsetZ as number
    const smoothing = params.smoothing as number

    const targetX = playerEntity.position.x + ox
    const targetY = playerEntity.position.y + oy
    const targetZ = playerEntity.position.z + oz

    const t = 1 - Math.exp(-smoothing * dt)
    entity.position.x += (targetX - entity.position.x) * t
    entity.position.y += (targetY - entity.position.y) * t
    entity.position.z += (targetZ - entity.position.z) * t

    entity.lookAt(playerEntity.position.x, playerEntity.position.y + 0.5, playerEntity.position.z)
  },
} satisfies ManaScript
