import { useEffect, useRef } from 'react'

import { createScene } from 'mana-engine/game'

import './game.css'
import HealthBar from './ui/HealthBar'

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scene = createScene(canvas)
    return () => scene.dispose()
  }, [])

  return (
    <div className="relative h-full">
      <div className="absolute top-4 left-0 z-10 flex w-full justify-center @md:left-4 @md:w-auto">
        <HealthBar />
      </div>
      <canvas ref={canvasRef} className="size-full" />
    </div>
  )
}
