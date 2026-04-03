import type { ManaScript } from 'mana-engine/game'

const stateMap = new WeakMap<object, { aliveCount: number; spawnTimer: number }>()

const MAX_ENEMIES = 10
const SPAWN_INTERVAL = 4

export default {
  init(ctx) {
    // Start with the 6 scene-placed enemies
    const initialEnemies = ctx.findEntitiesByTag('enemy')
    stateMap.set(ctx.entity as object, {
      aliveCount: initialEnemies.length,
      spawnTimer: SPAWN_INTERVAL,
    })

    ctx.on('enemy-killed', () => {
      const s = stateMap.get(ctx.entity as object)
      if (s) s.aliveCount--
    })
  },
  update(ctx) {
    const s = stateMap.get(ctx.entity as object)
    if (!s) return

    s.spawnTimer -= ctx.dt
    if (s.spawnTimer <= 0 && s.aliveCount < MAX_ENEMIES) {
      // Spawn at random position on arena edge, away from center
      const side = Math.floor(Math.random() * 4)
      let x = 0
      let y = 0
      const spread = 10
      switch (side) {
        case 0:
          x = -spread + Math.random() * spread * 2
          y = spread
          break
        case 1:
          x = -spread + Math.random() * spread * 2
          y = -spread
          break
        case 2:
          x = spread
          y = -spread + Math.random() * spread * 2
          break
        case 3:
          x = -spread
          y = -spread + Math.random() * spread * 2
          break
      }
      const id = ctx.instantiatePrefab('enemy', { x, y, z: 0.5 })
      if (id) s.aliveCount++
      s.spawnTimer = SPAWN_INTERVAL
    } else if (s.spawnTimer <= 0) {
      s.spawnTimer = SPAWN_INTERVAL
    }
  },
} satisfies ManaScript
