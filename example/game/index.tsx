import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createScene, ManaContext, type ManaScript, type SceneData } from 'mana-engine/game'

import './game.css'
import firstWorldData from './scenes/first-world.json'
import mainMenuData from './scenes/main-menu.json'
import rotate from './scripts/rotate'
import HealthBar from './ui/HealthBar'
import MainMenu from './ui/MainMenu'
import MenuButton from './ui/MenuButton'

export const uiComponents: Record<string, ComponentType> = {
  HealthBar,
  MainMenu,
  MenuButton,
}

export const scripts: Record<string, ManaScript> = {
  rotate,
}

const scenes: Record<string, SceneData> = {
  'main-menu': mainMenuData as SceneData,
  'first-world': firstWorldData as SceneData,
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [currentScene, setCurrentScene] = useState('main-menu')
  const sceneData = scenes[currentScene]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sceneData) return
    let disposed = false
    let manaScene: Awaited<ReturnType<typeof createScene>> | null = null
    createScene(canvas, sceneData, { scripts }).then(s => {
      if (disposed) {
        s.dispose()
        return
      }
      manaScene = s
    })
    return () => {
      disposed = true
      manaScene?.dispose()
    }
  }, [sceneData])

  const loadScene = useCallback((name: string) => {
    if (scenes[name]) setCurrentScene(name)
  }, [])

  const contextValue = useMemo(() => ({ loadScene, currentScene }), [loadScene, currentScene])

  return (
    <ManaContext.Provider value={contextValue}>
      <div className="relative h-full">
        {sceneData?.entities
          .filter(e => e.type === 'ui')
          .map(e => {
            const Component = uiComponents[e.ui?.component ?? '']
            return Component ? <Component key={e.id} /> : null
          })}
        <canvas ref={canvasRef} className="size-full" />
      </div>
    </ManaContext.Provider>
  )
}
