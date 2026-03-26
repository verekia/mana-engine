import type { ManaScript } from 'mana-engine/game'

let playerEntity: THREE.Object3D | null = null
let triggered = false

export default {
  init({ scene }) {
    playerEntity = scene.getObjectByName('Player') ?? null
    triggered = false
  },
  update({ entity }) {
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
