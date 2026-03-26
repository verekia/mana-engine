import { useEffect, useState } from 'react'

import { useMana } from 'mana-engine/game'

export default function LevelComplete() {
  const { loadScene } = useMana()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(true)
    document.addEventListener('mana:level-complete', handler)
    return () => document.removeEventListener('mana:level-complete', handler)
  }, [])

  if (!visible) return null

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-4xl font-extrabold text-amber-400">Level Complete!</h1>
        <button
          onClick={() => loadScene('main-menu')}
          className="w-48 rounded-lg bg-rose-600 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-rose-500"
        >
          Main Menu
        </button>
      </div>
    </div>
  )
}
