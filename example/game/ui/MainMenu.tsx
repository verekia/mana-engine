import { useMana } from 'mana-engine/game'

export default function MainMenu() {
  const { loadScene } = useMana()

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-5xl font-extrabold tracking-tight text-white">Platformer</h1>
          <p className="text-sm tracking-wide text-white/40">A simple jumping game</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => loadScene('level-1')}
            className="w-48 rounded-lg bg-rose-600 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-rose-500"
          >
            Play
          </button>
          <button
            onClick={() => loadScene('settings')}
            className="w-48 rounded-lg bg-white/10 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-white/20"
          >
            Settings
          </button>
        </div>
        <p className="text-xs text-white/30">Arrow keys or WASD to move, Space to jump</p>
      </div>
    </div>
  )
}
