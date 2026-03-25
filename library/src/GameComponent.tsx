import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ManaContext } from './scene-context.ts'
import { createScene } from './scene.ts'

import type { SceneData } from './scene-data.ts'
import type { ManaScript } from './script.ts'

export function Game({
  scenes,
  scripts,
  uiComponents,
  startScene,
}: {
  scenes: Record<string, SceneData>
  scripts?: Record<string, ManaScript>
  uiComponents?: Record<string, ComponentType>
  startScene?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneNames = Object.keys(scenes)
  const initialScene = startScene && scenes[startScene] ? startScene : (sceneNames[0] ?? '')
  const [currentScene, setCurrentScene] = useState(initialScene)
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
  }, [sceneData, scripts])

  const loadScene = useCallback(
    (name: string) => {
      if (scenes[name]) setCurrentScene(name)
    },
    [scenes],
  )

  const contextValue = useMemo(() => ({ loadScene, currentScene }), [loadScene, currentScene])

  const components = uiComponents ?? {}

  return (
    <ManaContext.Provider value={contextValue}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {sceneData?.entities
          .filter(e => e.type === 'ui')
          .map(e => {
            const Component = components[e.ui?.component ?? '']
            return Component ? <Component key={e.id} /> : null
          })}
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </ManaContext.Provider>
  )
}
