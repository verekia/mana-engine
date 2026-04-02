import { useEffect, useState } from 'react'

const TOTAL_PICKUPS = 5

export default function PickupCounter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const handler = () => setCount(prev => prev + 1)
    document.addEventListener('mana:pickup-collected', handler)
    return () => document.removeEventListener('mana:pickup-collected', handler)
  }, [])

  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded bg-black/50 px-3 py-1.5">
      <span className="text-lg text-cyan-400">&#9670;</span>
      <span className="text-sm font-medium text-white">
        {count} / {TOTAL_PICKUPS}
      </span>
    </div>
  )
}
