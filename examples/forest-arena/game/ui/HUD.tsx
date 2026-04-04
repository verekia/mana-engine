import { useEffect, useState } from 'react'

const LEVEL_COLORS = ['#ffcc00', '#ff8800', '#ff4400', '#cc00ff', '#00ccff']
const LEVEL_XP = [0, 2, 5, 9, 14]

export default function HUD() {
  const [health, setHealth] = useState(5)
  const [maxHealth, setMaxHealth] = useState(5)
  const [xp, setXP] = useState(0)
  const [level, setLevel] = useState(1)
  const [dead, setDead] = useState(false)
  const [levelUpFlash, setLevelUpFlash] = useState(false)

  useEffect(() => {
    const onStats = (e: Event) => {
      const d = (e as CustomEvent).detail
      setHealth(d.health)
      setMaxHealth(d.maxHealth)
      setXP(d.xp)
      setLevel(d.level)
    }
    const onDied = () => setDead(true)
    const onLevelUp = () => {
      setLevelUpFlash(true)
      setTimeout(() => setLevelUpFlash(false), 1500)
    }

    document.addEventListener('mana:stats-changed', onStats)
    document.addEventListener('mana:player-died', onDied)
    document.addEventListener('mana:level-up', onLevelUp)
    return () => {
      document.removeEventListener('mana:stats-changed', onStats)
      document.removeEventListener('mana:player-died', onDied)
      document.removeEventListener('mana:level-up', onLevelUp)
    }
  }, [])

  const nextXP = LEVEL_XP[level] ?? Infinity
  const prevXP = LEVEL_XP[level - 1] ?? 0
  const xpProgress = nextXP === Infinity ? 1 : (xp - prevXP) / (nextXP - prevXP)
  const levelColor = LEVEL_COLORS[level - 1] ?? '#00ccff'

  return (
    <>
      {/* Health */}
      <div className="absolute top-4 left-4 flex items-center gap-1 rounded bg-black/60 px-3 py-2">
        {Array.from({ length: maxHealth }, (_, i) => (
          <span key={i} className={`text-xl ${i < health ? 'text-red-500' : 'text-gray-600'}`}>
            &#9829;
          </span>
        ))}
      </div>

      {/* Level & XP */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-1 rounded bg-black/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">LVL</span>
          <span className="text-xl font-bold" style={{ color: levelColor }}>
            {level}
          </span>
        </div>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-700">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${xpProgress * 100}%`, backgroundColor: levelColor }}
          />
        </div>
        <span className="text-xs text-gray-400">{nextXP === Infinity ? 'MAX' : `${xp} / ${nextXP} XP`}</span>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 left-4 rounded bg-black/60 px-3 py-2 text-xs text-gray-400">
        WASD move | SPACE explode
      </div>

      {/* Level up flash */}
      {levelUpFlash && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-pulse text-4xl font-bold" style={{ color: levelColor }}>
            LEVEL UP!
          </div>
        </div>
      )}

      {/* Death screen */}
      {dead && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-4">
            <div className="text-5xl font-bold text-red-500">GAME OVER</div>
            <div className="text-lg text-gray-300">
              Reached Level {level} with {xp} XP
            </div>
          </div>
        </div>
      )}
    </>
  )
}
