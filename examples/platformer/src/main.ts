import { mountGame } from 'mana-engine'

async function main() {
  const game = await import('../.mana/build/index.js')
  const container = document.getElementById('game')
  if (container) {
    mountGame(container, game)
  }
}

main()
