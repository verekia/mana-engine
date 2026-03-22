import './game.css'

export default function Game() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold @md:text-4xl">My Game</h1>
      <p className="mt-2 text-sm text-gray-600 @md:text-lg">
        This game responds to its container size, not the viewport.
      </p>
      <canvas className="mt-4 aspect-video w-full rounded-lg bg-gray-900" />
    </div>
  )
}
