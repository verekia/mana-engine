import { type ComponentType, useEffect, useRef } from 'react'

import { createScene } from 'mana-engine/game'

import './game.css'
import sceneData from './scenes/main.json'
import HealthBar from './ui/HealthBar'

export const uiComponents: Record<string, ComponentType> = {
  HealthBar,
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scene = createScene(canvas, sceneData)
    return () => scene.dispose()
  }, [])

  return (
    <div className="relative h-full">
      {sceneData.entities
        .filter(e => e.type === 'ui')
        .map(e => {
          const Component = uiComponents[e.ui?.component ?? '']
          return Component ? <Component key={e.id} /> : null
        })}
      <canvas ref={canvasRef} className="size-full" />
    </div>
  )
}
