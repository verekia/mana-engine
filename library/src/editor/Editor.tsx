import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ManaContext } from '../scene-context.ts'
import { createScene, type ManaScene } from '../scene.ts'

import type { MeshData, SceneData, SceneEntity } from '../scene-data.ts'
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
  playing,
  onCanvasClick,
  onSelectEntity,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  uiEntities: SceneEntity[]
  uiComponents: Record<string, ComponentType>
  showUI: boolean
  playing: boolean
  onCanvasClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onSelectEntity?: (id: string) => void
}) {
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: COLORS.viewportBg,
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={
          !playing
            ? e => {
                pointerDownPos.current = { x: e.clientX, y: e.clientY }
              }
            : undefined
        }
        onPointerUp={
          !playing
            ? e => {
                if (pointerDownPos.current) {
                  const dx = e.clientX - pointerDownPos.current.x
                  const dy = e.clientY - pointerDownPos.current.y
                  if (dx * dx + dy * dy < 25) {
                    onCanvasClick?.(e)
                  }
                  pointerDownPos.current = null
                }
              }
            : undefined
        }
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {showUI && uiEntities.length > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            containerType: 'inline-size',
            pointerEvents: playing ? 'auto' : 'none',
          }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {uiEntities.map(entity => {
              const Component = uiComponents[entity.ui?.component ?? '']
              if (!Component) return null
              return playing ? (
                <Component key={entity.id} />
              ) : (
                <div
                  key={entity.id}
                  onClick={e => {
                    e.stopPropagation()
                    onSelectEntity?.(entity.id)
                  }}
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                >
                  <Component />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ViewportBar({
  showUI,
  onToggleUI,
  showGizmos,
  onToggleGizmos,
}: {
  showUI: boolean
  onToggleUI: () => void
  showGizmos: boolean
  onToggleGizmos: () => void
}) {
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
        <input type="checkbox" checked={showGizmos} onChange={onToggleGizmos} />
        Gizmos
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

function Toolbar({
  playing,
  onPlay,
  onStop,
  dirty,
}: {
  playing: boolean
  onPlay: () => void
  onStop: () => void
  dirty: boolean
}) {
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
        position: 'relative',
      }}
    >
      <ToolbarButton title="Play" onClick={onPlay} disabled={playing} active={playing}>
        &#9654;
      </ToolbarButton>
      <ToolbarButton title="Stop" onClick={onStop} disabled={!playing}>
        &#9632;
      </ToolbarButton>
      <div
        style={{
          position: 'absolute',
          right: 12,
          fontSize: 11,
          fontWeight: 600,
          color: dirty ? '#e8a034' : '#4a4',
        }}
      >
        {dirty ? 'Unsaved' : 'Saved'}
      </div>
    </div>
  )
}

function entityTypeIcon(type: SceneEntity['type']): string {
  switch (type) {
    case 'camera':
      return '\u{1F3A5}'
    case 'mesh':
      return '\u{25A6}'
    case 'directional-light':
      return '\u{2600}'
    case 'ambient-light':
      return '\u{1F4A1}'
    case 'point-light':
      return '\u{1F4A1}'
    case 'ui':
      return '\u{1F5BC}'
  }
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
    case 'point-light':
      return 'Point Light'
    case 'ui':
      return 'UI Component'
  }
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

const ADD_OBJECT_OPTIONS: { label: string; category: string; create: () => SceneEntity }[] = [
  {
    label: 'Empty',
    category: 'General',
    create: () => ({ id: generateId(), name: 'Empty', type: 'mesh', transform: { position: [0, 0, 0] } }),
  },
  {
    label: 'Box',
    category: 'Mesh',
    create: () => ({
      id: generateId(),
      name: 'Box',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      mesh: { geometry: 'box', material: { color: '#888888' } },
    }),
  },
  {
    label: 'Sphere',
    category: 'Mesh',
    create: () => ({
      id: generateId(),
      name: 'Sphere',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      mesh: { geometry: 'sphere', material: { color: '#888888' } },
    }),
  },
  {
    label: 'Plane',
    category: 'Mesh',
    create: () => ({
      id: generateId(),
      name: 'Plane',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      mesh: { geometry: 'plane', material: { color: '#888888' } },
    }),
  },
  {
    label: 'Cylinder',
    category: 'Mesh',
    create: () => ({
      id: generateId(),
      name: 'Cylinder',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      mesh: { geometry: 'cylinder', material: { color: '#888888' } },
    }),
  },
  {
    label: 'Capsule',
    category: 'Mesh',
    create: () => ({
      id: generateId(),
      name: 'Capsule',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      mesh: { geometry: 'capsule', material: { color: '#888888' } },
    }),
  },
  {
    label: 'Camera',
    category: 'General',
    create: () => ({
      id: generateId(),
      name: 'Camera',
      type: 'camera',
      transform: { position: [0, 1, 5] },
      camera: { fov: 50, near: 0.1, far: 100 },
    }),
  },
  {
    label: 'Directional Light',
    category: 'Light',
    create: () => ({
      id: generateId(),
      name: 'Directional Light',
      type: 'directional-light',
      transform: { position: [2, 3, 4] },
      light: { color: '#ffffff', intensity: 1 },
    }),
  },
  {
    label: 'Point Light',
    category: 'Light',
    create: () => ({
      id: generateId(),
      name: 'Point Light',
      type: 'point-light',
      transform: { position: [0, 2, 0] },
      light: { color: '#ffffff', intensity: 1 },
    }),
  },
  {
    label: 'Ambient Light',
    category: 'Light',
    create: () => ({
      id: generateId(),
      name: 'Ambient Light',
      type: 'ambient-light',
      light: { color: '#ffffff', intensity: 0.3 },
    }),
  },
]

function LeftPanel({
  sceneList,
  activeScene,
  onSwitchScene,
  sceneData,
  selectedId,
  onSelect,
  onAddEntity,
  onDeleteEntity,
  onRenameEntity,
}: {
  sceneList: string[]
  activeScene: string
  onSwitchScene: (name: string) => void
  sceneData: SceneData | null
  selectedId: string | null
  onSelect: (id: string) => void
  onAddEntity: (entity: SceneEntity) => void
  onDeleteEntity: (id: string) => void
  onRenameEntity: (id: string, name: string) => void
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entityId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
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
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        Hierarchy
        <button
          onClick={() => setAddMenuOpen(s => !s)}
          style={{
            background: 'none',
            border: 'none',
            color: COLORS.text,
            cursor: 'pointer',
            fontSize: 14,
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>
      {addMenuOpen && (
        <div
          style={{
            background: COLORS.panel,
            borderBottom: `1px solid ${COLORS.border}`,
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          {['General', 'Mesh', 'Light'].map(cat => (
            <div key={cat}>
              <div
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  color: COLORS.textMuted,
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                }}
              >
                {cat}
              </div>
              {ADD_OBJECT_OPTIONS.filter(o => o.category === cat).map(opt => (
                <button
                  key={opt.label}
                  onClick={() => {
                    const entity = opt.create()
                    onAddEntity(entity)
                    setAddMenuOpen(false)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '4px 10px 4px 20px',
                    background: 'none',
                    border: 'none',
                    color: COLORS.text,
                    fontSize: 11,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
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
                onDoubleClick={() => {
                  setRenamingId(entity.id)
                  setRenameValue(entity.name)
                }}
                onContextMenu={e => {
                  e.preventDefault()
                  onSelect(entity.id)
                  setContextMenu({ x: e.clientX, y: e.clientY, entityId: entity.id })
                }}
                style={{
                  padding: '4px 8px 4px 24px',
                  cursor: 'pointer',
                  borderRadius: 3,
                  background: selectedId === entity.id ? COLORS.selected : 'transparent',
                  color: selectedId === entity.id ? COLORS.text : COLORS.textMuted,
                  userSelect: 'none',
                }}
              >
                {renamingId === entity.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim()) onRenameEntity(entity.id, renameValue.trim())
                      setRenamingId(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (renameValue.trim()) onRenameEntity(entity.id, renameValue.trim())
                        setRenamingId(null)
                      }
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%',
                      background: COLORS.input,
                      border: `1px solid ${COLORS.accent}`,
                      borderRadius: 2,
                      color: COLORS.text,
                      fontSize: 12,
                      padding: '1px 4px',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <>
                    <span style={{ marginRight: 6, fontSize: 10 }}>{entityTypeIcon(entity.type)}</span>
                    {entity.name}
                  </>
                )}
              </div>
            ))}
          </>
        ) : (
          <div style={{ color: COLORS.textMuted }}>Loading...</div>
        )}
      </div>
      {contextMenu && (
        <>
          <div
            onClick={() => setContextMenu(null)}
            onContextMenu={e => {
              e.preventDefault()
              setContextMenu(null)
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
          />
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              padding: '4px 0',
              zIndex: 1001,
              minWidth: 120,
            }}
          >
            <button
              onClick={() => {
                const entity = sceneData?.entities.find(e => e.id === contextMenu.entityId)
                if (entity) {
                  setRenamingId(entity.id)
                  setRenameValue(entity.name)
                }
                setContextMenu(null)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 12px',
                background: 'none',
                border: 'none',
                color: COLORS.text,
                fontSize: 11,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Rename
            </button>
            <button
              onClick={() => {
                onDeleteEntity(contextMenu.entityId)
                setContextMenu(null)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 12px',
                background: 'none',
                border: 'none',
                color: '#e55',
                fontSize: 11,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
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

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
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
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 100,
          background: COLORS.input,
          border: `1px solid ${COLORS.inputBorder}`,
          borderRadius: 3,
          color: COLORS.text,
          fontSize: 11,
          padding: '3px 4px',
          outline: 'none',
        }}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
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

function AddComponentButton({
  entity,
  availableScripts,
  onUpdate,
}: {
  entity: SceneEntity
  availableScripts: string[]
  onUpdate: (entity: SceneEntity) => void
}) {
  const [open, setOpen] = useState(false)

  const options: { label: string; action: () => void }[] = []

  if (!entity.mesh && entity.type === 'mesh') {
    options.push({
      label: 'Mesh',
      action: () => onUpdate({ ...entity, mesh: { geometry: 'box', material: { color: '#4488ff' } } }),
    })
  }
  if (!entity.rigidBody) {
    options.push({
      label: 'Rigid Body',
      action: () => onUpdate({ ...entity, rigidBody: { type: 'dynamic' } }),
    })
  }
  if (!entity.collider) {
    options.push({
      label: 'Collider',
      action: () => onUpdate({ ...entity, collider: { shape: 'box', halfExtents: [0.5, 0.5, 0.5] } }),
    })
  }

  const attachedScripts = entity.scripts ?? []
  for (const name of availableScripts) {
    if (!attachedScripts.includes(name)) {
      options.push({
        label: `Script: ${name}`,
        action: () => onUpdate({ ...entity, scripts: [...attachedScripts, name] }),
      })
    }
  }

  if (options.length === 0) return null

  return (
    <div style={{ marginTop: 16 }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: '100%',
            padding: '6px 0',
            background: COLORS.panelHeader,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            color: COLORS.text,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Add Component
        </button>
      ) : (
        <div>
          {options.map(opt => (
            <button
              key={opt.label}
              onClick={() => {
                opt.action()
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 8px',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${COLORS.border}`,
                color: COLORS.text,
                fontSize: 11,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              width: '100%',
              padding: '5px 8px',
              background: 'none',
              border: 'none',
              color: COLORS.textMuted,
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function RightPanel({
  entity,
  onUpdate,
  availableScripts,
}: {
  entity: SceneEntity | null
  onUpdate: (entity: SceneEntity) => void
  availableScripts: string[]
}) {
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
                <SectionLabel>Mesh</SectionLabel>
                <SelectInput
                  label="Geometry"
                  value={entity.mesh.geometry ?? 'box'}
                  options={['box', 'sphere', 'plane', 'cylinder', 'capsule']}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      mesh: { ...entity.mesh, geometry: v as MeshData['geometry'] },
                    })
                  }
                />
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
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '3px 0',
                      fontSize: 11,
                      color: COLORS.text,
                      fontFamily: 'monospace',
                    }}
                  >
                    {s}
                    <button
                      onClick={() =>
                        onUpdate({
                          ...entity,
                          scripts: entity.scripts?.filter(x => x !== s),
                        })
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        color: COLORS.textMuted,
                        cursor: 'pointer',
                        fontSize: 11,
                        padding: '0 4px',
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </>
            )}

            {entity.rigidBody && (
              <>
                <SectionLabel>Rigid Body</SectionLabel>
                <SelectInput
                  label="Type"
                  value={entity.rigidBody.type}
                  options={['dynamic', 'fixed', 'kinematic']}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      rigidBody: { ...entity.rigidBody, type: v as 'dynamic' | 'fixed' | 'kinematic' },
                    })
                  }
                />
              </>
            )}

            {entity.collider && (
              <>
                <SectionLabel>Collider</SectionLabel>
                <SelectInput
                  label="Shape"
                  value={entity.collider.shape}
                  options={['box', 'sphere', 'capsule', 'cylinder']}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      collider: { ...entity.collider, shape: v as 'box' | 'sphere' | 'capsule' | 'cylinder' },
                    })
                  }
                />
                {(entity.collider.shape === 'box' || !entity.collider.shape) && (
                  <Vec3Input
                    label="Half Extents"
                    value={entity.collider.halfExtents ?? [0.5, 0.5, 0.5]}
                    onChange={v => {
                      const shape = entity.collider?.shape ?? 'box'
                      onUpdate({
                        ...entity,
                        collider: { shape, ...entity.collider, halfExtents: v },
                      })
                    }}
                  />
                )}
                {entity.collider.shape !== 'box' && (
                  <NumberInput
                    label="Radius"
                    value={entity.collider.radius ?? 0.5}
                    step={0.1}
                    onChange={v => {
                      const shape = entity.collider?.shape ?? 'box'
                      onUpdate({
                        ...entity,
                        collider: { shape, ...entity.collider, radius: v },
                      })
                    }}
                  />
                )}
                {(entity.collider.shape === 'capsule' || entity.collider.shape === 'cylinder') && (
                  <NumberInput
                    label="Half Height"
                    value={entity.collider.halfHeight ?? 0.5}
                    step={0.1}
                    onChange={v => {
                      const shape = entity.collider?.shape ?? 'box'
                      onUpdate({
                        ...entity,
                        collider: { shape, ...entity.collider, halfHeight: v },
                      })
                    }}
                  />
                )}
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
            <AddComponentButton entity={entity} availableScripts={availableScripts} onUpdate={onUpdate} />
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

  sceneDataRef.current = sceneData
  activeSceneRef.current = activeScene
  const showGizmosRef = useRef(showGizmos)
  showGizmosRef.current = showGizmos

  const dirty = sceneData ? JSON.stringify(sceneData) !== savedSceneJson : false

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
    async (data: SceneData, isPlaying: boolean) => {
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

  const handlePlay = useCallback(async () => {
    const data = sceneDataRef.current
    if (!data) return
    prePlaySceneRef.current = activeSceneRef.current
    prePlaySceneDataRef.current = data
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
      await recreateScene(data, false)
    }
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
      return {
        ...prev,
        entities: prev.entities.map(e => (e.id === id ? { ...e, name } : e)),
      }
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
        <RightPanel entity={selectedEntity} onUpdate={handleUpdateEntity} availableScripts={Object.keys(scripts)} />
      </div>
    </div>
  )
}
