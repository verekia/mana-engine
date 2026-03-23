import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ManaContext } from '../scene-context.ts'
import { createScene, type EditorCameraState, type ManaScene } from '../scene.ts'
import { BottomPanel } from './BottomPanel.tsx'
import { COLORS } from './colors.ts'
import { LeftPanel } from './LeftPanel.tsx'
import { RightPanel } from './RightPanel.tsx'
import { fetchSceneList, loadSceneData, saveSceneData } from './scene-api.ts'
import { Toolbar } from './Toolbar.tsx'
import { Viewport, ViewportBar } from './Viewport.tsx'

import type { SceneData, SceneEntity } from '../scene-data.ts'
import type { ManaScript } from '../script.ts'

export default function Editor({
  Game: _Game,
  uiComponents = {},
  scripts = {},
}: {
  Game: ComponentType
  uiComponents?: Record<string, ComponentType>
  scripts?: Record<string, ManaScript>
}) {
  const [showUI, setShowUI] = useState(() => localStorage.getItem('mana:showUI') !== 'false')
  const [showGizmos, setShowGizmos] = useState(() => localStorage.getItem('mana:showGizmos') !== 'false')
  const [playing, setPlaying] = useState(false)
  const [sceneList, setSceneList] = useState<string[]>([])
  const [activeScene, setActiveScene] = useState(() => localStorage.getItem('mana:activeScene') ?? '')
  const [sceneData, setSceneData] = useState<SceneData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<{ id: number; msg: string }[]>([{ id: 0, msg: 'Mana Engine editor ready' }])
  const logIdRef = useRef(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<ManaScene | null>(null)
  const sceneDataRef = useRef<SceneData | null>(null)
  const activeSceneRef = useRef('')
  const prePlaySceneRef = useRef('')
  const prePlaySceneDataRef = useRef<SceneData | null>(null)
  const [savedSceneJson, setSavedSceneJson] = useState('')

  const selectedIdRef = useRef<string | null>(null)

  sceneDataRef.current = sceneData
  activeSceneRef.current = activeScene
  selectedIdRef.current = selectedId
  const showGizmosRef = useRef(showGizmos)
  showGizmosRef.current = showGizmos

  const dirty = sceneData ? JSON.stringify(sceneData) !== savedSceneJson : false
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const log = useCallback((msg: string) => {
    const id = logIdRef.current++
    setLogs(prev => [...prev, { id, msg }])
  }, [])

  // Fetch scene list on mount, then load the saved or first scene
  useEffect(() => {
    fetchSceneList().then(list => {
      setSceneList(list)
      if (list.length > 0) {
        const saved = localStorage.getItem('mana:activeScene')
        const initial = saved && list.includes(saved) ? saved : list[0]
        setActiveScene(initial)
        loadSceneData(initial)
          .then(data => {
            setSceneData(data)
            setSavedSceneJson(JSON.stringify(data))
            log(`Loaded scene: ${initial}`)
          })
          .catch(err => log(`Error loading scene: ${err.message}`))
      }
    })
  }, [log])

  // Switch scene handler
  const handleSwitchScene = useCallback(
    (name: string) => {
      setActiveScene(name)
      localStorage.setItem('mana:activeScene', name)
      setSelectedId(null)

      // Dispose old Three.js scene
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }

      loadSceneData(name)
        .then(async data => {
          setSceneData(data)
          setSavedSceneJson(JSON.stringify(data))
          log(`Loaded scene: ${name}`)

          // Create new Three.js scene
          const canvas = canvasRef.current
          if (canvas) {
            sceneRef.current = await createScene(canvas, data, { debugPhysics: true, orbitControls: true })
          }
        })
        .catch(err => log(`Error loading scene: ${err.message}`))
    },
    [log],
  )

  // Helper to create the editor scene (edit or play mode)
  const recreateScene = useCallback(
    async (data: SceneData, isPlaying: boolean, editorCamera?: EditorCameraState) => {
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
      const canvas = canvasRef.current
      if (!canvas) return
      sceneRef.current = await createScene(canvas, data, {
        scripts: isPlaying ? scripts : undefined,
        debugPhysics: !isPlaying && showGizmos,
        orbitControls: !isPlaying,
        editorCamera: !isPlaying ? editorCamera : undefined,
      })
    },
    [scripts, showGizmos],
  )

  // Create Three.js scene when scene data is first available (once)
  // Scene switching is handled by handleSwitchScene/recreateScene explicitly.
  useEffect(() => {
    let disposed = false

    function tryCreate() {
      const canvas = canvasRef.current
      const data = sceneDataRef.current
      if (!canvas || !data || sceneRef.current) return
      createScene(canvas, data, { debugPhysics: showGizmosRef.current, orbitControls: true }).then(s => {
        if (disposed) {
          s.dispose()
          return
        }
        sceneRef.current = s
      })
    }

    // Try immediately, and retry on a short interval until data is loaded
    tryCreate()
    const interval = setInterval(() => {
      if (sceneRef.current || disposed) {
        clearInterval(interval)
        return
      }
      tryCreate()
    }, 100)

    return () => {
      disposed = true
      clearInterval(interval)
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
    }
  }, [])

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const data = sceneDataRef.current
        const name = activeSceneRef.current
        if (!data || !name) return
        saveSceneData(name, data)
          .then(() => {
            setSavedSceneJson(JSON.stringify(data))
            log(`Scene saved: ${name}`)
          })
          .catch(err => log(`Error saving: ${err.message}`))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [log])

  const prePlaySelectedIdRef = useRef<string | null>(null)
  const prePlayCameraRef = useRef<EditorCameraState | null>(null)

  const handlePlay = useCallback(async () => {
    const data = sceneDataRef.current
    if (!data) return
    prePlaySceneRef.current = activeSceneRef.current
    prePlaySceneDataRef.current = data
    prePlaySelectedIdRef.current = selectedIdRef.current
    prePlayCameraRef.current = sceneRef.current?.getEditorCamera() ?? null
    setPlaying(true)
    setSelectedId(null)
    await recreateScene(data, true)
    log('Play mode started')
  }, [log, recreateScene])

  const handleStop = useCallback(async () => {
    setPlaying(false)
    const name = prePlaySceneRef.current || activeSceneRef.current
    const data = prePlaySceneDataRef.current
    if (data) {
      setSceneData(data)
      setActiveScene(name)
      await recreateScene(data, false, prePlayCameraRef.current ?? undefined)
    }
    setSelectedId(prePlaySelectedIdRef.current)
    log('Play mode stopped')
  }, [log, recreateScene])

  // Scene switching during play mode (via useMana().loadScene)
  const handlePlaySceneSwitch = useCallback(
    (name: string) => {
      loadSceneData(name)
        .then(async data => {
          setSceneData(data)
          setSavedSceneJson(JSON.stringify(data))
          setActiveScene(name)
          await recreateScene(data, true)
          log(`Switched to scene: ${name}`)
        })
        .catch(err => log(`Error switching scene: ${err.message}`))
    },
    [log, recreateScene],
  )

  const noopLoadScene = useCallback(() => {}, [])
  const manaContextValue = useMemo(
    () => ({
      loadScene: playing ? handlePlaySceneSwitch : noopLoadScene,
      currentScene: activeScene,
    }),
    [playing, handlePlaySceneSwitch, noopLoadScene, activeScene],
  )

  const handleDeleteEntity = useCallback((id: string) => {
    setSceneData(prev => {
      if (!prev) return prev
      return { ...prev, entities: prev.entities.filter(e => e.id !== id) }
    })
    sceneRef.current?.removeEntity(id)
    setSelectedId(prev => (prev === id ? null : prev))
  }, [])

  const handleRenameEntity = useCallback((id: string, name: string) => {
    setSceneData(prev => {
      if (!prev) return prev
      const updated = {
        ...prev,
        entities: prev.entities.map(e => (e.id === id ? { ...e, name } : e)),
      }
      const sceneName = activeSceneRef.current
      if (sceneName) {
        saveSceneData(sceneName, updated).then(() => setSavedSceneJson(JSON.stringify(updated)))
      }
      return updated
    })
  }, [])

  const handleAddEntity = useCallback((entity: SceneEntity) => {
    setSceneData(prev => {
      if (!prev) return prev
      return { ...prev, entities: [...prev.entities, entity] }
    })
    sceneRef.current?.addEntity(entity)
    setSelectedId(entity.id)
  }, [])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
    const hitId = sceneRef.current?.raycast(ndcX, ndcY) ?? null
    setSelectedId(hitId)
  }, [])

  const selectedEntity = sceneData?.entities.find(e => e.id === selectedId) ?? null

  useEffect(() => {
    sceneRef.current?.setSelectedObjects(selectedId ? [selectedId] : [])
  }, [selectedId])

  const handleUpdateEntity = useCallback((updated: SceneEntity) => {
    setSceneData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        entities: prev.entities.map(e => (e.id === updated.id ? updated : e)),
      }
    })
    sceneRef.current?.updateEntity(updated.id, updated)
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      <Toolbar playing={playing} onPlay={handlePlay} onStop={handleStop} dirty={dirty} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <LeftPanel
          sceneList={sceneList}
          activeScene={activeScene}
          onSwitchScene={handleSwitchScene}
          sceneData={sceneData}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddEntity={handleAddEntity}
          onDeleteEntity={handleDeleteEntity}
          onRenameEntity={handleRenameEntity}
        />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {!playing && (
            <ViewportBar
              showUI={showUI}
              onToggleUI={() =>
                setShowUI(s => {
                  const next = !s
                  localStorage.setItem('mana:showUI', String(next))
                  return next
                })
              }
              showGizmos={showGizmos}
              onToggleGizmos={() => {
                setShowGizmos(s => {
                  const next = !s
                  localStorage.setItem('mana:showGizmos', String(next))
                  sceneRef.current?.setGizmos(next)
                  return next
                })
              }}
            />
          )}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ManaContext.Provider value={manaContextValue}>
              <Viewport
                canvasRef={canvasRef}
                uiEntities={sceneData?.entities.filter(e => e.type === 'ui') ?? []}
                uiComponents={uiComponents}
                showUI={showUI}
                playing={playing}
                onCanvasClick={handleCanvasClick}
                onSelectEntity={setSelectedId}
              />
            </ManaContext.Provider>
          </div>
          <BottomPanel logs={logs} />
        </div>
        <RightPanel
          entity={selectedEntity}
          onUpdate={handleUpdateEntity}
          onRename={handleRenameEntity}
          availableScripts={Object.keys(scripts)}
          availableUiComponents={Object.keys(uiComponents)}
          scriptDefs={scripts}
        />
      </div>
    </div>
  )
}
