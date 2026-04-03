import type { ManaScript } from 'mana-engine/game'

interface EnemyState {
  health: number
  dirX: number
  dirY: number
  wanderTimer: number
  speed: number
}

const stateMap = new WeakMap<object, EnemyState>()

function randomDir() {
  const angle = Math.random() * Math.PI * 2
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

export default {
  init(ctx) {
    const dir = randomDir()
    stateMap.set(ctx.entity as object, {
      health: 3,
      dirX: dir.x,
      dirY: dir.y,
      wanderTimer: 1 + Math.random() * 2,
      speed: 1.5 + Math.random(),
    })

    ctx.on('explosion', data => {
      const { x, y, radius, damage } = data as { x: number; y: number; radius: number; damage: number }
      const rb = ctx.rigidBody
      if (!rb) return
      const pos = rb.translation()
      const dx = pos.x - x
      const dy = pos.y - y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= radius) {
        const s = stateMap.get(ctx.entity as object)
        if (!s) return
        s.health -= damage
        // Flash the enemy white briefly via Three.js material
        const obj = ctx.entity as any
        obj.traverse?.((child: any) => {
          if (child.isMesh && child.material) {
            child.material.emissive?.set('#ffffff')
            setTimeout(() => child.material.emissive?.set('#000000'), 100)
          }
        })
        if (s.health <= 0) {
          ctx.emit('enemy-killed', { entityId: ctx.entityId })
          ctx.destroyEntity(ctx.entityId)
        }
      }
    })
  },
  update(ctx) {
    const { rigidBody, dt } = ctx
    if (!rigidBody) return

    const s = stateMap.get(ctx.entity as object)
    if (!s) return

    s.wanderTimer -= dt
    if (s.wanderTimer <= 0) {
      const dir = randomDir()
      s.dirX = dir.x
      s.dirY = dir.y
      s.wanderTimer = 1 + Math.random() * 2
    }

    const pos = rigidBody.translation()

    // Bounce off arena edges
    const bound = 12
    if ((pos.x > bound && s.dirX > 0) || (pos.x < -bound && s.dirX < 0)) s.dirX = -s.dirX
    if ((pos.y > bound && s.dirY > 0) || (pos.y < -bound && s.dirY < 0)) s.dirY = -s.dirY

    // Move on XY plane
    rigidBody.setLinvel({ x: s.dirX * s.speed, y: s.dirY * s.speed, z: 0 }, true)

    // Keep on ground
    if (Math.abs(pos.z - 0.5) > 0.1) {
      rigidBody.setTranslation({ x: pos.x, y: pos.y, z: 0.5 }, true)
    }
  },
} satisfies ManaScript
