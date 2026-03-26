import type { ManaScript } from 'mana-engine/game'

let playerEntity: THREE.Object3D | null = null

export default {
  params: {
    offsetZ: { type: 'number', default: 8 },
    deadZoneX: { type: 'number', default: 2 },
    deadZoneY: { type: 'number', default: 1.5 },
  },
  init({ scene, entity, params }) {
    playerEntity = scene.getObjectByName('Player') ?? null
    // Reset rotation to look straight down -Z (undo the engine's default lookAt)
    entity.rotation.set(0, 0, 0)
    if (playerEntity) {
      entity.position.x = playerEntity.position.x
      entity.position.y = playerEntity.position.y
      entity.position.z = params.offsetZ as number
    }
  },
  update({ entity, params }) {
    if (!playerEntity) return

    const oz = params.offsetZ as number
    const dzX = params.deadZoneX as number
    const dzY = params.deadZoneY as number

    const playerX = playerEntity.position.x
    const playerY = playerEntity.position.y

    // Push camera when player exits the dead zone
    if (playerX > entity.position.x + dzX) {
      entity.position.x = playerX - dzX
    } else if (playerX < entity.position.x - dzX) {
      entity.position.x = playerX + dzX
    }

    if (playerY > entity.position.y + dzY) {
      entity.position.y = playerY - dzY
    } else if (playerY < entity.position.y - dzY) {
      entity.position.y = playerY + dzY
    }

    entity.position.z = oz
  },
} satisfies ManaScript
