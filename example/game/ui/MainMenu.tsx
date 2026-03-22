import { useMana } from 'mana-engine/game'

export default function MainMenu() {
  const { loadScene } = useMana()

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-4xl font-bold text-white">Game Example</h1>
        <button
          onClick={() => loadScene('first-world')}
          className="rounded-lg bg-blue-600 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Play
        </button>
      </div>
    </div>
  )
}
