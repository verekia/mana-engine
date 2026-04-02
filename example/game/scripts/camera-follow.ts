import type { ManaScript } from 'mana-engine/game'

let playerPos: { x: number; y: number; z: number } | null = null

export default {
  params: {
    offsetZ: { type: 'number', default: 8 },
    deadZoneX: { type: 'number', default: 2 },
    deadZoneY: { type: 'number', default: 1.5 },
  },
  init(ctx) {
    const { params } = ctx
    playerPos = ctx.findEntityPosition('Player')
    // Reset rotation to look straight down -Z (undo the engine's default lookAt)
    ctx.setRotation(0, 0, 0)
    if (playerPos) {
      ctx.setPosition(playerPos.x, playerPos.y, params.offsetZ as number)
    }
  },
  update(ctx) {
    const { params } = ctx
    playerPos = ctx.findEntityPosition('Player')
    if (!playerPos) return

    const pos = ctx.getPosition()
    const oz = params.offsetZ as number
    const dzX = params.deadZoneX as number
    const dzY = params.deadZoneY as number

    let x = pos.x
    let y = pos.y

    // Push camera when player exits the dead zone
    if (playerPos.x > x + dzX) {
      x = playerPos.x - dzX
    } else if (playerPos.x < x - dzX) {
      x = playerPos.x + dzX
    }

    if (playerPos.y > y + dzY) {
      y = playerPos.y - dzY
    } else if (playerPos.y < y - dzY) {
      y = playerPos.y + dzY
    }

    ctx.setPosition(x, y, oz)
  },
} satisfies ManaScript
