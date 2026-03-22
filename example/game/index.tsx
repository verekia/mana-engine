import { useEffect, useRef } from 'react'

import { createScene } from 'mana-engine'

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
    <div className="relative p-4">
      <div className="absolute top-4 left-4 z-10 @max-md:left-0 @max-md:w-full @max-md:text-center">
        <HealthBar />
      </div>
      <canvas ref={canvasRef} className="aspect-video w-full rounded-lg" />
    </div>
  )
}
