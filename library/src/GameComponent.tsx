import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ManaContext } from './scene-context.ts'
import { createScene } from './scene.ts'

import type { PhysicsAdapter } from './adapters/physics-adapter.ts'
import type { RendererAdapter } from './adapters/renderer-adapter.ts'
import type { PrefabData, SceneData, SceneEntity } from './scene-data.ts'
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

  const loadScene = useCallback(
    (name: string) => {
      if (scenes[name]) setCurrentScene(name)
    },
    [scenes],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sceneData) return

    const renderer = createRenderer()
    const physics = createPhysics?.()
    const data = coordinateSystem ? { ...sceneData, coordinateSystem } : sceneData

    const scenePromise = createScene(canvas, data, { renderer, physics, scripts, prefabs, loadScene })
    return () => {
      // Dispose the scene once the promise resolves (handles both already-resolved and pending cases)
      scenePromise.then(s => s.dispose())
    }
  }, [sceneData, scripts, prefabs, createRenderer, createPhysics, coordinateSystem, loadScene])

  const contextValue = useMemo(() => ({ loadScene, currentScene }), [loadScene, currentScene])

  const components = uiComponents ?? {}

  function renderUIEntities(entities: SceneEntity[]): React.ReactNode {
    return entities
      .filter(e => e.type === 'ui' || e.type === 'ui-group')
      .map(e => {
        if (e.type === 'ui-group') {
          return <div key={e.id}>{e.children ? renderUIEntities(e.children) : null}</div>
        }
        const Component = components[e.ui?.component ?? '']
        return Component ? (
          <div key={e.id} style={{ pointerEvents: 'auto' }}>
            <Component />
          </div>
        ) : null
      })
  }

  return (
    <ManaContext.Provider value={contextValue}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {sceneData ? renderUIEntities(sceneData.entities) : null}
        </div>
      </div>
    </ManaContext.Provider>
  )
}
