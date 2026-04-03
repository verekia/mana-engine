import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ManaContext } from './scene-context.ts'
import { createScene } from './scene.ts'

import type { PhysicsAdapter } from './adapters/physics-adapter.ts'
import type { RendererAdapter } from './adapters/renderer-adapter.ts'
import type { PrefabData, SceneData } from './scene-data.ts'
import type { ManaScript } from './script.ts'

export function Game({
  scenes,
  scripts,
  uiComponents,
  prefabs,
  startScene,
  createRenderer,
  createPhysics,
  coordinateSystem,
}: {
  scenes: Record<string, SceneData>
  scripts?: Record<string, ManaScript>
  uiComponents?: Record<string, ComponentType>
  prefabs?: Record<string, PrefabData>
  startScene?: string
  createRenderer: () => RendererAdapter
  createPhysics?: (() => PhysicsAdapter) | undefined
  coordinateSystem?: 'y-up' | 'z-up'
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneNames = Object.keys(scenes)
  const initialScene = startScene && scenes[startScene] ? startScene : (sceneNames[0] ?? '')
  const [currentScene, setCurrentScene] = useState(initialScene)
  const sceneData = scenes[currentScene]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sceneData) return

    const renderer = createRenderer()
    const physics = createPhysics?.()
    const data = coordinateSystem ? { ...sceneData, coordinateSystem } : sceneData

    const scenePromise = createScene(canvas, data, { renderer, physics, scripts, prefabs })
    return () => {
      // Dispose the scene once the promise resolves (handles both already-resolved and pending cases)
      scenePromise.then(s => s.dispose())
    }
  }, [sceneData, scripts, prefabs, createRenderer, createPhysics, coordinateSystem])

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
