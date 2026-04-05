import { useCallback, useEffect, useRef, useState } from 'react'

import { COLORS, INPUT_STYLE } from './colors.ts'
import { IconClose } from './icons.tsx'
import { Popover, PopoverItem } from './Popover.tsx'
import { CheckboxInput, ColorInput, NumberInput, SectionLabel, SelectInput, TextInput, Vec3Input } from './widgets.tsx'

import type { MaterialData, MeshData, SceneData, SceneEntity } from '../scene-data.ts'
import type { ManaScript } from '../script.ts'

function AdapterBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 8,
        fontWeight: 600,
        color: '#6b7280',
        background: '#374151',
        padding: '1px 4px',
        borderRadius: 3,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginLeft: 4,
        verticalAlign: 'middle',
      }}
    >
      {label}
    </span>
  )
}

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
    case 'ui-group':
      return 'UI Group'
    case 'audio':
      return 'Audio'
    case 'particles':
      return 'Particles'
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
      <TextInput
        label="Albedo Map"
        value={material.map ?? ''}
        onChange={v => onChange({ ...material, map: v || undefined })}
      />
      <TextInput
        label="Emissive Map"
        value={material.emissiveMap ?? ''}
        onChange={v => onChange({ ...material, emissiveMap: v || undefined })}
      />
      <ColorInput
        label="Emissive"
        value={material.emissiveColor ?? '#000000'}
        onChange={v => onChange({ ...material, emissiveColor: v === '#000000' ? undefined : v })}
      />
      <div
        style={{
          color: '#6b7280',
          fontSize: 9,
          fontWeight: 600,
          marginTop: 6,
          marginBottom: 2,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        PBR
        <AdapterBadge label="Three.js" />
      </div>
      <NumberInput
        label="Metalness"
        value={material.metalness ?? 0}
        step={0.05}
        onChange={v => onChange({ ...material, metalness: v })}
      />
      <NumberInput
        label="Roughness"
        value={material.roughness ?? 0.5}
        step={0.05}
        onChange={v => onChange({ ...material, roughness: v })}
      />
      <TextInput
        label="Normal Map"
        value={material.normalMap ?? ''}
        onChange={v => onChange({ ...material, normalMap: v || undefined })}
      />
      <TextInput
        label="Roughness Map"
        value={material.roughnessMap ?? ''}
        onChange={v => onChange({ ...material, roughnessMap: v || undefined })}
      />
      <TextInput
        label="Metalness Map"
        value={material.metalnessMap ?? ''}
        onChange={v => onChange({ ...material, metalnessMap: v || undefined })}
      />
    </>
  )
}

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [newTag, setNewTag] = useState('')

  return (
    <div style={{ padding: '2px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        {tags.map(tag => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              background: COLORS.hover,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '1px 5px',
              fontSize: 10,
              color: COLORS.text,
            }}
          >
            {tag}
            <button
              onClick={() => onChange(tags.filter(t => t !== tag))}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.textDim,
                padding: '0 1px',
                fontSize: 10,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <IconClose />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        placeholder="Add tag..."
        value={newTag}
        onChange={e => setNewTag(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && newTag.trim()) {
            const trimmed = newTag.trim()
            if (!tags.includes(trimmed)) {
              onChange([...tags, trimmed])
            }
            setNewTag('')
          }
        }}
        style={{ ...INPUT_STYLE, width: '100%', fontSize: 10 }}
      />
    </div>
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
  return (
    <Popover anchorRef={anchorRef} position={position} onClose={onClose} maxHeight={250}>
      {options.map(opt => (
        <PopoverItem
          key={opt.label}
          label={opt.label}
          onClick={() => {
            opt.action()
            onClose()
          }}
        />
      ))}
    </Popover>
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
        default:
          return { shape: 'box', halfExtents: [0.5, 0.5, 0.5] }
      }
    }
    options.push({
      label: 'Collider',
      action: () => onUpdate({ ...entity, collider: colliderForGeo() }),
    })
  }

  if (!entity.audio) {
    options.push({
      label: 'Audio',
      action: () => onUpdate({ ...entity, audio: { src: '', volume: 1, loop: false } }),
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

function SceneSettingsEditor({
  sceneData,
  onSceneUpdate,
}: {
  sceneData: SceneData
  onSceneUpdate: (data: Partial<SceneData>) => void
}) {
  const skybox = sceneData.skybox ?? {}
  const pp = sceneData.postProcessing ?? {}

  return (
    <>
      <SectionLabel collapsed={false} onToggle={() => {}}>
        Background
      </SectionLabel>
      <ColorInput
        label="Color"
        value={sceneData.background ?? '#111111'}
        onChange={v => onSceneUpdate({ background: v })}
      />

      <SectionLabel collapsed={false} onToggle={() => {}}>
        Skybox / Environment
        <AdapterBadge label="Three.js" />
      </SectionLabel>
      <TextInput
        label="HDR Source"
        value={skybox.source ?? ''}
        onChange={v => onSceneUpdate({ skybox: { ...skybox, source: v || undefined } })}
      />
      <NumberInput
        label="Intensity"
        value={skybox.intensity ?? 1}
        step={0.1}
        onChange={v => onSceneUpdate({ skybox: { ...skybox, intensity: v } })}
      />
      <CheckboxInput
        label="Show Background"
        value={skybox.showBackground !== false}
        onChange={v => onSceneUpdate({ skybox: { ...skybox, showBackground: v } })}
      />
      <NumberInput
        label="BG Blur"
        value={skybox.backgroundBlur ?? 0}
        step={0.05}
        onChange={v => onSceneUpdate({ skybox: { ...skybox, backgroundBlur: v } })}
      />

      <SectionLabel collapsed={false} onToggle={() => {}}>
        Post-Processing
        <AdapterBadge label="Three.js" />
      </SectionLabel>
      <CheckboxInput
        label="Bloom"
        value={pp.bloom ?? false}
        onChange={v => onSceneUpdate({ postProcessing: { ...pp, bloom: v } })}
      />
      {pp.bloom && (
        <>
          <NumberInput
            label="Intensity"
            value={pp.bloomIntensity ?? 0.5}
            step={0.05}
            onChange={v => onSceneUpdate({ postProcessing: { ...pp, bloomIntensity: v } })}
          />
          <NumberInput
            label="Threshold"
            value={pp.bloomThreshold ?? 0.8}
            step={0.05}
            onChange={v => onSceneUpdate({ postProcessing: { ...pp, bloomThreshold: v } })}
          />
          <NumberInput
            label="Radius"
            value={pp.bloomRadius ?? 0.4}
            step={0.05}
            onChange={v => onSceneUpdate({ postProcessing: { ...pp, bloomRadius: v } })}
          />
        </>
      )}
    </>
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
  sceneData,
  onSceneUpdate,
}: {
  width: number
  entity: SceneEntity | null
  onUpdate: (entity: SceneEntity) => void
  onRename: (id: string, name: string) => void
  availableScripts: string[]
  availableUiComponents: string[]
  scriptDefs: Record<string, ManaScript>
  allEntityIds: Set<string>
  sceneData?: SceneData | null
  onSceneUpdate?: (data: Partial<SceneData>) => void
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
    activeSections.push('tags')
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
    if (entity.particles) activeSections.push('particles')
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
          <span style={{ color: entity.prefab ? '#22c55e' : COLORS.textDim, fontSize: 10, flexShrink: 0 }}>
            {entity.prefab ? `Prefab: ${entity.prefab}` : entityTypeLabel(entity.type)}
          </span>
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

            {/* Tags */}
            <SectionLabel {...s('tags')}>Tags</SectionLabel>
            {!collapsed.has('tags') && (
              <TagsEditor
                tags={entity.tags ?? []}
                onChange={tags => onUpdate({ ...entity, tags: tags.length > 0 ? tags : undefined })}
              />
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
                      options={['box', 'sphere', 'plane', 'capsule']}
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

            {/* Audio */}
            {entity.audio && (
              <>
                <SectionLabel {...s('audio')}>Audio</SectionLabel>
                {!collapsed.has('audio') && (
                  <>
                    <TextInput
                      label="Source"
                      value={entity.audio.src ?? ''}
                      onChange={v =>
                        onUpdate({
                          ...entity,
                          audio: { src: v, volume: entity.audio?.volume, loop: entity.audio?.loop },
                        })
                      }
                    />
                    <NumberInput
                      label="Volume"
                      value={entity.audio.volume ?? 1}
                      step={0.05}
                      onChange={v =>
                        onUpdate({
                          ...entity,
                          audio: { src: entity.audio?.src ?? '', volume: v, loop: entity.audio?.loop },
                        })
                      }
                    />
                    <CheckboxInput
                      label="Loop"
                      value={entity.audio.loop ?? false}
                      onChange={v =>
                        onUpdate({
                          ...entity,
                          audio: { src: entity.audio?.src ?? '', volume: entity.audio?.volume, loop: v },
                        })
                      }
                    />
                  </>
                )}
              </>
            )}

            {/* Particles */}
            {entity.particles && (
              <>
                <SectionLabel {...s('particles')}>Particles</SectionLabel>
                {!collapsed.has('particles') && (
                  <>
                    <NumberInput
                      label="Max Particles"
                      value={entity.particles.maxParticles ?? 100}
                      step={10}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, maxParticles: v } })}
                    />
                    <NumberInput
                      label="Rate"
                      value={entity.particles.rate ?? 10}
                      step={1}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, rate: v } })}
                    />
                    <NumberInput
                      label="Lifetime"
                      value={entity.particles.lifetime ?? 2}
                      step={0.1}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, lifetime: v } })}
                    />
                    <NumberInput
                      label="Speed"
                      value={entity.particles.speed ?? 1}
                      step={0.1}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, speed: v } })}
                    />
                    <NumberInput
                      label="Spread"
                      value={entity.particles.spread ?? 15}
                      step={5}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, spread: v } })}
                    />
                    <NumberInput
                      label="Start Size"
                      value={entity.particles.startSize ?? 0.2}
                      step={0.05}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, startSize: v } })}
                    />
                    <NumberInput
                      label="End Size"
                      value={entity.particles.endSize ?? 0}
                      step={0.05}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, endSize: v } })}
                    />
                    <ColorInput
                      label="Start Color"
                      value={entity.particles.startColor ?? '#ffffff'}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, startColor: v } })}
                    />
                    <ColorInput
                      label="End Color"
                      value={entity.particles.endColor ?? '#ffffff'}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, endColor: v } })}
                    />
                    <NumberInput
                      label="Start Opacity"
                      value={entity.particles.startOpacity ?? 1}
                      step={0.05}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, startOpacity: v } })}
                    />
                    <NumberInput
                      label="End Opacity"
                      value={entity.particles.endOpacity ?? 0}
                      step={0.05}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, endOpacity: v } })}
                    />
                    <NumberInput
                      label="Gravity"
                      value={entity.particles.gravity ?? 0}
                      step={0.1}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, gravity: v } })}
                    />
                    <TextInput
                      label="Texture"
                      value={entity.particles.texture ?? ''}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, texture: v } })}
                    />
                    <SelectInput
                      label="Blending"
                      value={entity.particles.blending ?? 'additive'}
                      options={['additive', 'normal']}
                      onChange={v =>
                        onUpdate({
                          ...entity,
                          particles: { ...entity.particles, blending: v as 'additive' | 'normal' },
                        })
                      }
                    />
                    <CheckboxInput
                      label="Loop"
                      value={entity.particles.loop ?? true}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, loop: v } })}
                    />
                    <CheckboxInput
                      label="Burst"
                      value={entity.particles.burst ?? false}
                      onChange={v => onUpdate({ ...entity, particles: { ...entity.particles, burst: v } })}
                    />
                  </>
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
                  <>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, paddingLeft: 4 }}>
                      <span style={{ width: 96, flexShrink: 0, fontSize: 12, color: '#a3a3a3' }}>Lock Rotation</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                          <CheckboxInput
                            key={axis}
                            label={axis}
                            value={entity.rigidBody?.lockRotation?.[i] ?? false}
                            onChange={v => {
                              const lr: [boolean, boolean, boolean] = [
                                entity.rigidBody?.lockRotation?.[0] ?? false,
                                entity.rigidBody?.lockRotation?.[1] ?? false,
                                entity.rigidBody?.lockRotation?.[2] ?? false,
                              ]
                              lr[i] = v
                              onUpdate({
                                ...entity,
                                rigidBody: {
                                  type: entity.rigidBody?.type ?? 'dynamic',
                                  ...entity.rigidBody,
                                  lockRotation: lr,
                                },
                              })
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </>
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
                      options={['box', 'sphere', 'capsule']}
                      onChange={v =>
                        onUpdate({
                          ...entity,
                          collider: {
                            ...entity.collider,
                            shape: v as 'box' | 'sphere' | 'capsule',
                          },
                        })
                      }
                    />
                    {(entity.collider.shape === 'box' || !entity.collider.shape) && (
                      <Vec3Input
                        label="Half Extents"
                        value={entity.collider.halfExtents ?? [0.5, 0.5, 0.5]}
                        onChange={v => {
                          const shape = entity.collider?.shape ?? 'box'
                          onUpdate({ ...entity, collider: { shape, ...entity.collider, halfExtents: v } })
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
                          onUpdate({ ...entity, collider: { shape, ...entity.collider, radius: v } })
                        }}
                      />
                    )}
                    {entity.collider.shape === 'capsule' && (
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
                    <CheckboxInput
                      label="Sensor"
                      value={entity.collider.sensor ?? false}
                      onChange={v => {
                        const shape = entity.collider?.shape ?? 'box'
                        onUpdate({ ...entity, collider: { shape, ...entity.collider, sensor: v } })
                      }}
                    />
                    <NumberInput
                      label="Friction"
                      value={entity.collider.friction ?? 0.5}
                      step={0.05}
                      onChange={v => {
                        const shape = entity.collider?.shape ?? 'box'
                        onUpdate({ ...entity, collider: { shape, ...entity.collider, friction: v } })
                      }}
                    />
                    <NumberInput
                      label="Restitution"
                      value={entity.collider.restitution ?? 0}
                      step={0.05}
                      onChange={v => {
                        const shape = entity.collider?.shape ?? 'box'
                        onUpdate({ ...entity, collider: { shape, ...entity.collider, restitution: v } })
                      }}
                    />
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
        ) : sceneData && onSceneUpdate ? (
          <SceneSettingsEditor sceneData={sceneData} onSceneUpdate={onSceneUpdate} />
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
