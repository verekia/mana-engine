import { useMana } from 'mana-engine/game'

export default function MenuButton() {
  const { loadScene } = useMana()

  return (
    <div className="absolute top-4 right-4 z-10">
      <button
        onClick={() => loadScene('main-menu')}
        className="rounded bg-gray-800/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700/80"
      >
        Menu
      </button>
    </div>
  )
}
