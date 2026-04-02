import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ManaContext } from '../scene-context.ts'
import { BottomPanel } from './BottomPanel.tsx'
import { COLORS, EDITOR_CSS } from './colors.ts'
import { UndoHistory } from './history.ts'
import { LeftPanel } from './LeftPanel.tsx'
import { ResizeHandle } from './ResizeHandle.tsx'
import { RightPanel } from './RightPanel.tsx'
import {
  createScene as apiCreateScene,
  deleteScene as apiDeleteScene,
  fetchSceneList,
  loadSceneData,
  renameScene as apiRenameScene,
  saveSceneData,
} from './scene-api.ts'
import { Toolbar } from './Toolbar.tsx'
import { useEditorScene } from './use-editor-scene.ts'
import { Viewport } from './Viewport.tsx'

import type { PhysicsAdapter } from '../adapters/physics-adapter.ts'
import type { RendererAdapter } from '../adapters/renderer-adapter.ts'
import type { SceneData, SceneEntity, Transform } from '../scene-data.ts'
import type { EditorCameraState, TransformMode } from '../scene.ts'
import type { ManaScript } from '../script.ts'

export default function Editor({
  uiComponents = {},
  scripts = {},
  createRenderer,
  createPhysics,
  coordinateSystem,
}: {
  uiComponents?: Record<string, ComponentType>
  scripts?: Record<string, ManaScript>
  createRenderer?: () => RendererAdapter
  createPhysics?: () => PhysicsAdapter
  coordinateSystem?: 'y-up' | 'z-up'
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [savedSceneJson, setSavedSceneJson] = useState('')

  // Hidden entities per scene (editor-only, persisted to localStorage)
  const [hiddenEntities, setHiddenEntities] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('mana:hiddenEntities')
      const data = saved ? JSON.parse(saved) : {}
      const scene = localStorage.getItem('mana:activeScene') ?? ''
      return new Set<string>(data[scene] ?? [])
    } catch {
      return new Set<string>()
    }
  })

  // Panel sizes (persisted to localStorage)
  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('mana:leftWidth')) || 220)
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('mana:rightWidth')) || 260)
  const [bottomHeight, setBottomHeight] = useState(() => Number(localStorage.getItem('mana:bottomHeight')) || 210)

  // Refs for values accessed in async/event callbacks to avoid stale closures
  const sceneDataRef = useRef<SceneData | null>(null)
  sceneDataRef.current = sceneData
  const activeSceneRef = useRef('')
  activeSceneRef.current = activeScene
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId
  const dirtyRef = useRef(false)

  const dirty = useMemo(
    () => (sceneData ? JSON.stringify(sceneData) !== savedSceneJson : false),
    [sceneData, savedSceneJson],
  )
  dirtyRef.current = dirty

  const prePlaySceneRef = useRef('')
  const prePlaySceneDataRef = useRef<SceneData | null>(null)
  const prePlaySelectedIdRef = useRef<string | null>(null)
  const prePlayCameraRef = useRef<EditorCameraState | null>(null)

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const log = useCallback((msg: string) => {
    console.log(`[Mana] ${msg}`)
  }, [])

  // Transform gizmo callbacks
  const handleTransformStart = useCallback((id: string) => {
    const entity = sceneDataRef.current?.entities.find(e => e.id === id)
    if (entity) {
      transformStartRef.current = { id, transform: { ...entity.transform } }
    }
  }, [])

  const handleTransformChange = useCallback((id: string, transform: Transform) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneRef is a stable ref, .current is intentionally read at execution time
  }, [])

  // Scene lifecycle hook — handles renderer scene creation, disposal, and recreation
  const { sceneRef, recreateScene } = useEditorScene({
    canvasRef,
    sceneData,
    scripts,
    showGizmos,
    transformMode,
    createRenderer,
    createPhysics,
    coordinateSystem,
    onTransformStart: handleTransformStart,
    onTransformChange: handleTransformChange,
    onTransformEnd: handleTransformEnd,
  })

  const handleToggleEntityVisibility = useCallback(
    (id: string) => {
      setHiddenEntities(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        try {
          const data = JSON.parse(localStorage.getItem('mana:hiddenEntities') ?? '{}')
          data[activeSceneRef.current] = [...next]
          if (next.size === 0) delete data[activeSceneRef.current]
          localStorage.setItem('mana:hiddenEntities', JSON.stringify(data))
        } catch {}
        sceneRef.current?.setEntityVisible(id, !next.has(id))
        return next
      })
    },
    [sceneRef],
  )

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
      historyRef.current.clear()
      forceUpdate(n => n + 1)

      // Load hidden entities for the new scene
      let sceneHidden = new Set<string>()
      try {
        const data = JSON.parse(localStorage.getItem('mana:hiddenEntities') ?? '{}')
        sceneHidden = new Set<string>(data[name] ?? [])
      } catch {}
      setHiddenEntities(sceneHidden)

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
          await recreateScene(data, false)

          // Apply visibility state
          for (const id of sceneHidden) {
            sceneRef.current?.setEntityVisible(id, false)
          }
        })
        .catch(err => log(`Error loading scene: ${err.message}`))
    },
    [log, sceneRef, recreateScene],
  )

  const handleCreateScene = useCallback(
    (name: string) => {
      apiCreateScene(name)
        .then(() => {
          setSceneList(prev => [...prev, name])
          handleSwitchScene(name)
          log(`Created scene: ${name}`)
        })
        .catch(err => log(`Error creating scene: ${err.message}`))
    },
    [handleSwitchScene, log],
  )

  const handleDeleteScene = useCallback(
    (name: string) => {
      apiDeleteScene(name)
        .then(() => {
          setSceneList(prev => {
            const next = prev.filter(s => s !== name)
            if (activeSceneRef.current === name && next.length > 0) {
              handleSwitchScene(next[0])
            }
            return next
          })
          log(`Deleted scene: ${name}`)
        })
        .catch(err => log(`Error deleting scene: ${err.message}`))
    },
    [handleSwitchScene, log],
  )

  const handleRenameScene = useCallback(
    (oldName: string, newName: string) => {
      apiRenameScene(oldName, newName)
        .then(() => {
          setSceneList(prev => prev.map(s => (s === oldName ? newName : s)))
          if (activeSceneRef.current === oldName) {
            setActiveScene(newName)
            localStorage.setItem('mana:activeScene', newName)
          }
          log(`Renamed scene: ${oldName} → ${newName}`)
        })
        .catch(err => log(`Error renaming scene: ${err.message}`))
    },
    [log],
  )

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
    canvasRef.current?.focus()
    log('Play mode started')
  }, [log, sceneRef, recreateScene])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneRef is stable
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneRef is stable
  }, [])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
    const hitId = sceneRef.current?.raycast(ndcX, ndcY) ?? null
    setSelectedId(hitId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneRef is stable
  }, [])

  const selectedEntity = sceneData?.entities.find(e => e.id === selectedId) ?? null

  useEffect(() => {
    sceneRef.current?.setSelectedObjects(selectedId ? [selectedId] : [])
    sceneRef.current?.setTransformTarget(selectedId)
  }, [selectedId, sceneRef])

  // Apply hidden entity visibility when scene is created/recreated
  const hiddenEntitiesRef = useRef(hiddenEntities)
  hiddenEntitiesRef.current = hiddenEntities
  useEffect(() => {
    if (!sceneData) return
    // Small delay to ensure Three.js scene is ready after async creation
    const t = setTimeout(() => {
      for (const id of hiddenEntitiesRef.current) {
        sceneRef.current?.setEntityVisible(id, false)
      }
    }, 100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per scene load
  }, [sceneData, sceneRef])

  // Debounced undo for inspector property edits — collapses rapid changes into one undo entry
  const updateUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateUndoBeforeRef = useRef<SceneEntity | null>(null)

  const handleUpdateEntity = useCallback((updated: SceneEntity) => {
    // Capture the "before" state only on the first change in a batch
    if (!updateUndoBeforeRef.current || updateUndoBeforeRef.current.id !== updated.id) {
      const prev = sceneDataRef.current?.entities.find(e => e.id === updated.id)
      updateUndoBeforeRef.current = prev ? { ...prev } : null
    }

    setSceneData(sd => {
      if (!sd) return sd
      return {
        ...sd,
        entities: sd.entities.map(e => (e.id === updated.id ? updated : e)),
      }
    })
    sceneRef.current?.updateEntity(updated.id, updated)

    // Reset the debounce timer
    if (updateUndoTimer.current) clearTimeout(updateUndoTimer.current)
    const capturedBefore = updateUndoBeforeRef.current
    updateUndoTimer.current = setTimeout(() => {
      if (capturedBefore) {
        const oldEntity = { ...capturedBefore }
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
      updateUndoBeforeRef.current = null
      updateUndoTimer.current = null
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneRef is stable
  }, [])

  return (
    <div
      onContextMenu={e => e.preventDefault()}
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <style>{EDITOR_CSS}</style>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left + center column */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Top: hierarchy + viewport */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <LeftPanel
              width={leftWidth}
              sceneList={sceneList}
              activeScene={activeScene}
              onSwitchScene={handleSwitchScene}
              onCreateScene={handleCreateScene}
              onDeleteScene={handleDeleteScene}
              onRenameScene={handleRenameScene}
              sceneData={sceneData}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddEntity={handleAddEntity}
              onDeleteEntity={handleDeleteEntity}
              onRenameEntity={handleRenameEntity}
              hiddenEntities={hiddenEntities}
              onToggleVisibility={handleToggleEntityVisibility}
            />
            <ResizeHandle
              direction="horizontal"
              onResize={d =>
                setLeftWidth(w => {
                  const next = Math.max(140, Math.min(400, w + d))
                  localStorage.setItem('mana:leftWidth', String(next))
                  return next
                })
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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
                    hiddenEntities={hiddenEntities}
                  />
                </ManaContext.Provider>
              </div>
            </div>
          </div>
          {/* Bottom: asset browser */}
          <ResizeHandle
            direction="vertical"
            onResize={d =>
              setBottomHeight(h => {
                const next = Math.max(80, Math.min(500, h - d))
                localStorage.setItem('mana:bottomHeight', String(next))
                return next
              })
            }
          />
          <BottomPanel height={bottomHeight} />
        </div>
        {/* Right: inspector (full height) */}
        <ResizeHandle
          direction="horizontal"
          onResize={d =>
            setRightWidth(w => {
              const next = Math.max(200, Math.min(450, w - d))
              localStorage.setItem('mana:rightWidth', String(next))
              return next
            })
          }
        />
        <RightPanel
          width={rightWidth}
          entity={selectedEntity}
          onUpdate={handleUpdateEntity}
          onRename={handleRenameEntity}
          availableScripts={Object.keys(scripts)}
          availableUiComponents={Object.keys(uiComponents)}
          scriptDefs={scripts}
          allEntityIds={useMemo(() => new Set(sceneData?.entities.map(e => e.id) ?? []), [sceneData])}
        />
      </div>
    </div>
  )
}
