import './game.css'
import HealthBar from './ui/HealthBar'

export default function Game() {
  return (
    <div className="relative p-4">
      <div className="absolute top-4 left-4 @max-md:left-0 @max-md:w-full @max-md:text-center">
        <HealthBar />
      </div>
      <canvas className="mt-12 aspect-video w-full rounded-lg bg-gray-900" />
    </div>
  )
}
