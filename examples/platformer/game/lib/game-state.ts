export const state = {
  playerFacingRight: true,
  playerHealth: 3,
  maxHealth: 3,
  playerDead: false,
  invincibleTimer: 0,
  shootCooldown: 0,
  enemiesKilled: 0,
}

export function damagePlayer(): boolean {
  if (state.playerDead || state.invincibleTimer > 0) return false
  state.playerHealth -= 1
  document.dispatchEvent(
    new CustomEvent('mana:health-changed', {
      detail: { health: state.playerHealth, maxHealth: state.maxHealth },
    }),
  )
  if (state.playerHealth <= 0) {
    state.playerDead = true
    document.dispatchEvent(new CustomEvent('mana:player-died'))
  } else {
    state.invincibleTimer = 1.5
  }
  return true
}

export function resetState() {
  state.playerFacingRight = true
  state.playerHealth = state.maxHealth
  state.playerDead = false
  state.invincibleTimer = 0
  state.shootCooldown = 0
  state.enemiesKilled = 0
}
