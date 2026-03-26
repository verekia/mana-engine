import { useMana } from 'mana-engine/game'

export default function LevelHud() {
  const { loadScene } = useMana()

  return (
    <div className="absolute top-4 right-4 z-10">
      <button
        onClick={() => loadScene('main-menu')}
        className="rounded bg-black/50 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-black/70"
      >
        Menu
      </button>
    </div>
  )
}
