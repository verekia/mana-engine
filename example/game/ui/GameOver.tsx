import { useEffect, useState } from 'react'

import { useMana } from 'mana-engine/game'

export default function GameOver() {
  const { loadScene } = useMana()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(true)
    document.addEventListener('mana:player-died', handler)
    return () => document.removeEventListener('mana:player-died', handler)
  }, [])

  if (!visible) return null

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-4xl font-extrabold text-red-500">Game Over</h1>
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => loadScene('level-1')}
            className="w-48 rounded-lg bg-rose-600 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-rose-500"
          >
            Retry
          </button>
          <button
            onClick={() => loadScene('main-menu')}
            className="w-48 rounded-lg bg-white/10 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-white/20"
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  )
}
