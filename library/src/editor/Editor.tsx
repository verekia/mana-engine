import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ManaContext } from '../scene-context.ts'
import { createScene, type EditorCameraState, type ManaScene, type TransformMode } from '../scene.ts'
import { BottomPanel } from './BottomPanel.tsx'
import { COLORS } from './colors.ts'
import { UndoHistory } from './history.ts'
import { LeftPanel } from './LeftPanel.tsx'
import { RightPanel } from './RightPanel.tsx'
import { fetchSceneList, loadSceneData, saveSceneData } from './scene-api.ts'
import { Toolbar } from './Toolbar.tsx'
import { Viewport, ViewportBar } from './Viewport.tsx'

import type { Transform } from '../scene-data.ts'
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
  const [transformMode, setTransformMode] = useState<TransformMode>('translate')
  const historyRef = useRef(new UndoHistory())
  const [, forceUpdate] = useState(0)
  const transformStartRef = useRef<{ id: string; transform: Transform } | null>(null)
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

  // Transform gizmo callbacks
  const handleTransformStart = useCallback((id: string) => {
    const entity = sceneDataRef.current?.entities.find(e => e.id === id)
    if (entity) {
      transformStartRef.current = { id, transform: { ...entity.transform } }
    }
  }, [])

  const handleTransformChange = useCallback((id: string, transform: Transform) => {
    // Update scene data in real time so inspector stays in sync
    setSceneData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        entities: prev.entities.map(e => (e.id === id ? { ...e, transform } : e)),
      }
    })
  }, [])

  const handleTransformEnd = useCallback((id: string, transform: Transform) => {
    const oldTransform = transformStartRef.current?.transform
    if (!oldTransform || transformStartRef.current?.id !== id) return
    const capturedOld = { ...oldTransform }
    const capturedNew = { ...transform }

    historyRef.current.push({
      description: 'Transform entity',
      undo: () => {
        setSceneData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            entities: prev.entities.map(e => (e.id === id ? { ...e, transform: capturedOld } : e)),
          }
        })
        const entity = sceneDataRef.current?.entities.find(e => e.id === id)
        if (entity) {
          sceneRef.current?.updateEntity(id, { ...entity, transform: capturedOld })
        }
      },
      redo: () => {
        setSceneData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            entities: prev.entities.map(e => (e.id === id ? { ...e, transform: capturedNew } : e)),
          }
        })
        const entity = sceneDataRef.current?.entities.find(e => e.id === id)
        if (entity) {
          sceneRef.current?.updateEntity(id, { ...entity, transform: capturedNew })
        }
      },
    })
    forceUpdate(n => n + 1)
    transformStartRef.current = null
  }, [])

  // Switch scene handler
  const handleSwitchScene = useCallback(
    (name: string) => {
      setActiveScene(name)
      localStorage.setItem('mana:activeScene', name)
      setSelectedId(null)
      historyRef.current.clear()
      forceUpdate(n => n + 1)

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
            sceneRef.current = await createScene(canvas, data, {
              debugPhysics: true,
              orbitControls: true,
              onTransformStart: handleTransformStart,
              onTransformChange: handleTransformChange,
              onTransformEnd: handleTransformEnd,
            })
          }
        })
        .catch(err => log(`Error loading scene: ${err.message}`))
    },
    [log, handleTransformStart, handleTransformChange, handleTransformEnd],
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
        onTransformStart: !isPlaying ? handleTransformStart : undefined,
        onTransformChange: !isPlaying ? handleTransformChange : undefined,
        onTransformEnd: !isPlaying ? handleTransformEnd : undefined,
      })
    },
    [scripts, showGizmos, handleTransformStart, handleTransformChange, handleTransformEnd],
  )

  // Create Three.js scene when scene data is first available (once)
  // Scene switching is handled by handleSwitchScene/recreateScene explicitly.
  useEffect(() => {
    let disposed = false

    function tryCreate() {
      const canvas = canvasRef.current
      const data = sceneDataRef.current
      if (!canvas || !data || sceneRef.current) return
      createScene(canvas, data, {
        debugPhysics: showGizmosRef.current,
        orbitControls: true,
        onTransformStart: handleTransformStart,
        onTransformChange: handleTransformChange,
        onTransformEnd: handleTransformEnd,
      }).then(s => {
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
  }, [handleTransformStart, handleTransformChange, handleTransformEnd])

  // Keyboard shortcuts: Cmd+S (save), Cmd+Z (undo), Cmd+Shift+Z (redo), W/E/R (transform mode)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 's') {
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
        return
      }

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (historyRef.current.undo()) forceUpdate(n => n + 1)
        return
      }

      if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        if (historyRef.current.redo()) forceUpdate(n => n + 1)
        return
      }

      // Transform mode shortcuts (only when not typing in an input)
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'w' && !mod) setTransformMode('translate')
      if (e.key === 'e' && !mod) setTransformMode('rotate')
      if (e.key === 'r' && !mod) setTransformMode('scale')
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
    const deleted = sceneDataRef.current?.entities.find(e => e.id === id)
    setSceneData(prev => {
      if (!prev) return prev
      return { ...prev, entities: prev.entities.filter(e => e.id !== id) }
    })
    sceneRef.current?.removeEntity(id)
    setSelectedId(prev => (prev === id ? null : prev))

    if (deleted) {
      historyRef.current.push({
        description: `Delete ${deleted.name}`,
        undo: () => {
          setSceneData(prev => {
            if (!prev) return prev
            return { ...prev, entities: [...prev.entities, deleted] }
          })
          sceneRef.current?.addEntity(deleted)
        },
        redo: () => {
          setSceneData(prev => {
            if (!prev) return prev
            return { ...prev, entities: prev.entities.filter(e => e.id !== id) }
          })
          sceneRef.current?.removeEntity(id)
          setSelectedId(prev => (prev === id ? null : prev))
        },
      })
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleRenameEntity = useCallback((id: string, name: string) => {
    const oldName = sceneDataRef.current?.entities.find(e => e.id === id)?.name
    setSceneData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        entities: prev.entities.map(e => (e.id === id ? { ...e, name } : e)),
      }
    })

    if (oldName && oldName !== name) {
      historyRef.current.push({
        description: `Rename ${oldName} to ${name}`,
        undo: () => {
          setSceneData(prev => {
            if (!prev) return prev
            return { ...prev, entities: prev.entities.map(e => (e.id === id ? { ...e, name: oldName } : e)) }
          })
        },
        redo: () => {
          setSceneData(prev => {
            if (!prev) return prev
            return { ...prev, entities: prev.entities.map(e => (e.id === id ? { ...e, name } : e)) }
          })
        },
      })
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleAddEntity = useCallback((entity: SceneEntity) => {
    setSceneData(prev => {
      if (!prev) return prev
      return { ...prev, entities: [...prev.entities, entity] }
    })
    sceneRef.current?.addEntity(entity)
    setSelectedId(entity.id)

    historyRef.current.push({
      description: `Add ${entity.name}`,
      undo: () => {
        setSceneData(prev => {
          if (!prev) return prev
          return { ...prev, entities: prev.entities.filter(e => e.id !== entity.id) }
        })
        sceneRef.current?.removeEntity(entity.id)
        setSelectedId(prev => (prev === entity.id ? null : prev))
      },
      redo: () => {
        setSceneData(prev => {
          if (!prev) return prev
          return { ...prev, entities: [...prev.entities, entity] }
        })
        sceneRef.current?.addEntity(entity)
        setSelectedId(entity.id)
      },
    })
    forceUpdate(n => n + 1)
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
    sceneRef.current?.setTransformTarget(selectedId)
  }, [selectedId])

  // Sync transform mode to Three.js scene
  useEffect(() => {
    sceneRef.current?.setTransformMode(transformMode)
  }, [transformMode])

  const handleUpdateEntity = useCallback((updated: SceneEntity) => {
    const prev = sceneDataRef.current?.entities.find(e => e.id === updated.id)
    setSceneData(sd => {
      if (!sd) return sd
      return {
        ...sd,
        entities: sd.entities.map(e => (e.id === updated.id ? updated : e)),
      }
    })
    sceneRef.current?.updateEntity(updated.id, updated)

    if (prev) {
      const oldEntity = { ...prev }
      const newEntity = { ...updated }
      historyRef.current.push({
        description: `Update ${updated.name}`,
        undo: () => {
          setSceneData(sd => {
            if (!sd) return sd
            return { ...sd, entities: sd.entities.map(e => (e.id === oldEntity.id ? oldEntity : e)) }
          })
          sceneRef.current?.updateEntity(oldEntity.id, oldEntity)
        },
        redo: () => {
          setSceneData(sd => {
            if (!sd) return sd
            return { ...sd, entities: sd.entities.map(e => (e.id === newEntity.id ? newEntity : e)) }
          })
          sceneRef.current?.updateEntity(newEntity.id, newEntity)
        },
      })
      forceUpdate(n => n + 1)
    }
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
      <Toolbar
        playing={playing}
        onPlay={handlePlay}
        onStop={handleStop}
        dirty={dirty}
        transformMode={transformMode}
        onTransformModeChange={setTransformMode}
        canUndo={historyRef.current.canUndo}
        canRedo={historyRef.current.canRedo}
        onUndo={() => {
          if (historyRef.current.undo()) forceUpdate(n => n + 1)
        }}
        onRedo={() => {
          if (historyRef.current.redo()) forceUpdate(n => n + 1)
        }}
      />
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
