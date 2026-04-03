export const LEVELS = [
  { xpRequired: 0, explosionRadius: 3, explosionColor: '#ffcc00' },
  { xpRequired: 2, explosionRadius: 4, explosionColor: '#ff8800' },
  { xpRequired: 5, explosionRadius: 5, explosionColor: '#ff4400' },
  { xpRequired: 9, explosionRadius: 6, explosionColor: '#cc00ff' },
  { xpRequired: 14, explosionRadius: 7, explosionColor: '#00ccff' },
]

export const state = {
  playerHealth: 5,
  maxHealth: 5,
  playerDead: false,
  xp: 0,
  level: 1,
  explosionCooldown: 0,
}

export function addXP(amount: number) {
  state.xp += amount
  const nextLevel = LEVELS[state.level]
  if (nextLevel && state.xp >= nextLevel.xpRequired) {
    state.level++
    document.dispatchEvent(new CustomEvent('mana:level-up', { detail: { level: state.level } }))
  }
}

export function damagePlayer(): boolean {
  if (state.playerDead) return false
  state.playerHealth -= 1
  if (state.playerHealth <= 0) {
    state.playerDead = true
    document.dispatchEvent(new CustomEvent('mana:player-died'))
  }
  return true
}

export function resetState() {
  state.playerHealth = state.maxHealth
  state.playerDead = false
  state.xp = 0
  state.level = 1
  state.explosionCooldown = 0
}
