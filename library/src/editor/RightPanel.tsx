import { useCallback, useEffect, useRef, useState } from 'react'

import { COLORS, INPUT_STYLE } from './colors.ts'
import { IconClose } from './icons.tsx'
import { CheckboxInput, ColorInput, NumberInput, SectionLabel, SelectInput, TextInput, Vec3Input } from './widgets.tsx'

import type { MaterialData, MeshData, SceneEntity } from '../scene-data.ts'
import type { ManaScript } from '../script.ts'

const TEXTURE_MAP_FIELDS: { label: string; key: keyof MaterialData }[] = [
  { label: 'Albedo Map', key: 'map' },
  { label: 'Normal Map', key: 'normalMap' },
  { label: 'Roughness Map', key: 'roughnessMap' },
  { label: 'Metalness Map', key: 'metalnessMap' },
  { label: 'Emissive Map', key: 'emissiveMap' },
]

const LS_KEY = 'mana:inspectorCollapsed'

function loadCollapsed(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveCollapsed(data: Record<string, string[]>) {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

/** Remove entries for entities/sections that no longer exist. */
function cleanupCollapsed(entityIds: Set<string>) {
  const data = loadCollapsed()
  let changed = false
  for (const key of Object.keys(data)) {
    if (!entityIds.has(key)) {
      delete data[key]
      changed = true
    }
  }
  if (changed) saveCollapsed(data)
}

function useCollapsedSections(entityId: string | null) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (!entityId) return new Set()
    const data = loadCollapsed()
    return new Set(data[entityId] ?? [])
  })

  useEffect(() => {
    if (!entityId) return
    const data = loadCollapsed()
    setCollapsed(new Set(data[entityId] ?? []))
  }, [entityId])

  const toggle = useCallback(
    (section: string) => {
      if (!entityId) return
      setCollapsed(prev => {
        const next = new Set(prev)
        if (next.has(section)) next.delete(section)
        else next.add(section)
        const data = loadCollapsed()
        data[entityId] = [...next]
        if (next.size === 0) delete data[entityId]
        saveCollapsed(data)
        return next
      })
    },
    [entityId],
  )

  const setAll = useCallback(
    (isCollapsed: boolean, sections: string[]) => {
      if (!entityId) return
      setCollapsed(() => {
        const next = isCollapsed ? new Set(sections) : new Set<string>()
        const data = loadCollapsed()
        if (next.size === 0) delete data[entityId]
        else data[entityId] = [...next]
        saveCollapsed(data)
        return next
      })
    },
    [entityId],
  )

  const removeSection = useCallback(
    (section: string) => {
      if (!entityId) return
      setCollapsed(prev => {
        const next = new Set(prev)
        next.delete(section)
        const data = loadCollapsed()
        if (next.size === 0) delete data[entityId]
        else data[entityId] = [...next]
        saveCollapsed(data)
        return next
      })
    },
    [entityId],
  )

  return { collapsed, toggle, setAll, removeSection }
}

function entityTypeLabel(type: SceneEntity['type']): string {
  switch (type) {
    case 'camera':
      return 'Camera'
    case 'mesh':
      return 'Mesh'
    case 'model':
      return 'Model'
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

function MaterialEditor({ material, onChange }: { material: MaterialData; onChange: (mat: MaterialData) => void }) {
  return (
    <>
      <ColorInput
        label="Color"
        value={material.color ?? '#888888'}
        onChange={v => onChange({ ...material, color: v })}
      />
      <NumberInput
        label="Roughness"
        value={material.roughness ?? 1}
        step={0.05}
        onChange={v => onChange({ ...material, roughness: v })}
      />
      <NumberInput
        label="Metalness"
        value={material.metalness ?? 0}
        step={0.05}
        onChange={v => onChange({ ...material, metalness: v })}
      />
      <ColorInput
        label="Emissive"
        value={material.emissive ?? '#000000'}
        onChange={v => onChange({ ...material, emissive: v })}
      />
      {TEXTURE_MAP_FIELDS.map(({ label, key }) => (
        <TextInput
          key={key}
          label={label}
          value={(material[key] as string) ?? ''}
          onChange={v => onChange({ ...material, [key]: v || undefined })}
        />
      ))}
    </>
  )
}

function AddComponentPopover({
  anchorRef,
  position,
  options,
  onClose,
}: {
  anchorRef?: React.RefObject<HTMLButtonElement | null>
  position?: { x: number; y: number }
  options: { label: string; action: () => void }[]
  onClose: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverHeight = 250
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
    return { top: Math.max(4, top), left: rect.left }
  })()

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
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
        maxHeight: 250,
        overflow: 'auto',
      }}
    >
      {options.map(opt => (
        <button
          key={opt.label}
          onClick={() => {
            opt.action()
            onClose()
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
            padding: '5px 10px',
            background: 'transparent',
            border: 'none',
            color: COLORS.text,
            fontSize: 11,
            textAlign: 'left',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function getAddComponentOptions(
  entity: SceneEntity,
  availableScripts: string[],
  onUpdate: (entity: SceneEntity) => void,
): { label: string; action: () => void }[] {
  const options: { label: string; action: () => void }[] = []

  if (!entity.mesh && entity.type === 'mesh') {
    options.push({
      label: 'Mesh',
      action: () => onUpdate({ ...entity, mesh: { geometry: 'box', material: { color: '#4488ff' } } }),
    })
  }
  if (entity.type === 'model' && entity.model && !entity.model.material) {
    options.push({
      label: 'Material Override',
      action: () => {
        const model = entity.model
        if (model) onUpdate({ ...entity, model: { ...model, material: { color: '#888888' } } })
      },
    })
  }
  if (!entity.rigidBody) {
    options.push({
      label: 'Rigid Body',
      action: () => onUpdate({ ...entity, rigidBody: { type: 'dynamic' } }),
    })
  }
  if (!entity.collider) {
    const meshGeo = entity.mesh?.geometry
    const colliderForGeo = (): import('../scene-data.ts').ColliderData => {
      switch (meshGeo) {
        case 'sphere':
          return { shape: 'sphere', radius: 0.5 }
        case 'capsule':
          return { shape: 'capsule', radius: 0.5, halfHeight: 0.5 }
        case 'cylinder':
          return { shape: 'cylinder', radius: 0.5, halfHeight: 0.5 }
        case 'plane':
          return { shape: 'plane', halfExtents: [5, 0.01, 5] }
        default:
          return { shape: 'box', halfExtents: [0.5, 0.5, 0.5] }
      }
    }
    options.push({
      label: 'Collider',
      action: () => onUpdate({ ...entity, collider: colliderForGeo() }),
    })
  }

  const attachedScripts = entity.scripts ?? []
  const attachedNames = attachedScripts.map(sc => sc.name)
  for (const name of availableScripts) {
    if (!attachedNames.includes(name)) {
      options.push({
        label: `Script: ${name}`,
        action: () => onUpdate({ ...entity, scripts: [...attachedScripts, { name }] }),
      })
    }
  }

  return options
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
  const buttonRef = useRef<HTMLButtonElement>(null)

  const options = getAddComponentOptions(entity, availableScripts, onUpdate)

  if (options.length === 0) return null

  return (
    <div style={{ marginTop: 12 }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(s => !s)}
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
          padding: '5px 0',
          background: COLORS.hover,
          border: 'none',
          borderRadius: 4,
          color: COLORS.textMuted,
          fontSize: 11,
        }}
      >
        + Add Component
      </button>
      {open && <AddComponentPopover anchorRef={buttonRef} options={options} onClose={() => setOpen(false)} />}
    </div>
  )
}

function InspectorName({ entity, onRename }: { entity: SceneEntity; onRename: (id: string, name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(entity.name)

  useEffect(() => {
    setValue(entity.name)
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on entity switch
  }, [entity.id])

  return editing ? (
    <input
      autoFocus
      value={value}
      onFocus={e => e.target.select()}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim()) onRename(entity.id, value.trim())
        setEditing(false)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          if (value.trim()) onRename(entity.id, value.trim())
          setEditing(false)
        }
        if (e.key === 'Escape') setEditing(false)
      }}
      style={{
        ...INPUT_STYLE,
        width: '100%',
        fontWeight: 600,
        fontSize: 12,
        borderColor: COLORS.accent,
        boxShadow: COLORS.focusRing,
      }}
    />
  ) : (
    <div
      onDoubleClick={() => setEditing(true)}
      style={{
        color: COLORS.text,
        fontWeight: 600,
        fontSize: 12,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {entity.name}
    </div>
  )
}

export function RightPanel({
  width,
  entity,
  onUpdate,
  onRename,
  availableScripts,
  availableUiComponents,
  scriptDefs,
  allEntityIds,
}: {
  width: number
  entity: SceneEntity | null
  onUpdate: (entity: SceneEntity) => void
  onRename: (id: string, name: string) => void
  availableScripts: string[]
  availableUiComponents: string[]
  scriptDefs: Record<string, ManaScript>
  allEntityIds: Set<string>
}) {
  const [addComponentPos, setAddComponentPos] = useState<{ x: number; y: number } | null>(null)
  const { collapsed, toggle, setAll, removeSection } = useCollapsedSections(entity?.id ?? null)

  // Cleanup stale localStorage entries when entity list changes
  useEffect(() => {
    cleanupCollapsed(allEntityIds)
  }, [allEntityIds])

  // Collect active section names for this entity
  const activeSections: string[] = []
  if (entity) {
    if (entity.transform) activeSections.push('transform')
    if (entity.camera) activeSections.push('camera')
    if (entity.mesh) activeSections.push('mesh')
    if (entity.model) activeSections.push('model')
    if (entity.model?.material) activeSections.push('materialOverride')
    if (entity.ui) activeSections.push('ui')
    if (entity.scripts && entity.scripts.length > 0) activeSections.push('scripts')
    if (entity.rigidBody) activeSections.push('rigidBody')
    if (entity.collider) activeSections.push('collider')
    if (entity.light) activeSections.push('light')
  }

  const allCollapsed = activeSections.length > 0 && activeSections.every(s => collapsed.has(s))

  const s = (section: string) => ({
    collapsed: collapsed.has(section),
    onToggle: () => toggle(section),
  })

  return (
    <div
      style={{
        width,
        background: COLORS.panel,
        borderLeft: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header: name + type + collapse toggle */}
      {entity && (
        <div
          style={{
            height: 32,
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <InspectorName entity={entity} onRename={onRename} />
          </div>
          <span style={{ color: COLORS.textDim, fontSize: 10, flexShrink: 0 }}>{entityTypeLabel(entity.type)}</span>
          {activeSections.length > 0 && (
            <button
              onClick={() => setAll(!allCollapsed, activeSections)}
              title={allCollapsed ? 'Expand all' : 'Collapse all'}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.textDim,
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = COLORS.text
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = COLORS.textDim
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
                {allCollapsed ? (
                  <>
                    <path d="M4 4l4 4 4-4" />
                    <path d="M4 9l4 4 4-4" />
                  </>
                ) : (
                  <>
                    <path d="M4 7l4-4 4 4" />
                    <path d="M4 12l4-4 4 4" />
                  </>
                )}
              </svg>
            </button>
          )}
        </div>
      )}
      <div
        onContextMenu={e => {
          if (!entity || entity.type === 'ui') return
          if ((e.target as HTMLElement).closest('input, select, button')) return
          const options = getAddComponentOptions(entity, availableScripts, onUpdate)
          if (options.length === 0) return
          e.preventDefault()
          setAddComponentPos({ x: e.clientX, y: e.clientY })
        }}
        style={{
          padding: '0 10px 8px',
          fontSize: 12,
          color: COLORS.textMuted,
          flex: 1,
          overflow: 'auto',
        }}
      >
        {entity ? (
          <>
            {/* Transform */}
            {entity.transform && (
              <>
                <SectionLabel {...s('transform')}>Transform</SectionLabel>
                {!collapsed.has('transform') && (
                  <>
                    {entity.transform.position && (
                      <Vec3Input
                        label="Position"
                        value={entity.transform.position}
                        onChange={v => onUpdate({ ...entity, transform: { ...entity.transform, position: v } })}
                      />
                    )}
                    {entity.transform.rotation && (
                      <Vec3Input
                        label="Rotation"
                        value={entity.transform.rotation}
                        onChange={v => onUpdate({ ...entity, transform: { ...entity.transform, rotation: v } })}
                      />
                    )}
                    {entity.transform.scale && (
                      <Vec3Input
                        label="Scale"
                        value={entity.transform.scale}
                        onChange={v => onUpdate({ ...entity, transform: { ...entity.transform, scale: v } })}
                      />
                    )}
                  </>
                )}
              </>
            )}

            {/* Camera */}
            {entity.camera && (
              <>
                <SectionLabel {...s('camera')}>Camera</SectionLabel>
                {!collapsed.has('camera') && (
                  <>
                    <NumberInput
                      label="FOV"
                      value={entity.camera.fov ?? 50}
                      step={1}
                      onChange={v => onUpdate({ ...entity, camera: { ...entity.camera, fov: v } })}
                    />
                    <NumberInput
                      label="Near"
                      value={entity.camera.near ?? 0.1}
                      step={0.01}
                      onChange={v => onUpdate({ ...entity, camera: { ...entity.camera, near: v } })}
                    />
                    <NumberInput
                      label="Far"
                      value={entity.camera.far ?? 100}
                      step={1}
                      onChange={v => onUpdate({ ...entity, camera: { ...entity.camera, far: v } })}
                    />
                  </>
                )}
              </>
            )}

            {/* Mesh (includes material + shadows) */}
            {entity.mesh && (
              <>
                <SectionLabel {...s('mesh')} onRemove={() => onUpdate({ ...entity, mesh: undefined })}>
                  Mesh
                </SectionLabel>
                {!collapsed.has('mesh') && (
                  <>
                    <SelectInput
                      label="Geometry"
                      value={entity.mesh.geometry ?? 'box'}
                      options={['box', 'sphere', 'plane', 'cylinder', 'capsule']}
                      onChange={v =>
                        onUpdate({ ...entity, mesh: { ...entity.mesh, geometry: v as MeshData['geometry'] } })
                      }
                    />
                    <div
                      style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: 500, marginTop: 6, marginBottom: 4 }}
                    >
                      Material
                    </div>
                    <MaterialEditor
                      material={entity.mesh.material ?? { color: '#4488ff' }}
                      onChange={mat => onUpdate({ ...entity, mesh: { ...entity.mesh, material: mat } })}
                    />
                    <CheckboxInput
                      label="Cast Shadow"
                      value={entity.castShadow ?? false}
                      onChange={v => onUpdate({ ...entity, castShadow: v })}
                    />
                    <CheckboxInput
                      label="Receive Shadow"
                      value={entity.receiveShadow ?? false}
                      onChange={v => onUpdate({ ...entity, receiveShadow: v })}
                    />
                  </>
                )}
              </>
            )}

            {/* Model (includes shadows) */}
            {entity.model && (
              <>
                <SectionLabel {...s('model')}>Model</SectionLabel>
                {!collapsed.has('model') && (
                  <>
                    <TextInput
                      label="Source"
                      value={entity.model.src ?? ''}
                      onChange={v => onUpdate({ ...entity, model: { ...entity.model, src: v } })}
                    />
                    <CheckboxInput
                      label="Cast Shadow"
                      value={entity.castShadow ?? false}
                      onChange={v => onUpdate({ ...entity, castShadow: v })}
                    />
                    <CheckboxInput
                      label="Receive Shadow"
                      value={entity.receiveShadow ?? false}
                      onChange={v => onUpdate({ ...entity, receiveShadow: v })}
                    />
                  </>
                )}
              </>
            )}

            {/* Material Override (model only) */}
            {entity.model?.material && (
              <>
                <SectionLabel
                  {...s('materialOverride')}
                  onRemove={() => {
                    const model = entity.model
                    if (model) {
                      const { material: _, ...rest } = model
                      onUpdate({ ...entity, model: rest as typeof model })
                      removeSection('materialOverride')
                    }
                  }}
                >
                  Material Override
                </SectionLabel>
                {!collapsed.has('materialOverride') && entity.model?.material && (
                  <MaterialEditor
                    material={entity.model.material}
                    onChange={mat => {
                      const model = entity.model
                      if (model) onUpdate({ ...entity, model: { ...model, material: mat } })
                    }}
                  />
                )}
              </>
            )}

            {/* UI */}
            {entity.ui && (
              <>
                <SectionLabel {...s('ui')}>UI</SectionLabel>
                {!collapsed.has('ui') && (
                  <SelectInput
                    label="Component"
                    value={entity.ui.component}
                    options={availableUiComponents}
                    onChange={v => onUpdate({ ...entity, ui: { ...entity.ui, component: v } })}
                  />
                )}
              </>
            )}

            {/* Scripts */}
            {entity.scripts && entity.scripts.length > 0 && (
              <>
                <SectionLabel {...s('scripts')}>Scripts</SectionLabel>
                {!collapsed.has('scripts') &&
                  entity.scripts.map(entry => {
                    const def = scriptDefs[entry.name]
                    return (
                      <div key={entry.name} style={{ marginBottom: 6 }}>
                        <div
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
                          {entry.name}
                          <button
                            onClick={() =>
                              onUpdate({ ...entity, scripts: entity.scripts?.filter(x => x.name !== entry.name) })
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              color: COLORS.textDim,
                              padding: '0 2px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title="Remove script"
                          >
                            <IconClose />
                          </button>
                        </div>
                        {def?.params &&
                          Object.entries(def.params).map(([key, paramDef]) => {
                            const value = entry.params?.[key] ?? paramDef.default
                            if (paramDef.type === 'number') {
                              return (
                                <NumberInput
                                  key={key}
                                  label={key}
                                  value={value as number}
                                  step={0.1}
                                  onChange={v =>
                                    onUpdate({
                                      ...entity,
                                      scripts: entity.scripts?.map(sc =>
                                        sc.name === entry.name ? { ...sc, params: { ...sc.params, [key]: v } } : sc,
                                      ),
                                    })
                                  }
                                />
                              )
                            }
                            if (paramDef.type === 'boolean') {
                              return (
                                <CheckboxInput
                                  key={key}
                                  label={key}
                                  value={value as boolean}
                                  onChange={v =>
                                    onUpdate({
                                      ...entity,
                                      scripts: entity.scripts?.map(sc =>
                                        sc.name === entry.name ? { ...sc, params: { ...sc.params, [key]: v } } : sc,
                                      ),
                                    })
                                  }
                                />
                              )
                            }
                            return (
                              <div
                                key={key}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 4,
                                }}
                              >
                                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{key}</span>
                                <input
                                  type="text"
                                  value={value as string}
                                  onChange={e =>
                                    onUpdate({
                                      ...entity,
                                      scripts: entity.scripts?.map(sc =>
                                        sc.name === entry.name
                                          ? { ...sc, params: { ...sc.params, [key]: e.target.value } }
                                          : sc,
                                      ),
                                    })
                                  }
                                  style={{ ...INPUT_STYLE, width: 80 }}
                                />
                              </div>
                            )
                          })}
                      </div>
                    )
                  })}
              </>
            )}

            {/* Rigid Body */}
            {entity.rigidBody && (
              <>
                <SectionLabel {...s('rigidBody')} onRemove={() => onUpdate({ ...entity, rigidBody: undefined })}>
                  Rigid Body
                </SectionLabel>
                {!collapsed.has('rigidBody') && (
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
                )}
              </>
            )}

            {/* Collider */}
            {entity.collider && (
              <>
                <SectionLabel {...s('collider')} onRemove={() => onUpdate({ ...entity, collider: undefined })}>
                  Collider
                </SectionLabel>
                {!collapsed.has('collider') && (
                  <>
                    <SelectInput
                      label="Shape"
                      value={entity.collider.shape}
                      options={['box', 'sphere', 'capsule', 'cylinder', 'plane']}
                      onChange={v =>
                        onUpdate({
                          ...entity,
                          collider: {
                            ...entity.collider,
                            shape: v as 'box' | 'sphere' | 'capsule' | 'cylinder' | 'plane',
                          },
                        })
                      }
                    />
                    {(entity.collider.shape === 'box' ||
                      entity.collider.shape === 'plane' ||
                      !entity.collider.shape) && (
                      <Vec3Input
                        label="Half Extents"
                        value={entity.collider.halfExtents ?? [0.5, 0.5, 0.5]}
                        onChange={v => {
                          const shape = entity.collider?.shape ?? 'box'
                          onUpdate({ ...entity, collider: { shape, ...entity.collider, halfExtents: v } })
                        }}
                      />
                    )}
                    {entity.collider.shape !== 'box' && entity.collider.shape !== 'plane' && (
                      <NumberInput
                        label="Radius"
                        value={entity.collider.radius ?? 0.5}
                        step={0.1}
                        onChange={v => {
                          const shape = entity.collider?.shape ?? 'box'
                          onUpdate({ ...entity, collider: { shape, ...entity.collider, radius: v } })
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
                          onUpdate({ ...entity, collider: { shape, ...entity.collider, halfHeight: v } })
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}

            {/* Light */}
            {entity.light && (
              <>
                <SectionLabel {...s('light')}>Light</SectionLabel>
                {!collapsed.has('light') && (
                  <>
                    <ColorInput
                      label="Color"
                      value={entity.light.color ?? '#ffffff'}
                      onChange={v => onUpdate({ ...entity, light: { ...entity.light, color: v } })}
                    />
                    <NumberInput
                      label="Intensity"
                      value={entity.light.intensity ?? 1}
                      step={0.1}
                      onChange={v => onUpdate({ ...entity, light: { ...entity.light, intensity: v } })}
                    />
                    {(entity.type === 'directional-light' || entity.type === 'point-light') && (
                      <CheckboxInput
                        label="Cast Shadow"
                        value={entity.light.castShadow ?? false}
                        onChange={v => onUpdate({ ...entity, light: { ...entity.light, castShadow: v } })}
                      />
                    )}
                  </>
                )}
              </>
            )}

            {entity.type !== 'ui' && (
              <AddComponentButton entity={entity} availableScripts={availableScripts} onUpdate={onUpdate} />
            )}
          </>
        ) : (
          <div
            style={{
              color: COLORS.textDim,
              fontSize: 11,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            No entity selected
          </div>
        )}
      </div>
      {addComponentPos &&
        entity &&
        entity.type !== 'ui' &&
        (() => {
          const options = getAddComponentOptions(entity, availableScripts, onUpdate)
          if (options.length === 0) return null
          return (
            <AddComponentPopover
              position={addComponentPos}
              options={options}
              onClose={() => setAddComponentPos(null)}
            />
          )
        })()}
    </div>
  )
}
