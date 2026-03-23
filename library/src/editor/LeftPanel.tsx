import { useState } from 'react'

import { COLORS } from './colors.ts'
import { PanelHeader } from './widgets.tsx'

import type { SceneData, SceneEntity } from '../scene-data.ts'

function entityTypeIcon(type: SceneEntity['type']): string {
  switch (type) {
    case 'camera':
      return '\u{1F3A5}'
    case 'mesh':
      return '\u{25A6}'
    case 'model':
      return '\u{1F4E6}'
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
    label: 'GLTF Model',
    category: 'General',
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

export function LeftPanel({
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
