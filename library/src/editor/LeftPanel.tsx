import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { findEntityInTree, generateId } from '../scene-data.ts'
import { COLORS, INPUT_STYLE } from './colors.ts'
import {
  IconAmbientLight,
  IconAudio,
  IconCamera,
  IconChevronDown,
  IconDirectionalLight,
  IconMesh,
  IconModel,
  IconPlus,
  IconPointLight,
  IconPrefab,
  IconUI,
} from './icons.tsx'
import {
  createPrefab as apiCreatePrefab,
  deletePrefab as apiDeletePrefab,
  fetchPrefabList,
  renamePrefab as apiRenamePrefab,
} from './scene-api.ts'

import type { PrefabData, SceneData, SceneEntity } from '../scene-data.ts'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
const MOD_KEY = isMac ? '\u2318' : 'Ctrl'

const LS_COLLAPSED_KEY = 'mana:hierarchyCollapsed'

function loadCollapsedEntities(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_COLLAPSED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveCollapsedEntities(set: Set<string>) {
  localStorage.setItem(LS_COLLAPSED_KEY, JSON.stringify([...set]))
}

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
    case 'ui-group':
      return <IconUI />
    case 'audio':
      return <IconAudio />
  }
}

const ADD_OBJECT_OPTIONS: { label: string; category: string; icon: React.ReactNode; create: () => SceneEntity }[] = [
  {
    label: 'Empty',
    category: 'General',
    icon: <IconMesh />,
    create: () => ({
      id: generateId(),
      name: 'Empty',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }),
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
      transform: { position: [0, 1, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
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
      transform: { position: [2, 3, 4], rotation: [0, 0, 0], scale: [1, 1, 1] },
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
      transform: { position: [0, 2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
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
  {
    label: 'Audio',
    category: 'General',
    icon: <IconAudio />,
    create: () => ({
      id: generateId(),
      name: 'Audio',
      type: 'audio',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      audio: { src: '', volume: 1, loop: false },
    }),
  },
  {
    label: 'UI Group',
    category: 'General',
    icon: <IconUI />,
    create: () => ({
      id: generateId(),
      name: 'UI Group',
      type: 'ui-group',
    }),
  },
]

function AddEntityPopover({
  anchorRef,
  position,
  onAdd,
  onClose,
}: {
  anchorRef?: React.RefObject<HTMLButtonElement | null>
  position?: { x: number; y: number }
  onAdd: (entity: SceneEntity) => void
  onClose: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverHeight = 320
  const pos = (() => {
    if (position) {
      const spaceBelow = window.innerHeight - position.y
      const top = spaceBelow < popoverHeight ? position.y - popoverHeight : position.y
      return { top: Math.max(4, top), left: Math.max(4, position.x) }
    }
    if (!anchorRef?.current) return { top: 0, left: 0 }
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

const EntityRow = memo(function EntityRow({
  entity,
  depth,
  isSelected,
  isHidden,
  isRenaming,
  renameValue,
  isCollapsed,
  hasChildren,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onToggleVisibility,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onToggleCollapse,
  onDragStart,
  onDragOver,
  onDrop,
  dropIndicator,
}: {
  entity: SceneEntity
  depth: number
  isSelected: boolean
  isHidden: boolean
  isRenaming: boolean
  renameValue: string
  isCollapsed: boolean
  hasChildren: boolean
  onSelect: (e?: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleVisibility: () => void
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onToggleCollapse: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  dropIndicator: 'above' | 'below' | 'inside' | null
}) {
  const indent = 10 + depth * 14
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={e => onSelect(e)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={{
        padding: `3px 8px 3px ${indent}px`,
        borderRadius: 4,
        margin: '0 4px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: isSelected ? COLORS.selected : 'transparent',
        borderLeft: isSelected ? `2px solid ${COLORS.accent}` : '2px solid transparent',
        color: isSelected ? COLORS.text : COLORS.textMuted,
        userSelect: 'none',
        fontSize: 12,
        position: 'relative',
        borderTop: dropIndicator === 'above' ? '2px solid #4488ff' : undefined,
        borderBottom: dropIndicator === 'below' ? '2px solid #4488ff' : undefined,
        outline: dropIndicator === 'inside' ? '1px solid #4488ff' : undefined,
      }}
      onMouseEnter={e => {
        if (!isSelected) e.currentTarget.style.background = COLORS.hover
      }}
      onMouseLeave={e => {
        if (!isSelected) e.currentTarget.style.background = 'transparent'
      }}
    >
      {/* Collapse toggle */}
      <span
        onClick={e => {
          e.stopPropagation()
          if (hasChildren) onToggleCollapse()
        }}
        style={{
          width: 12,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: hasChildren ? 'pointer' : 'default',
          color: COLORS.textDim,
        }}
      >
        {hasChildren && (
          <svg
            width={8}
            height={8}
            viewBox="0 0 8 8"
            fill="currentColor"
            style={{ transform: isCollapsed ? 'rotate(-90deg)' : undefined, transition: 'transform 0.1s' }}
          >
            <path d="M1 2l3 3 3-3z" />
          </svg>
        )}
      </span>
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onFocus={e => e.target.select()}
          onChange={e => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={e => {
            if (e.key === 'Enter') onRenameCommit()
            if (e.key === 'Escape') onRenameCancel()
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
              color: entity.prefab ? '#22c55e' : isHidden ? COLORS.textDim : isSelected ? COLORS.text : COLORS.textDim,
              display: 'flex',
              flexShrink: 0,
              opacity: isHidden ? 0.4 : 1,
            }}
          >
            {entity.prefab ? <IconPrefab /> : entityTypeIcon(entity.type)}
          </span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              opacity: isHidden ? 0.4 : 1,
            }}
          >
            {entity.name}
          </span>
          <button
            className="entity-vis-toggle"
            onClick={e => {
              e.stopPropagation()
              onToggleVisibility()
            }}
            title={isHidden ? 'Show' : 'Hide'}
            style={{
              background: 'none',
              border: 'none',
              color: isHidden ? COLORS.textDim : COLORS.textMuted,
              padding: '0 2px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              opacity: isHidden ? 1 : 0,
            }}
          >
            <svg
              width={12}
              height={12}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isHidden ? (
                <>
                  <path d="M2 2l12 12" />
                  <path d="M6.5 6.5a2 2 0 0 0 3 3" />
                  <path d="M3.5 5.5C2.5 6.5 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1 0 2-.3 2.8-.8" />
                  <path d="M10.5 10.5c1.5-1 2.5-2.5 4-2.5" />
                </>
              ) : (
                <>
                  <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
                  <circle cx="8" cy="8" r="2" />
                </>
              )}
            </svg>
          </button>
        </>
      )}
    </div>
  )
})

type LeftPanelTab = 'scenes' | 'prefabs'

export function LeftPanel({
  width,
  sceneList,
  activeScene,
  onSwitchScene,
  onCreateScene,
  onDeleteScene,
  onRenameScene,
  sceneData,
  selectedIds,
  onSelect,
  onAddEntity,
  onDeleteEntity,
  onRenameEntity,
  onDuplicateEntity,
  onCopyEntity,
  onPasteEntity,
  onMoveEntity,
  clipboard,
  hiddenEntities,
  onToggleVisibility,
  onEditPrefab,
  editingPrefab,
  prefabEntityId,
  prefabRefreshKey,
  onPrefabListChanged,
  prefabs,
}: {
  width: number
  sceneList: string[]
  activeScene: string
  onSwitchScene: (name: string) => void
  onCreateScene: (name: string) => void
  onDeleteScene: (name: string) => void
  onRenameScene: (oldName: string, newName: string) => void
  sceneData: SceneData | null
  selectedIds: string[]
  onSelect: (id: string, multiSelect?: boolean) => void
  onAddEntity: (entity: SceneEntity) => void
  onDeleteEntity: (id: string) => void
  onRenameEntity: (id: string, name: string) => void
  onDuplicateEntity: (id: string) => void
  onCopyEntity: (id: string) => void
  onPasteEntity: (parentId: string | null) => void
  onMoveEntity: (entityId: string, targetId: string | null, position: 'before' | 'after' | 'inside') => void
  clipboard: SceneEntity | null
  hiddenEntities: Set<string>
  onToggleVisibility: (id: string) => void
  onEditPrefab?: (name: string) => void
  editingPrefab?: string | null
  prefabEntityId?: string | null
  prefabRefreshKey?: number
  onPrefabListChanged?: () => void
  prefabs?: Record<string, PrefabData>
}) {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('scenes')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addMenuPos, setAddMenuPos] = useState<{ x: number; y: number } | null>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const prefabAddButtonRef = useRef<HTMLButtonElement>(null)
  const [prefabAddMenuOpen, setPrefabAddMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entityId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renamingScene, setRenamingScene] = useState(false)
  const [sceneRenameValue, setSceneRenameValue] = useState('')

  // Prefab list state
  const [prefabList, setPrefabList] = useState<string[]>([])
  const [prefabContextMenu, setPrefabContextMenu] = useState<{ x: number; y: number; name: string } | null>(null)
  const [renamingPrefab, setRenamingPrefab] = useState<string | null>(null)
  const [prefabRenameValue, setPrefabRenameValue] = useState('')
  const [collapsedEntities, setCollapsedEntities] = useState<Set<string>>(loadCollapsedEntities)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | 'inside' | null>(null)
  const dragSourceId = useRef<string | null>(null)

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedEntities(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveCollapsedEntities(next)
      return next
    })
  }, [])

  const loadPrefabs = useCallback(() => {
    fetchPrefabList().then(setPrefabList)
  }, [])

  useEffect(() => {
    loadPrefabs()
  }, [loadPrefabs])

  // Re-fetch prefab list when prefabRefreshKey changes (cross-panel sync)
  useEffect(() => {
    if (prefabRefreshKey != null && prefabRefreshKey > 0) loadPrefabs()
  }, [prefabRefreshKey, loadPrefabs])

  // Auto-switch tab when entering/exiting prefab editing
  useEffect(() => {
    if (editingPrefab) {
      setActiveTab('prefabs')
    } else {
      setActiveTab('scenes')
    }
  }, [editingPrefab])

  function renderEntityTree(entities: SceneEntity[], depth: number): React.ReactNode[] {
    const rows: React.ReactNode[] = []
    for (const entity of entities) {
      const hasChildren = !!(entity.children && entity.children.length > 0)
      const isCollapsed = collapsedEntities.has(entity.id)
      rows.push(
        <EntityRow
          key={entity.id}
          entity={entity}
          depth={depth}
          isSelected={selectedIds.includes(entity.id)}
          isHidden={hiddenEntities.has(entity.id)}
          isRenaming={renamingId === entity.id}
          renameValue={renamingId === entity.id ? renameValue : ''}
          isCollapsed={isCollapsed}
          hasChildren={hasChildren}
          onSelect={e => onSelect(entity.id, e?.ctrlKey || e?.metaKey)}
          onDoubleClick={() => {
            setRenamingId(entity.id)
            setRenameValue(entity.name)
          }}
          onContextMenu={e => {
            e.preventDefault()
            e.stopPropagation()
            onSelect(entity.id)
            setContextMenu({ x: e.clientX, y: e.clientY, entityId: entity.id })
          }}
          onToggleVisibility={() => onToggleVisibility(entity.id)}
          onRenameChange={setRenameValue}
          onRenameCommit={() => {
            if (renameValue.trim()) onRenameEntity(entity.id, renameValue.trim())
            setRenamingId(null)
          }}
          onRenameCancel={() => setRenamingId(null)}
          onToggleCollapse={() => toggleCollapsed(entity.id)}
          onDragStart={e => {
            dragSourceId.current = entity.id
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={e => {
            e.preventDefault()
            e.stopPropagation()
            if (dragSourceId.current === entity.id) return
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            const h = rect.height
            if (y < h * 0.25) {
              setDropPosition('above')
            } else if (y > h * 0.75) {
              setDropPosition('below')
            } else {
              setDropPosition('inside')
            }
            setDragOverId(entity.id)
          }}
          onDrop={e => {
            e.preventDefault()
            e.stopPropagation()
            const sourceId = dragSourceId.current
            if (sourceId && sourceId !== entity.id && dropPosition) {
              const mapped = dropPosition === 'above' ? 'before' : dropPosition === 'below' ? 'after' : 'inside'
              onMoveEntity(sourceId, entity.id, mapped)
            }
            dragSourceId.current = null
            setDragOverId(null)
            setDropPosition(null)
          }}
          dropIndicator={dragOverId === entity.id ? dropPosition : null}
        />,
      )
      if (hasChildren && !isCollapsed) {
        rows.push(...renderEntityTree(entity.children ?? [], depth + 1))
      }
    }
    return rows
  }

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
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        {(['scenes', 'prefabs'] as const).map(tab => {
          const disabled = tab === 'scenes' && !!editingPrefab
          return (
            <button
              key={tab}
              onClick={() => {
                if (!disabled) setActiveTab(tab)
              }}
              style={{
                flex: 1,
                padding: '6px 0',
                background: activeTab === tab ? COLORS.panel : COLORS.panelHeader,
                border: 'none',
                borderBottom:
                  activeTab === tab
                    ? `2px solid ${tab === 'prefabs' ? '#22c55e' : COLORS.accent}`
                    : '2px solid transparent',
                color: disabled ? COLORS.textDim : activeTab === tab ? COLORS.text : COLORS.textMuted,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'inherit',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => {
                if (!disabled && activeTab !== tab) e.currentTarget.style.color = COLORS.text
              }}
              onMouseLeave={e => {
                if (!disabled && activeTab !== tab) e.currentTarget.style.color = COLORS.textMuted
              }}
            >
              {tab === 'scenes' ? 'Scenes' : 'Prefabs'}
            </button>
          )
        })}
      </div>

      {activeTab === 'scenes' && (
        <>
          {/* Scene selector */}
          <div
            style={{
              height: 32,
              padding: '0 8px',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
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
            onContextMenu={e => {
              e.preventDefault()
              setAddMenuOpen(false)
              setAddMenuPos({ x: e.clientX, y: e.clientY })
            }}
            onDragOver={e => {
              e.preventDefault()
              // Only show root indicator if not over any entity row
              if (e.target === e.currentTarget) {
                setDragOverId('__root')
                setDropPosition('inside')
              }
            }}
            onDragLeave={() => {
              setDragOverId(null)
              setDropPosition(null)
            }}
            onDrop={e => {
              e.preventDefault()
              const sourceId = dragSourceId.current
              if (sourceId && dragOverId === '__root') {
                onMoveEntity(sourceId, null, 'inside')
              }
              dragSourceId.current = null
              setDragOverId(null)
              setDropPosition(null)
            }}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '4px 0',
              borderBottom: dragOverId === '__root' ? '2px solid #4488ff' : undefined,
            }}
          >
            {sceneData ? (
              renderEntityTree(sceneData.entities, 0)
            ) : (
              <div style={{ padding: 10, color: COLORS.textMuted, fontSize: 11 }}>Loading...</div>
            )}
          </div>

          {/* Add object button */}
          <div style={{ padding: '4px 6px', borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
            <button
              ref={addButtonRef}
              onClick={() => {
                setAddMenuPos(null)
                setAddMenuOpen(s => !s)
              }}
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

          {addMenuPos && (
            <AddEntityPopover position={addMenuPos} onAdd={onAddEntity} onClose={() => setAddMenuPos(null)} />
          )}
        </>
      )}

      {/* ── Prefabs tab ────────────────────────────────────────────────── */}
      {activeTab === 'prefabs' && (
        <>
          {editingPrefab ? (
            <>
              {/* Prefab selector dropdown */}
              <div
                style={{
                  padding: '6px 6px 2px',
                  borderBottom: `1px solid ${COLORS.border}`,
                  display: 'flex',
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                <select
                  value={editingPrefab}
                  onChange={e => {
                    if (onEditPrefab) onEditPrefab(e.target.value)
                  }}
                  style={{
                    ...INPUT_STYLE,
                    flex: 1,
                    fontSize: 12,
                    padding: '3px 4px',
                    borderColor: '#22c55e55',
                  }}
                >
                  {prefabList.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prefab entity hierarchy */}
              <div
                style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}
                onContextMenu={e => {
                  e.preventDefault()
                  setAddMenuPos({ x: e.clientX, y: e.clientY })
                }}
              >
                {(() => {
                  if (!sceneData || !prefabEntityId) return null
                  const prefabEntity = sceneData.entities.find(e => e.id === prefabEntityId)
                  if (!prefabEntity) return null
                  return renderEntityTree([prefabEntity], 0)
                })()}
              </div>

              {/* Add object button */}
              <div style={{ padding: '4px 6px', borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
                <button
                  ref={prefabAddButtonRef}
                  onClick={() => {
                    setAddMenuPos(null)
                    setPrefabAddMenuOpen(s => !s)
                  }}
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

              {prefabAddMenuOpen && (
                <AddEntityPopover
                  anchorRef={prefabAddButtonRef}
                  onAdd={onAddEntity}
                  onClose={() => setPrefabAddMenuOpen(false)}
                />
              )}

              {addMenuPos && (
                <AddEntityPopover position={addMenuPos} onAdd={onAddEntity} onClose={() => setAddMenuPos(null)} />
              )}
            </>
          ) : (
            <>
              {/* Prefab list */}
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
                {prefabList.length === 0 ? (
                  <div style={{ padding: 10, color: COLORS.textMuted, fontSize: 11 }}>
                    No prefabs yet. Click + to create one.
                  </div>
                ) : (
                  prefabList.map(name => (
                    <div
                      key={name}
                      onDoubleClick={() => {
                        if (onEditPrefab) onEditPrefab(name)
                      }}
                      onContextMenu={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        setPrefabContextMenu({ x: e.clientX, y: e.clientY, name })
                      }}
                      style={{
                        padding: '3px 8px 3px 10px',
                        borderRadius: 4,
                        margin: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        color: COLORS.textMuted,
                        userSelect: 'none',
                        fontSize: 12,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = COLORS.hover
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {renamingPrefab === name ? (
                        <input
                          autoFocus
                          value={prefabRenameValue}
                          onFocus={e => e.target.select()}
                          onChange={e => setPrefabRenameValue(e.target.value)}
                          onBlur={() => {
                            const v = prefabRenameValue.trim()
                            if (v && v !== name && /^[a-zA-Z0-9_-]+$/.test(v)) {
                              apiRenamePrefab(name, v).then(() => {
                                loadPrefabs()
                                onPrefabListChanged?.()
                              })
                            }
                            setRenamingPrefab(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const v = prefabRenameValue.trim()
                              if (v && v !== name && /^[a-zA-Z0-9_-]+$/.test(v)) {
                                apiRenamePrefab(name, v).then(() => {
                                  loadPrefabs()
                                  onPrefabListChanged?.()
                                })
                              }
                              setRenamingPrefab(null)
                            }
                            if (e.key === 'Escape') setRenamingPrefab(null)
                          }}
                          onClick={e => e.stopPropagation()}
                          style={{
                            ...INPUT_STYLE,
                            width: '100%',
                            fontSize: 12,
                            padding: '1px 4px',
                            borderColor: '#22c55e',
                            boxShadow: '0 0 0 1.5px #22c55e',
                          }}
                        />
                      ) : (
                        <>
                          <span style={{ color: '#22c55e', display: 'flex', flexShrink: 0 }}>
                            <IconPrefab />
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {name}
                          </span>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* New prefab button */}
              <div style={{ padding: '4px 6px', borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
                <button
                  onClick={() => {
                    const name = prompt('New prefab name (letters, numbers, - and _ only):')
                    if (name && /^[a-zA-Z0-9_-]+$/.test(name)) {
                      apiCreatePrefab(name).then(() => {
                        loadPrefabs()
                        onPrefabListChanged?.()
                      })
                    }
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = COLORS.active
                    e.currentTarget.style.color = '#22c55e'
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
                  New Prefab
                </button>
              </div>
            </>
          )}

          {/* Prefab context menu */}
          {prefabContextMenu && (
            <>
              <div
                onClick={() => setPrefabContextMenu(null)}
                onContextMenu={e => {
                  e.preventDefault()
                  setPrefabContextMenu(null)
                }}
                style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
              />
              <div
                style={{
                  position: 'fixed',
                  left: prefabContextMenu.x,
                  top: prefabContextMenu.y,
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  padding: '4px 0',
                  zIndex: 1001,
                  minWidth: 120,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                {!editingPrefab && (
                  <button
                    onClick={() => {
                      const name = prefabContextMenu.name
                      const prefabData = prefabs?.[name]
                      if (prefabData) {
                        const entity: SceneEntity = {
                          ...structuredClone(prefabData.entity),
                          id: generateId(),
                          name: `${prefabData.entity.name} (${name})`,
                          prefab: name,
                          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                        }
                        onAddEntity(entity)
                      }
                      setPrefabContextMenu(null)
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
                    Add to Scene
                  </button>
                )}
                {onEditPrefab && (
                  <button
                    onClick={() => {
                      onEditPrefab(prefabContextMenu.name)
                      setPrefabContextMenu(null)
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
                    Edit
                  </button>
                )}
                {editingPrefab !== prefabContextMenu.name && (
                  <button
                    onClick={() => {
                      setRenamingPrefab(prefabContextMenu.name)
                      setPrefabRenameValue(prefabContextMenu.name)
                      setPrefabContextMenu(null)
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
                )}
                {editingPrefab !== prefabContextMenu.name && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete prefab "${prefabContextMenu.name}"?`)) {
                        apiDeletePrefab(prefabContextMenu.name).then(() => {
                          loadPrefabs()
                          onPrefabListChanged?.()
                        })
                      }
                      setPrefabContextMenu(null)
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
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Entity context menu (shared between scenes and prefab editing) ── */}
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
              minWidth: 140,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {[
              {
                label: 'Rename',
                action: () => {
                  const found = sceneData ? findEntityInTree(sceneData.entities, contextMenu.entityId) : null
                  if (found) {
                    setRenamingId(found.entity.id)
                    setRenameValue(found.entity.name)
                  }
                },
              },
              {
                label: 'Duplicate',
                shortcut: `${MOD_KEY}+D`,
                action: () => onDuplicateEntity(contextMenu.entityId),
              },
              {
                label: 'Copy',
                shortcut: `${MOD_KEY}+C`,
                action: () => onCopyEntity(contextMenu.entityId),
              },
              ...(clipboard
                ? [
                    {
                      label: 'Paste as Child',
                      shortcut: `${MOD_KEY}+V`,
                      action: () => onPasteEntity(contextMenu.entityId),
                    },
                  ]
                : []),
              ...(() => {
                if (!sceneData) return []
                const isRoot = sceneData.entities.some(e => e.id === contextMenu.entityId)
                if (isRoot) return []
                return [
                  {
                    label: 'Unparent (Move to Root)',
                    action: () => onMoveEntity(contextMenu.entityId, null, 'inside'),
                  },
                ]
              })(),
            ].map(item => (
              <button
                key={item.label}
                onClick={() => {
                  item.action()
                  setContextMenu(null)
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = COLORS.hover
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '5px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: COLORS.text,
                  fontSize: 11,
                  textAlign: 'left',
                }}
              >
                <span>{item.label}</span>
                {'shortcut' in item && (
                  <span style={{ color: COLORS.textDim, fontSize: 10 }}>{(item as { shortcut: string }).shortcut}</span>
                )}
              </button>
            ))}
            <div style={{ height: 1, background: COLORS.border, margin: '4px 0' }} />
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
