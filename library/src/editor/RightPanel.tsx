import { useEffect, useRef, useState } from 'react'

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

function AddComponentPopover({
  anchorRef,
  options,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  options: { label: string; action: () => void }[]
  onClose: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = (() => {
    if (!anchorRef.current) return { top: 0, left: 0 }
    const rect = anchorRef.current.getBoundingClientRect()
    return { top: rect.bottom + 2, left: rect.left }
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
  const attachedNames = attachedScripts.map(s => s.name)
  for (const name of availableScripts) {
    if (!attachedNames.includes(name)) {
      options.push({
        label: `Script: ${name}`,
        action: () => onUpdate({ ...entity, scripts: [...attachedScripts, { name }] }),
      })
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on entity switch, not name edits
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
        fontSize: 13,
        marginBottom: 2,
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
        fontSize: 13,
        marginBottom: 2,
      }}
    >
      {entity.name}
    </div>
  )
}

export function RightPanel({
  entity,
  onUpdate,
  onRename,
  availableScripts,
  availableUiComponents,
  scriptDefs,
}: {
  entity: SceneEntity | null
  onUpdate: (entity: SceneEntity) => void
  onRename: (id: string, name: string) => void
  availableScripts: string[]
  availableUiComponents: string[]
  scriptDefs: Record<string, ManaScript>
}) {
  return (
    <div
      style={{
        width: 260,
        background: COLORS.panel,
        borderLeft: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          fontSize: 12,
          color: COLORS.textMuted,
          flex: 1,
          overflow: 'auto',
        }}
      >
        {entity ? (
          <>
            <InspectorName entity={entity} onRename={onRename} />
            <div style={{ color: COLORS.textDim, fontSize: 10, marginBottom: 8 }}>{entityTypeLabel(entity.type)}</div>

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
                <NumberInput
                  label="Roughness"
                  value={entity.mesh.material?.roughness ?? 1}
                  step={0.05}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      mesh: {
                        ...entity.mesh,
                        material: { ...entity.mesh?.material, roughness: v },
                      },
                    })
                  }
                />
                <NumberInput
                  label="Metalness"
                  value={entity.mesh.material?.metalness ?? 0}
                  step={0.05}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      mesh: {
                        ...entity.mesh,
                        material: { ...entity.mesh?.material, metalness: v },
                      },
                    })
                  }
                />
                <ColorInput
                  label="Emissive"
                  value={entity.mesh.material?.emissive ?? '#000000'}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      mesh: {
                        ...entity.mesh,
                        material: { ...entity.mesh?.material, emissive: v },
                      },
                    })
                  }
                />
                {TEXTURE_MAP_FIELDS.map(({ label, key }) => (
                  <TextInput
                    key={key}
                    label={label}
                    value={(entity.mesh?.material?.[key] as string) ?? ''}
                    onChange={v =>
                      onUpdate({
                        ...entity,
                        mesh: {
                          ...entity.mesh,
                          material: { ...entity.mesh?.material, [key]: v || undefined },
                        },
                      })
                    }
                  />
                ))}
              </>
            )}

            {entity.model && (
              <>
                <SectionLabel>Model</SectionLabel>
                <TextInput
                  label="Source"
                  value={entity.model.src ?? ''}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      model: { ...entity.model, src: v },
                    })
                  }
                />
              </>
            )}

            {entity.ui && (
              <>
                <SectionLabel>UI</SectionLabel>
                <SelectInput
                  label="Component"
                  value={entity.ui.component}
                  options={availableUiComponents}
                  onChange={v =>
                    onUpdate({
                      ...entity,
                      ui: { ...entity.ui, component: v },
                    })
                  }
                />
              </>
            )}

            {entity.scripts && entity.scripts.length > 0 && (
              <>
                <SectionLabel>Scripts</SectionLabel>
                {entity.scripts.map(entry => {
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
                            onUpdate({
                              ...entity,
                              scripts: entity.scripts?.filter(x => x.name !== entry.name),
                            })
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
                                    scripts: entity.scripts?.map(s =>
                                      s.name === entry.name ? { ...s, params: { ...s.params, [key]: v } } : s,
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
                                    scripts: entity.scripts?.map(s =>
                                      s.name === entry.name ? { ...s, params: { ...s.params, [key]: v } } : s,
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
                                    scripts: entity.scripts?.map(s =>
                                      s.name === entry.name
                                        ? { ...s, params: { ...s.params, [key]: e.target.value } }
                                        : s,
                                    ),
                                  })
                                }
                                style={{
                                  ...INPUT_STYLE,
                                  width: 80,
                                }}
                              />
                            </div>
                          )
                        })}
                    </div>
                  )
                })}
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
                {(entity.type === 'directional-light' || entity.type === 'point-light') && (
                  <CheckboxInput
                    label="Cast Shadow"
                    value={entity.light.castShadow ?? false}
                    onChange={v =>
                      onUpdate({
                        ...entity,
                        light: { ...entity.light, castShadow: v },
                      })
                    }
                  />
                )}
              </>
            )}

            {(entity.type === 'mesh' || entity.type === 'model') && (
              <>
                <SectionLabel>Shadows</SectionLabel>
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
    </div>
  )
}
