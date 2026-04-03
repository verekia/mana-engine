import { useEffect, useState } from 'react'

export default function HealthBar() {
  const [health, setHealth] = useState(3)
  const [maxHealth, setMaxHealth] = useState(3)

  useEffect(() => {
    const handler = (e: Event) => {
      const { health: h, maxHealth: mh } = (e as CustomEvent).detail
      setHealth(h)
      setMaxHealth(mh)
    }
    document.addEventListener('mana:health-changed', handler)
    return () => document.removeEventListener('mana:health-changed', handler)
  }, [])

  return (
    <div className="absolute top-4 left-28 z-10 flex items-center gap-1 rounded bg-black/50 px-3 py-1.5">
      {Array.from({ length: maxHealth }, (_, i) => (
        <span key={i} className={`text-lg ${i < health ? 'text-red-500' : 'text-gray-600'}`}>
          &#9829;
        </span>
      ))}
    </div>
  )
}
