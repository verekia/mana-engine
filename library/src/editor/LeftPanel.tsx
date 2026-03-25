import { useEffect, useRef, useState } from 'react'

import { COLORS, INPUT_STYLE } from './colors.ts'
import {
  IconAmbientLight,
  IconCamera,
  IconChevronDown,
  IconDirectionalLight,
  IconMesh,
  IconModel,
  IconPlus,
  IconPointLight,
  IconUI,
} from './icons.tsx'

import type { SceneData, SceneEntity } from '../scene-data.ts'

function entityTypeIcon(type: SceneEntity['type']): React.ReactNode {
  switch (type) {
    case 'camera':
      return <IconCamera />
    case 'mesh':
      return <IconMesh />
    case 'model':
      return <IconModel />
    case 'directional-light':
      return <IconDirectionalLight />
    case 'ambient-light':
      return <IconAmbientLight />
    case 'point-light':
      return <IconPointLight />
    case 'ui':
      return <IconUI />
  }
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

const ADD_OBJECT_OPTIONS: { label: string; category: string; icon: React.ReactNode; create: () => SceneEntity }[] = [
  {
    label: 'Empty',
    category: 'General',
    icon: <IconMesh />,
    create: () => ({ id: generateId(), name: 'Empty', type: 'mesh', transform: { position: [0, 0, 0] } }),
  },
  {
    label: 'GLTF Model',
    category: 'General',
    icon: <IconModel />,
    create: () => ({
      id: generateId(),
      name: 'Model',
      type: 'model',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      model: { src: '' },
    }),
  },
  {
    label: 'Camera',
    category: 'General',
    icon: <IconCamera />,
    create: () => ({
      id: generateId(),
      name: 'Camera',
      type: 'camera',
      transform: { position: [0, 1, 5] },
      camera: { fov: 50, near: 0.1, far: 100 },
    }),
  },
  {
    label: 'Box',
    category: 'Mesh',
    icon: <IconMesh />,
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
    icon: <IconMesh />,
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
    icon: <IconMesh />,
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
    icon: <IconMesh />,
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
    icon: <IconMesh />,
    create: () => ({
      id: generateId(),
      name: 'Capsule',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      mesh: { geometry: 'capsule', material: { color: '#888888' } },
    }),
  },
  {
    label: 'Directional Light',
    category: 'Light',
    icon: <IconDirectionalLight />,
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
    icon: <IconPointLight />,
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
    icon: <IconAmbientLight />,
    create: () => ({
      id: generateId(),
      name: 'Ambient Light',
      type: 'ambient-light',
      light: { color: '#ffffff', intensity: 0.3 },
    }),
  },
]

function AddEntityPopover({
  anchorRef,
  onAdd,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onAdd: (entity: SceneEntity) => void
  onClose: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverHeight = 320
  const pos = (() => {
    if (!anchorRef.current) return { top: 0, left: 0 }
    const rect = anchorRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow < popoverHeight ? rect.top - popoverHeight - 2 : rect.bottom + 2
    return { top: Math.max(4, top), left: Math.max(4, rect.right - 180) }
  })()

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: 180,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 1001,
        padding: '4px 0',
        maxHeight: 300,
        overflow: 'auto',
      }}
    >
      {['General', 'Mesh', 'Light'].map(cat => (
        <div key={cat}>
          <div
            style={{
              padding: '5px 10px 3px',
              fontSize: 9,
              color: COLORS.textMuted,
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
            }}
          >
            {cat}
          </div>
          {ADD_OBJECT_OPTIONS.filter(o => o.category === cat).map(opt => (
            <button
              key={opt.label}
              onClick={() => {
                onAdd(opt.create())
                onClose()
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = COLORS.hover
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                padding: '4px 10px',
                background: 'transparent',
                border: 'none',
                color: COLORS.text,
                fontSize: 11,
                textAlign: 'left',
              }}
            >
              <span style={{ color: COLORS.textMuted, display: 'flex' }}>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export function LeftPanel({
  width,
  sceneList,
  activeScene,
  onSwitchScene,
  onCreateScene,
  onDeleteScene,
  onRenameScene,
  sceneData,
  selectedId,
  onSelect,
  onAddEntity,
  onDeleteEntity,
  onRenameEntity,
}: {
  width: number
  sceneList: string[]
  activeScene: string
  onSwitchScene: (name: string) => void
  onCreateScene: (name: string) => void
  onDeleteScene: (name: string) => void
  onRenameScene: (oldName: string, newName: string) => void
  sceneData: SceneData | null
  selectedId: string | null
  onSelect: (id: string) => void
  onAddEntity: (entity: SceneEntity) => void
  onDeleteEntity: (id: string) => void
  onRenameEntity: (id: string, name: string) => void
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entityId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renamingScene, setRenamingScene] = useState(false)
  const [sceneRenameValue, setSceneRenameValue] = useState('')
  return (
    <div
      style={{
        width,
        background: COLORS.panel,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Scene selector */}
      <div
        style={{
          padding: '4px 6px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <div style={{ flex: 1, position: 'relative' }}>
          {renamingScene ? (
            <input
              autoFocus
              value={sceneRenameValue}
              onFocus={e => e.target.select()}
              onChange={e => setSceneRenameValue(e.target.value)}
              onBlur={() => {
                const v = sceneRenameValue.trim()
                if (v && v !== activeScene && /^[a-zA-Z0-9_-]+$/.test(v)) {
                  onRenameScene(activeScene, v)
                }
                setRenamingScene(false)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = sceneRenameValue.trim()
                  if (v && v !== activeScene && /^[a-zA-Z0-9_-]+$/.test(v)) {
                    onRenameScene(activeScene, v)
                  }
                  setRenamingScene(false)
                }
                if (e.key === 'Escape') setRenamingScene(false)
              }}
              style={{
                ...INPUT_STYLE,
                width: '100%',
                borderColor: COLORS.accent,
                boxShadow: COLORS.focusRing,
              }}
            />
          ) : (
            <>
              <select
                value={activeScene}
                onChange={e => onSwitchScene(e.target.value)}
                onContextMenu={e => {
                  e.preventDefault()
                  setSceneContextMenu({ x: e.clientX, y: e.clientY })
                }}
                style={{
                  ...INPUT_STYLE,
                  width: '100%',
                  paddingRight: 18,
                  appearance: 'none',
                }}
              >
                {sceneList.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: 5,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: COLORS.textMuted,
                  display: 'flex',
                }}
              >
                <IconChevronDown />
              </span>
            </>
          )}
        </div>
        <button
          onClick={() => {
            const name = prompt('New scene name (letters, numbers, - and _ only):')
            if (name && /^[a-zA-Z0-9_-]+$/.test(name)) {
              onCreateScene(name)
            }
          }}
          title="New scene"
          style={{
            background: 'none',
            border: 'none',
            color: COLORS.textMuted,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <IconPlus />
        </button>
      </div>

      {/* Scene context menu */}
      {sceneContextMenu && (
        <>
          <div
            onClick={() => setSceneContextMenu(null)}
            onContextMenu={e => {
              e.preventDefault()
              setSceneContextMenu(null)
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
          />
          <div
            style={{
              position: 'fixed',
              left: sceneContextMenu.x,
              top: sceneContextMenu.y,
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '4px 0',
              zIndex: 1001,
              minWidth: 120,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <button
              onClick={() => {
                setSceneRenameValue(activeScene)
                setRenamingScene(true)
                setSceneContextMenu(null)
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = COLORS.hover
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 12px',
                background: 'transparent',
                border: 'none',
                color: COLORS.text,
                fontSize: 11,
                textAlign: 'left',
              }}
            >
              Rename
            </button>
            <button
              onClick={() => {
                if (sceneList.length <= 1) {
                  alert('Cannot delete the last scene.')
                } else if (confirm(`Delete scene "${activeScene}"?`)) {
                  onDeleteScene(activeScene)
                }
                setSceneContextMenu(null)
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 12px',
                background: 'transparent',
                border: 'none',
                color: COLORS.danger,
                fontSize: 11,
                textAlign: 'left',
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}

      {/* Entity list */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '4px 0',
        }}
      >
        {sceneData ? (
          sceneData.entities.map(entity => (
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
                padding: '3px 8px 3px 10px',
                borderRadius: 4,
                margin: '0 4px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: selectedId === entity.id ? COLORS.selected : 'transparent',
                borderLeft: selectedId === entity.id ? `2px solid ${COLORS.accent}` : '2px solid transparent',
                color: selectedId === entity.id ? COLORS.text : COLORS.textMuted,
                userSelect: 'none',
                fontSize: 12,
              }}
              onMouseEnter={e => {
                if (selectedId !== entity.id) e.currentTarget.style.background = COLORS.hover
              }}
              onMouseLeave={e => {
                if (selectedId !== entity.id) e.currentTarget.style.background = 'transparent'
              }}
            >
              {renamingId === entity.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onFocus={e => e.target.select()}
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
                    ...INPUT_STYLE,
                    width: '100%',
                    fontSize: 12,
                    padding: '1px 4px',
                    borderColor: COLORS.accent,
                    boxShadow: COLORS.focusRing,
                  }}
                />
              ) : (
                <>
                  <span
                    style={{
                      color: selectedId === entity.id ? COLORS.text : COLORS.textDim,
                      display: 'flex',
                      flexShrink: 0,
                    }}
                  >
                    {entityTypeIcon(entity.type)}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entity.name}
                  </span>
                </>
              )}
            </div>
          ))
        ) : (
          <div style={{ padding: 10, color: COLORS.textMuted, fontSize: 11 }}>Loading...</div>
        )}
      </div>

      {/* Add object button */}
      <div style={{ padding: '4px 6px', borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <button
          ref={addButtonRef}
          onClick={() => setAddMenuOpen(s => !s)}
          onMouseEnter={e => {
            e.currentTarget.style.background = COLORS.active
            e.currentTarget.style.color = COLORS.text
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = COLORS.hover
            e.currentTarget.style.color = COLORS.textMuted
          }}
          style={{
            width: '100%',
            padding: '4px 0',
            background: COLORS.hover,
            border: 'none',
            borderRadius: 4,
            color: COLORS.textMuted,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <IconPlus />
          Add Object
        </button>
      </div>

      {addMenuOpen && (
        <AddEntityPopover anchorRef={addButtonRef} onAdd={onAddEntity} onClose={() => setAddMenuOpen(false)} />
      )}

      {/* Context menu */}
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
              borderRadius: 6,
              padding: '4px 0',
              zIndex: 1001,
              minWidth: 120,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
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
              onMouseEnter={e => {
                e.currentTarget.style.background = COLORS.hover
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 12px',
                background: 'transparent',
                border: 'none',
                color: COLORS.text,
                fontSize: 11,
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
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 12px',
                background: 'transparent',
                border: 'none',
                color: COLORS.danger,
                fontSize: 11,
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
