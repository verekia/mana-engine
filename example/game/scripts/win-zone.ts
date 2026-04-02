import type { ManaScript } from 'mana-engine/game'
import type { Object3D, Scene } from 'three'

let playerEntity: Object3D | null = null
let triggered = false

export default {
  init(ctx) {
    const scene = ctx.scene as Scene
    playerEntity = scene.getObjectByName('Player') ?? null
    triggered = false
  },
  update(ctx) {
    const entity = ctx.entity as Object3D
    if (!playerEntity || triggered) return

    const dx = playerEntity.position.x - entity.position.x
    const dy = playerEntity.position.y - entity.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 2) {
      triggered = true
      document.dispatchEvent(new CustomEvent('mana:level-complete'))
    }
  },
} satisfies ManaScript
