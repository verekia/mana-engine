import './game.css'
import HealthBar from './ui/HealthBar'
import Scene from './ui/Scene'

export default function Game() {
  return (
    <div className="relative p-4">
      <div className="absolute top-4 left-4 z-10 @max-md:left-0 @max-md:w-full @max-md:text-center">
        <HealthBar />
      </div>
      <Scene />
    </div>
  )
}
