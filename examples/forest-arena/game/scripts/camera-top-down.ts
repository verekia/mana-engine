import type { ManaScript } from 'mana-engine/game'

export default {
  params: {
    height: { type: 'number', default: 16 },
  },
  init(ctx) {
    // Look straight down
    ctx.setRotation(-Math.PI / 2, 0, 0)
  },
  update(ctx) {
    const playerPos = ctx.findEntityPosition('Player')
    if (!playerPos) return

    const h = ctx.params.height as number
    // Convert z-up scene coords to Three.js y-up world coords for camera.
    // Camera is not inside sceneRoot in play mode, so it operates in Three.js world space.
    // Mapping: world_x = scene_x, world_y = scene_z, world_z = -scene_y
    ctx.setPosition(playerPos.x, playerPos.z + h, -playerPos.y)
  },
} satisfies ManaScript
