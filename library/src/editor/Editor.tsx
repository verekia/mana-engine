import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react'

import { createScene, type ManaScene } from '../scene.ts'

import type { SceneData, SceneEntity } from '../scene-data.ts'
import type { ManaScript } from '../script.ts'

const COLORS = {
  bg: '#1a1a1a',
  panel: '#242424',
  panelHeader: '#2e2e2e',
  border: '#333',
  text: '#ccc',
  textMuted: '#777',
  toolbar: '#2a2a2a',
  viewportBg: '#111',
  hover: '#383838',
  active: '#444',
  selected: '#2a4a7a',
  input: '#1e1e1e',
  inputBorder: '#444',
  accent: '#4488ff',
}

async function fetchSceneList(): Promise<string[]> {
  const res = await fetch('/__mana/scenes')
  if (!res.ok) return []
  return res.json()
}

async function loadSceneData(name: string): Promise<SceneData> {
  const res = await fetch(`/__mana/scenes/${name}`)
  if (!res.ok) throw new Error(`Failed to load scene: ${name}`)
  return res.json()
}

async function saveSceneData(name: string, data: SceneData): Promise<void> {
  await fetch(`/__mana/scenes/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2),
  })
}

function Viewport({
  canvasRef,
  uiEntities,
  uiComponents,
  showUI,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  uiEntities: SceneEntity[]
  uiComponents: Record<string, ComponentType>
  showUI: boolean
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: COLORS.viewportBg,
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {showUI && uiEntities.length > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            containerType: 'inline-size',
            pointerEvents: 'none',
          }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {uiEntities.map(entity => {
              const Component = uiComponents[entity.ui?.component ?? '']
              return Component ? <Component key={entity.id} /> : null
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ViewportBar({ showUI, onToggleUI }: { showUI: boolean; onToggleUI: () => void }) {
  return (
    <div
      style={{
        height: 28,
        background: COLORS.panelHeader,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 10,
        flexShrink: 0,
        fontSize: 11,
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          color: COLORS.textMuted,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input type="checkbox" checked={showUI} onChange={onToggleUI} />
        UI
      </label>
    </div>
  )
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        color: COLORS.textMuted,
        background: COLORS.panelHeader,
        borderBottom: `1px solid ${COLORS.border}`,
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  )
}

function ToolbarButton({
  children,
  title,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  title?: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? COLORS.accent : 'none',
        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
        borderRadius: 4,
        color: active ? '#fff' : disabled ? COLORS.border : COLORS.text,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        fontSize: 14,
        padding: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

function Toolbar({ playing, onPlay, onStop }: { playing: boolean; onPlay: () => void; onStop: () => void }) {
  return (
    <div
      style={{
        height: 40,
        background: playing ? '#1a2a4a' : COLORS.toolbar,
        borderBottom: `1px solid ${playing ? '#2a4a7a' : COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '0 12px',
        flexShrink: 0,
      }}
    >
      <ToolbarButton title="Play" onClick={onPlay} disabled={playing} active={playing}>
        &#9654;
      </ToolbarButton>
      <ToolbarButton title="Stop" onClick={onStop} disabled={!playing}>
        &#9632;
      </ToolbarButton>
    </div>
  )
}

function entityTypeLabel(type: SceneEntity['type']): string {
  switch (type) {
    case 'camera':
      return 'Camera'
    case 'mesh':
      return 'Mesh'
    case 'directional-light':
      return 'Dir. Light'
    case 'ambient-light':
      return 'Amb. Light'
    case 'ui':
      return 'UI Component'
  }
}

function LeftPanel({
  sceneList,
  activeScene,
  onSwitchScene,
  sceneData,
  selectedId,
  onSelect,
}: {
  sceneList: string[]
  activeScene: string
  onSwitchScene: (name: string) => void
  sceneData: SceneData | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div
      style={{
        width: 240,
        background: COLORS.panel,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <PanelHeader>Scenes</PanelHeader>
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${COLORS.border}` }}>
        <select
          value={activeScene}
          onChange={e => onSwitchScene(e.target.value)}
          style={{
            width: '100%',
            background: COLORS.input,
            border: `1px solid ${COLORS.inputBorder}`,
            borderRadius: 3,
            color: COLORS.text,
            fontSize: 11,
            padding: '4px 6px',
            outline: 'none',
          }}
        >
          {sceneList.map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <PanelHeader>Hierarchy</PanelHeader>
      <div
        style={{
          padding: 10,
          fontSize: 12,
          color: COLORS.textMuted,
          flex: 1,
          overflow: 'auto',
        }}
      >
        {sceneData ? (
          <>
            <div style={{ padding: '4px 8px', color: COLORS.text, userSelect: 'none' }}>Scene</div>
            {sceneData.entities.map(entity => (
              <div
                key={entity.id}
                onClick={() => onSelect(entity.id)}
                style={{
                  padding: '4px 8px 4px 24px',
                  cursor: 'pointer',
                  borderRadius: 3,
                  background: selectedId === entity.id ? COLORS.selected : 'transparent',
                  color: selectedId === entity.id ? COLORS.text : COLORS.textMuted,
                  userSelect: 'none',
                }}
              >
                {entity.name}
              </div>
            ))}
          </>
        ) : (
          <div style={{ color: COLORS.textMuted }}>Loading...</div>
        )}
      </div>
    </div>
  )
}

function Vec3Input({
  label,
  value,
  onChange,
}: {
  label: string
  value: [number, number, number]
  onChange: (v: [number, number, number]) => void
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <div key={axis} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ color: COLORS.textMuted, fontSize: 10 }}>{axis}</span>
            <input
              type="number"
              step={0.1}
              value={value[i]}
              onChange={e => {
                const next = [...value] as [number, number, number]
                next[i] = Number.parseFloat(e.target.value) || 0
                onChange(next)
              }}
              style={{
                width: '100%',
                background: COLORS.input,
                border: `1px solid ${COLORS.inputBorder}`,
                borderRadius: 3,
                color: COLORS.text,
                fontSize: 11,
                padding: '3px 4px',
                outline: 'none',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function NumberInput({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <input
        type="number"
        step={step ?? 0.1}
        value={value}
        onChange={e => onChange(Number.parseFloat(e.target.value) || 0)}
        style={{
          width: 80,
          background: COLORS.input,
          border: `1px solid ${COLORS.inputBorder}`,
          borderRadius: 3,
          color: COLORS.text,
          fontSize: 11,
          padding: '3px 4px',
          outline: 'none',
        }}
      />
    </div>
  )
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 24,
            height: 20,
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            padding: 0,
            background: 'none',
          }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 64,
            background: COLORS.input,
            border: `1px solid ${COLORS.inputBorder}`,
            borderRadius: 3,
            color: COLORS.text,
            fontSize: 11,
            padding: '3px 4px',
            outline: 'none',
          }}
        />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: COLORS.text,
        fontWeight: 500,
        fontSize: 12,
        marginBottom: 8,
        marginTop: 12,
      }}
    >
      {children}
    </div>
  )
}

function RightPanel({ entity, onUpdate }: { entity: SceneEntity | null; onUpdate: (entity: SceneEntity) => void }) {
  return (
    <div
      style={{
        width: 280,
        background: COLORS.panel,
        borderLeft: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <PanelHeader>Inspector</PanelHeader>
      <div
        style={{
          padding: 10,
          fontSize: 12,
          color: COLORS.textMuted,
          flex: 1,
          overflow: 'auto',
        }}
      >
        {entity ? (
          <>
            <div
              style={{
                color: COLORS.text,
                fontWeight: 600,
                fontSize: 13,
                marginBottom: 4,
              }}
            >
              {entity.name}
            </div>
            <div style={{ color: COLORS.textMuted, fontSize: 10, marginBottom: 12 }}>
              {entityTypeLabel(entity.type)}
            </div>

            {entity.transform && (
              <>
                <SectionLabel>Transform</SectionLabel>
                {entity.transform.position && (
                  <Vec3Input
                    label="Position"
                    value={entity.transform.position}
                    onChange={v =>
                      onUpdate({
                        ...entity,
                        transform: { ...entity.transform, position: v },
                      })
                    }
                  />
                )}
                {entity.transform.rotation && (
                  <Vec3Input
                    label="Rotation"
                    value={entity.transform.rotation}
                    onChange={v =>
                      onUpdate({
                        ...entity,
                        transform: { ...entity.transform, rotation: v },
                      })
                    }
                  />
                )}
                {entity.transform.scale && (
                  <Vec3Input
                    label="Scale"
                    value={entity.transform.scale}
                    onChange={v =>
                      onUpdate({
                        ...entity,
                        transform: { ...entity.transform, scale: v },
                      })
                    }
                  />
                )}
              </>
            )}

            {entity.camera && (
              <>
                <SectionLabel>Camera</SectionLabel>
                <NumberInput
                  label="FOV"
                  value={entity.camera.fov ?? 50}
                  step={1}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      camera: { ...entity.camera, fov: v },
                    })
                  }
                />
                <NumberInput
                  label="Near"
                  value={entity.camera.near ?? 0.1}
                  step={0.01}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      camera: { ...entity.camera, near: v },
                    })
                  }
                />
                <NumberInput
                  label="Far"
                  value={entity.camera.far ?? 100}
                  step={1}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      camera: { ...entity.camera, far: v },
                    })
                  }
                />
              </>
            )}

            {entity.mesh && (
              <>
                <SectionLabel>Material</SectionLabel>
                <ColorInput
                  label="Color"
                  value={entity.mesh.material?.color ?? '#4488ff'}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      mesh: {
                        ...entity.mesh,
                        material: { ...entity.mesh?.material, color: v },
                      },
                    })
                  }
                />
              </>
            )}

            {entity.ui && (
              <>
                <SectionLabel>UI</SectionLabel>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Component</span>
                  <span style={{ color: COLORS.text, fontSize: 11 }}>{entity.ui.component}</span>
                </div>
              </>
            )}

            {entity.scripts && entity.scripts.length > 0 && (
              <>
                <SectionLabel>Scripts</SectionLabel>
                {entity.scripts.map(s => (
                  <div
                    key={s}
                    style={{
                      padding: '3px 0',
                      fontSize: 11,
                      color: COLORS.text,
                      fontFamily: 'monospace',
                    }}
                  >
                    {s}
                  </div>
                ))}
              </>
            )}

            {entity.light && (
              <>
                <SectionLabel>Light</SectionLabel>
                <ColorInput
                  label="Color"
                  value={entity.light.color ?? '#ffffff'}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      light: { ...entity.light, color: v },
                    })
                  }
                />
                <NumberInput
                  label="Intensity"
                  value={entity.light.intensity ?? 1}
                  step={0.1}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      light: { ...entity.light, intensity: v },
                    })
                  }
                />
              </>
            )}
          </>
        ) : (
          <div style={{ color: COLORS.textMuted, fontStyle: 'italic' }}>Select an entity to inspect</div>
        )}
      </div>
    </div>
  )
}

function BottomPanel({ logs }: { logs: { id: number; msg: string }[] }) {
  return (
    <div
      style={{
        height: 180,
        background: COLORS.panel,
        borderTop: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <PanelHeader>Console</PanelHeader>
      <div
        style={{
          padding: 10,
          fontSize: 11,
          color: COLORS.textMuted,
          fontFamily: 'monospace',
          flex: 1,
          overflow: 'auto',
        }}
      >
        {logs.map(entry => (
          <div key={entry.id}>{entry.msg}</div>
        ))}
      </div>
    </div>
  )
}

export default function Editor({
  Game,
  uiComponents = {},
  scripts: _scripts = {},
}: {
  Game: ComponentType
  uiComponents?: Record<string, ComponentType>
  scripts?: Record<string, ManaScript>
}) {
  const [showUI, setShowUI] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [sceneList, setSceneList] = useState<string[]>([])
  const [activeScene, setActiveScene] = useState('')
  const [sceneData, setSceneData] = useState<SceneData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<{ id: number; msg: string }[]>([{ id: 0, msg: 'Mana Engine editor ready' }])
  const logIdRef = useRef(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<ManaScene | null>(null)
  const sceneDataRef = useRef<SceneData | null>(null)
  const activeSceneRef = useRef('')

  sceneDataRef.current = sceneData
  activeSceneRef.current = activeScene

  const log = useCallback((msg: string) => {
    const id = logIdRef.current++
    setLogs(prev => [...prev, { id, msg }])
  }, [])

  // Fetch scene list on mount, then load the first scene
  useEffect(() => {
    fetchSceneList().then(list => {
      setSceneList(list)
      if (list.length > 0) {
        const first = list[0]
        setActiveScene(first)
        loadSceneData(first)
          .then(data => {
            setSceneData(data)
            log(`Loaded scene: ${first}`)
          })
          .catch(err => log(`Error loading scene: ${err.message}`))
      }
    })
  }, [log])

  // Switch scene handler
  const handleSwitchScene = useCallback(
    (name: string) => {
      setActiveScene(name)
      setSelectedId(null)

      // Dispose old Three.js scene
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }

      loadSceneData(name)
        .then(data => {
          setSceneData(data)
          log(`Loaded scene: ${name}`)

          // Create new Three.js scene
          const canvas = canvasRef.current
          if (canvas) {
            sceneRef.current = createScene(canvas, data)
          }
        })
        .catch(err => log(`Error loading scene: ${err.message}`))
    },
    [log],
  )

  // Create/dispose Three.js scene based on scene data and play state
  useEffect(() => {
    if (playing) return
    const canvas = canvasRef.current
    if (!canvas || !sceneData) return

    // Only create if not already created (handleSwitchScene creates its own)
    if (sceneRef.current) return

    sceneRef.current = createScene(canvas, sceneData)

    return () => {
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
    }
  }, [sceneData, playing])

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const data = sceneDataRef.current
        const name = activeSceneRef.current
        if (!data || !name) return
        saveSceneData(name, data)
          .then(() => log(`Scene saved: ${name}`))
          .catch(err => log(`Error saving: ${err.message}`))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [log])

  const handlePlay = useCallback(() => {
    setPlaying(true)
    setSelectedId(null)
    log('Play mode started')
  }, [log])

  const handleStop = useCallback(() => {
    setPlaying(false)
    log('Play mode stopped')
  }, [log])

  const selectedEntity = sceneData?.entities.find(e => e.id === selectedId) ?? null

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
      <Toolbar playing={playing} onPlay={handlePlay} onStop={handleStop} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <LeftPanel
          sceneList={sceneList}
          activeScene={activeScene}
          onSwitchScene={handleSwitchScene}
          sceneData={sceneData}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {!playing && <ViewportBar showUI={showUI} onToggleUI={() => setShowUI(s => !s)} />}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {playing ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  containerType: 'inline-size',
                  position: 'relative',
                }}
              >
                <Game />
              </div>
            ) : (
              <Viewport
                canvasRef={canvasRef}
                uiEntities={sceneData?.entities.filter(e => e.type === 'ui') ?? []}
                uiComponents={uiComponents}
                showUI={showUI}
              />
            )}
          </div>
          <BottomPanel logs={logs} />
        </div>
        <RightPanel entity={selectedEntity} onUpdate={handleUpdateEntity} />
      </div>
    </div>
  )
}
