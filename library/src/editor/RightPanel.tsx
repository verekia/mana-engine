import { useEffect, useState } from 'react'

import { COLORS } from './colors.ts'
import { ColorInput, NumberInput, PanelHeader, SectionLabel, SelectInput, Vec3Input } from './widgets.tsx'

import type { MeshData, SceneEntity } from '../scene-data.ts'
import type { ManaScript } from '../script.ts'

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
        width: '100%',
        background: COLORS.input,
        border: `1px solid ${COLORS.inputBorder}`,
        borderRadius: 3,
        color: COLORS.text,
        fontWeight: 600,
        fontSize: 13,
        marginBottom: 4,
        padding: '1px 4px',
        outline: 'none',
      }}
    />
  ) : (
    <div
      onDoubleClick={() => setEditing(true)}
      style={{
        color: COLORS.text,
        fontWeight: 600,
        fontSize: 13,
        marginBottom: 4,
        cursor: 'default',
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
            <InspectorName entity={entity} onRename={onRename} />
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
                    <div key={entry.name} style={{ marginBottom: 8 }}>
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
                            color: COLORS.textMuted,
                            cursor: 'pointer',
                            fontSize: 11,
                            padding: '0 4px',
                          }}
                        >
                          x
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
                              <div
                                key={key}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 6,
                                }}
                              >
                                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{key}</span>
                                <input
                                  type="checkbox"
                                  checked={value as boolean}
                                  onChange={e =>
                                    onUpdate({
                                      ...entity,
                                      scripts: entity.scripts?.map(s =>
                                        s.name === entry.name
                                          ? { ...s, params: { ...s.params, [key]: e.target.checked } }
                                          : s,
                                      ),
                                    })
                                  }
                                />
                              </div>
                            )
                          }
                          return (
                            <div
                              key={key}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 6,
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
              </>
            )}
            {entity.type !== 'ui' && (
              <AddComponentButton entity={entity} availableScripts={availableScripts} onUpdate={onUpdate} />
            )}
          </>
        ) : (
          <div style={{ color: COLORS.textMuted, fontStyle: 'italic' }}>Select an entity to inspect</div>
        )}
      </div>
    </div>
  )
}
