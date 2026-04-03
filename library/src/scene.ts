import { Input } from './input.ts'

import type { PhysicsAdapter } from './adapters/physics-adapter.ts'
import type { RendererAdapter, EditorCameraState, TransformMode } from './adapters/renderer-adapter.ts'
import type { PrefabData, SceneData, SceneEntity, Transform } from './scene-data.ts'
import type { ManaScript } from './script.ts'

// Re-export adapter types so existing consumers can keep importing from 'scene.ts'
export type { EditorCameraState, TransformMode } from './adapters/renderer-adapter.ts'

export interface ManaScene {
  dispose(): void
  updateEntity(id: string, entity: SceneEntity): void
  addEntity(entity: SceneEntity): void
  removeEntity(id: string): void
  setGizmos(enabled: boolean): void
  setSelectedObjects(ids: string[]): void
  /** Raycast from normalized coordinates (-1 to 1). Returns the entity ID hit, or null. */
  raycast(ndcX: number, ndcY: number): string | null
  /** Get the current editor camera position and target (only available in orbit controls mode) */
  getEditorCamera(): EditorCameraState | null
  /** Restore the editor camera position and target (only available in orbit controls mode) */
  setEditorCamera(state: EditorCameraState): void
  /** Set transform gizmo mode (translate/rotate/scale). Editor mode only. */
  setTransformMode(mode: TransformMode): void
  /** Attach transform gizmo to entity, or detach if id is null. Editor mode only. */
  setTransformTarget(id: string | null): void
  /** Show or hide an entity in the viewport. For lights, only hides the gizmo helper. */
  setEntityVisible(id: string, visible: boolean): void
}

export interface CreateSceneOptions {
  /** The renderer adapter to use for this scene. Required. */
  renderer: RendererAdapter
  /**
   * The physics adapter to use. Optional — pass a RapierPhysicsAdapter (or any
   * other PhysicsAdapter) to enable rigid-body simulation. Ignored in editor mode.
   */
  physics?: PhysicsAdapter
  /** Scripts to run during play mode. Ignored in editor mode (orbitControls: true). */
  scripts?: Record<string, ManaScript>
  /** Prefab definitions, keyed by name. Used by `ctx.instantiatePrefab()` in scripts. */
  prefabs?: Record<string, PrefabData>
  /** Enable editor orbit controls (edit mode). When false, the game camera is used. */
  orbitControls?: boolean
  /** Initial editor camera state (orbit controls mode only). */
  editorCamera?: EditorCameraState
  /** Called when a gizmo drag starts */
  onTransformStart?: (id: string) => void
  /** Called continuously while the transform gizmo is dragged */
  onTransformChange?: (id: string, transform: Transform) => void
  /** Called when a gizmo drag ends */
  onTransformEnd?: (id: string, transform: Transform) => void
}

const FIXED_DT = 1 / 60

/**
 * Resolve prefab references on entities. If an entity has a `prefab` field,
 * its properties are merged on top of the prefab's defaults (entity wins).
 */
function resolvePrefabs(entities: SceneEntity[], prefabs: Record<string, PrefabData>): SceneEntity[] {
  return entities.map(entity => {
    let resolved = entity
    if (entity.prefab) {
      const prefab = prefabs[entity.prefab]
      if (prefab) {
        resolved = {
          ...structuredClone(prefab.entity),
          ...entity,
          // Merge transform: entity overrides prefab
          transform: entity.transform ?? prefab.entity.transform,
        }
      } else {
        console.warn(`[mana] Prefab "${entity.prefab}" not found for entity "${entity.name}"`)
      }
    }
    // Recursively resolve children
    if (resolved.children?.length) {
      resolved = { ...resolved, children: resolvePrefabs(resolved.children, prefabs) }
    }
    return resolved
  })
}

/** Flatten a tree of entities (with children) into a flat array. */
function flattenEntities(entities: SceneEntity[]): SceneEntity[] {
  const result: SceneEntity[] = []
  for (const entity of entities) {
    result.push(entity)
    if (entity.children?.length) {
      result.push(...flattenEntities(entity.children))
    }
  }
  return result
}

interface ActiveScript {
  script: ManaScript
  entityId: string
  params: Record<string, number | string | boolean>
}

function setupScripts(entities: SceneEntity[], scriptDefs: Record<string, ManaScript>): ActiveScript[] {
  const activeScripts: ActiveScript[] = []

  for (const entity of entities) {
    if (!entity.scripts) continue
    for (const entry of entity.scripts) {
      const script = scriptDefs[entry.name]
      if (!script) {
        console.warn(`[mana] Script "${entry.name}" not found, skipping (entity: "${entity.name}")`)
        continue
      }
      const params: Record<string, number | string | boolean> = {}
      if (script.params) {
        for (const [key, def] of Object.entries(script.params)) {
          params[key] = def.default
        }
      }
      if (entry.params) {
        for (const [key, value] of Object.entries(entry.params)) {
          const def = script.params?.[key]
          if (def) {
            if (def.type === 'number' && typeof value !== 'number') {
              params[key] = Number(value)
            } else if (def.type === 'boolean' && typeof value !== 'boolean') {
              params[key] = value === 'true'
            } else if (def.type === 'string' && typeof value !== 'string') {
              params[key] = String(value)
            } else {
              params[key] = value as number | string | boolean
            }
          } else {
            params[key] = value as number | string | boolean
          }
        }
      }
      activeScripts.push({ script, entityId: entity.id, params })
    }
  }

  return activeScripts
}

export async function createScene(
  canvas: HTMLCanvasElement,
  sceneData: SceneData | undefined,
  options: CreateSceneOptions,
): Promise<ManaScene> {
  const { renderer, scripts: scriptDefs, orbitControls: enableOrbitControls = false } = options
  const prefabs = options.prefabs ?? {}

  // Initialize the renderer
  await renderer.init(canvas, {
    orbitControls: enableOrbitControls,
    editorCamera: options.editorCamera,
    showGizmos: enableOrbitControls, // show gizmos in editor mode by default
    onTransformStart: options.onTransformStart,
    onTransformChange: options.onTransformChange,
    onTransformEnd: options.onTransformEnd,
  })

  // Resolve prefab references and flatten children for processing
  let processedData = sceneData
  if (sceneData && Object.keys(prefabs).length > 0) {
    processedData = {
      ...sceneData,
      entities: resolvePrefabs(sceneData.entities, prefabs),
    }
  }

  // Load scene entities into the renderer
  if (processedData) {
    await renderer.loadScene(processedData)
  }

  // Physics setup (play mode only)
  let physicsAdapter: PhysicsAdapter | null = null
  if (processedData && !enableOrbitControls && options.physics) {
    physicsAdapter = options.physics
    await physicsAdapter.init(processedData, id => renderer.getEntityInitialPhysicsTransform(id))
  }

  if (!enableOrbitControls) {
    const rendererName = renderer.constructor.name || 'unknown'
    const physicsName = physicsAdapter ? physicsAdapter.constructor.name || 'unknown' : 'none'
    console.log(`[mana] Renderer: ${rendererName} | Physics: ${physicsName}`)
  }

  // Build name → id lookup for findEntityPosition
  const nameToId = new Map<string, string>()
  if (processedData) {
    for (const entity of flattenEntities(processedData.entities)) {
      nameToId.set(entity.name, entity.id)
    }
  }

  // Mutable list of active scripts — grows when prefabs are instantiated, shrinks on destroy
  const activeScripts: ActiveScript[] = []

  /** Build a ScriptContext with adapter-agnostic helpers. */
  function makeCtx(
    entityId: string,
    dtVal: number,
    timeVal: number,
    inputVal: Input,
    params: Record<string, number | string | boolean>,
  ): import('./script.ts').ScriptContext {
    return {
      entity: renderer.getEntityNativeObject(entityId),
      scene: renderer.getNativeScene(),
      dt: dtVal,
      time: timeVal,
      rigidBody: physicsAdapter?.getBody(entityId),
      input: inputVal,
      params,
      getPosition() {
        const p = renderer.getEntityPosition(entityId)
        return p ? { x: p[0], y: p[1], z: p[2] } : { x: 0, y: 0, z: 0 }
      },
      setPosition(x, y, z) {
        renderer.setEntityPosition(entityId, x, y, z)
      },
      setRotation(x, y, z) {
        renderer.setEntityEulerRotation(entityId, x, y, z)
      },
      setScale(x, y, z) {
        renderer.setEntityScale(entityId, x, y, z)
      },
      findEntityPosition(name) {
        const id = nameToId.get(name)
        if (!id) return null
        const p = renderer.getEntityPosition(id)
        return p ? { x: p[0], y: p[1], z: p[2] } : null
      },
      instantiatePrefab(name, position) {
        const prefab = prefabs[name]
        if (!prefab) {
          console.warn(`[mana] Prefab "${name}" not found`)
          return null
        }
        const instanceId = `${name}_${Math.random().toString(36).slice(2, 10)}`
        const entity: SceneEntity = {
          ...structuredClone(prefab.entity),
          id: instanceId,
          name: `${prefab.entity.name} (instance)`,
        }
        if (position && entity.transform) {
          entity.transform.position = [position.x, position.y, position.z]
        } else if (position) {
          entity.transform = { position: [position.x, position.y, position.z] }
        }

        // Add to renderer
        renderer.addEntity(entity)
        nameToId.set(entity.name, instanceId)

        // Add physics body if the prefab has one
        if (entity.rigidBody && physicsAdapter) {
          physicsAdapter.addEntity(entity, id => renderer.getEntityInitialPhysicsTransform(id))
        }

        // Initialize scripts if the prefab has any
        if (entity.scripts && scriptDefs && inputVal) {
          const newScripts = setupScripts([entity], scriptDefs)
          for (const entry of newScripts) {
            activeScripts.push(entry)
            entry.script.init?.(makeCtx(entry.entityId, 0, elapsed, inputVal, entry.params))
          }
        }

        // Recursively add children
        if (entity.children) {
          for (const child of flattenEntities(entity.children)) {
            renderer.addEntity(child)
            nameToId.set(child.name, child.id)
            if (child.rigidBody && physicsAdapter) {
              physicsAdapter.addEntity(child, id => renderer.getEntityInitialPhysicsTransform(id))
            }
            if (child.scripts && scriptDefs && inputVal) {
              const childScripts = setupScripts([child], scriptDefs)
              for (const entry of childScripts) {
                activeScripts.push(entry)
                entry.script.init?.(makeCtx(entry.entityId, 0, elapsed, inputVal, entry.params))
              }
            }
          }
        }

        return instanceId
      },
      destroyEntity(id) {
        // Remove from renderer
        renderer.removeEntity(id)

        // Remove physics body
        physicsAdapter?.removeEntity(id)

        // Dispose and remove scripts for this entity
        for (let i = activeScripts.length - 1; i >= 0; i--) {
          if (activeScripts[i].entityId === id) {
            activeScripts[i].script.dispose?.()
            activeScripts.splice(i, 1)
          }
        }

        // Clean up name lookup
        for (const [name, eid] of nameToId) {
          if (eid === id) {
            nameToId.delete(name)
            break
          }
        }
      },
    }
  }

  // Input system (play mode with scripts only)
  const input = scriptDefs && !enableOrbitControls ? new Input(canvas) : null

  // Script setup — flatten entities to catch scripts on children too
  const allEntities = processedData ? flattenEntities(processedData.entities) : []
  if (processedData && scriptDefs) {
    activeScripts.push(...setupScripts(allEntities, scriptDefs))
  }

  const scriptInput = activeScripts.length > 0 ? (input ?? new Input(canvas)) : null

  // Run init() on all scripts
  let elapsed = 0
  for (const { script, entityId, params } of activeScripts) {
    if (!scriptInput) break
    script.init?.(makeCtx(entityId, 0, 0, scriptInput, params))
  }

  let lastTime = performance.now() / 1000
  let fixedAccumulator = 0
  let animationId = 0

  function animate() {
    animationId = requestAnimationFrame(animate)

    const now = performance.now() / 1000
    const dt = Math.min(now - lastTime, 0.1)
    lastTime = now
    elapsed += dt

    scriptInput?.beginFrame()

    // Fixed update (60 Hz)
    fixedAccumulator += dt
    while (fixedAccumulator >= FIXED_DT) {
      physicsAdapter?.step(FIXED_DT)

      if (scriptInput) {
        for (const { script, entityId, params } of activeScripts) {
          script.fixedUpdate?.(makeCtx(entityId, FIXED_DT, elapsed, scriptInput, params))
        }
      }
      fixedAccumulator -= FIXED_DT
    }

    // Sync physics transforms to the renderer
    if (physicsAdapter) {
      for (const [id, t] of physicsAdapter.getTransforms()) {
        renderer.setEntityPhysicsTransform(id, t.position, t.quaternion)
      }
    }

    // Variable update
    if (scriptInput) {
      for (const { script, entityId, params } of activeScripts) {
        script.update?.(makeCtx(entityId, dt, elapsed, scriptInput, params))
      }
    }

    scriptInput?.endFrame()

    renderer.updateControls()
    renderer.render()
  }

  animate()

  return {
    dispose() {
      cancelAnimationFrame(animationId)
      for (const { script } of activeScripts) {
        script.dispose?.()
      }
      scriptInput?.dispose()
      physicsAdapter?.dispose()
      renderer.dispose()
    },
    addEntity(entity: SceneEntity) {
      renderer.addEntity(entity)
    },
    removeEntity(id: string) {
      renderer.removeEntity(id)
    },
    updateEntity(id: string, entity: SceneEntity) {
      renderer.updateEntity(id, entity)
    },
    setGizmos(enabled: boolean) {
      renderer.setGizmos(enabled)
    },
    setSelectedObjects(ids: string[]) {
      renderer.setSelectedEntities(ids)
    },
    raycast(ndcX: number, ndcY: number): string | null {
      return renderer.raycast(ndcX, ndcY)
    },
    getEditorCamera(): EditorCameraState | null {
      return renderer.getEditorCamera()
    },
    setEditorCamera(state: EditorCameraState) {
      renderer.setEditorCamera(state)
    },
    setTransformMode(mode: TransformMode) {
      renderer.setTransformMode(mode)
    },
    setTransformTarget(id: string | null) {
      renderer.setTransformTarget(id)
    },
    setEntityVisible(id: string, visible: boolean) {
      renderer.setEntityVisible(id, visible)
    },
  }
}
