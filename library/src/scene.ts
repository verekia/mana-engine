import { Audio } from './audio.ts'
import { Input } from './input.ts'
import { flattenEntities } from './scene-data.ts'

import type { PhysicsAdapter } from './adapters/physics-adapter.ts'
import type { RendererAdapter, EditorCameraState, TransformMode } from './adapters/renderer-adapter.ts'
import type { PrefabData, SceneData, SceneEntity, Transform } from './scene-data.ts'
import type { ManaScript } from './script.ts'

// Re-export adapter types so existing consumers can keep importing from 'scene.ts'
export type { EditorCameraState, TransformMode } from './adapters/renderer-adapter.ts'

export interface ManaScene {
  dispose(): void
  updateEntity(id: string, entity: SceneEntity): void
  addEntity(entity: SceneEntity, parentId?: string): void
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
  /** Set transform gizmo snap increments. Null disables snapping. */
  setTransformSnap(translate: number | null, rotate: number | null, scale: number | null): void
  /** Set transform gizmo space ('local' or 'world'). */
  setTransformSpace(space: 'local' | 'world'): void
  /** Show or hide an entity in the viewport. For lights, only hides the gizmo helper. */
  setEntityVisible(id: string, visible: boolean): void
  /** Switch to an orthographic view or back to perspective. */
  setOrthographicView?(view: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' | 'perspective'): void
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
  /** Callback for scripts to switch scenes via ctx.loadScene(). */
  loadScene?: (name: string) => void
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
export function resolvePrefabs(entities: SceneEntity[], prefabs: Record<string, PrefabData>): SceneEntity[] {
  return entities.map(entity => {
    let resolved = entity
    if (entity.prefab) {
      const prefab = prefabs[entity.prefab]
      if (prefab) {
        const cloned = structuredClone(prefab.entity)
        resolved = {
          ...cloned,
          ...entity,
          // Deep-merge transform: per-field override so partial overrides work
          transform: {
            position: entity.transform?.position ?? cloned.transform?.position,
            rotation: entity.transform?.rotation ?? cloned.transform?.rotation,
            scale: entity.transform?.scale ?? cloned.transform?.scale,
          },
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

/** Assign unique IDs to all entities in a cloned prefab tree (root + children). */
export function assignUniqueIds(entity: SceneEntity, prefix: string): void {
  entity.id = `${prefix}_${Math.random().toString(36).slice(2, 10)}`
  if (entity.children) {
    for (const child of entity.children) {
      assignUniqueIds(child, prefix)
    }
  }
}

export interface ActiveScript {
  script: ManaScript
  entityId: string
  params: Record<string, number | string | boolean>
}

export function setupScripts(entities: SceneEntity[], scriptDefs: Record<string, ManaScript>): ActiveScript[] {
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
  // Build tag → entity IDs index for findEntitiesByTag
  const tagIndex = new Map<string, Set<string>>()
  if (processedData) {
    for (const entity of flattenEntities(processedData.entities)) {
      nameToId.set(entity.name, entity.id)
      if (entity.tags) {
        for (const tag of entity.tags) {
          let set = tagIndex.get(tag)
          if (!set) {
            set = new Set()
            tagIndex.set(tag, set)
          }
          set.add(entity.id)
        }
      }
    }
  }

  // Event bus for script-to-script communication
  const eventListeners = new Map<string, Set<(data: unknown) => void>>()
  // Track listeners per entityId for auto-cleanup on destroy
  const entityListeners = new Map<string, Array<{ event: string; callback: (data: unknown) => void }>>()

  // Mutable list of active scripts — grows when prefabs are instantiated, shrinks on destroy
  const activeScripts: ActiveScript[] = []

  // Track prefab instance → child entity IDs for recursive destruction
  const instanceChildren = new Map<string, string[]>()

  /** Remove a single entity from renderer, physics, scripts, and name lookup. */
  function destroySingleEntity(id: string) {
    renderer.removeEntity(id)
    physicsAdapter?.removeEntity(id)
    for (let i = activeScripts.length - 1; i >= 0; i--) {
      if (activeScripts[i].entityId === id) {
        activeScripts[i].script.dispose?.()
        activeScripts.splice(i, 1)
      }
    }
    for (const [name, eid] of nameToId) {
      if (eid === id) {
        nameToId.delete(name)
        break
      }
    }
    // Remove from tag index
    for (const set of tagIndex.values()) {
      set.delete(id)
    }
    // Clean up event listeners registered by this entity's scripts
    const listeners = entityListeners.get(id)
    if (listeners) {
      for (const { event, callback } of listeners) {
        eventListeners.get(event)?.delete(callback)
      }
      entityListeners.delete(id)
    }
  }

  /** Build a ScriptContext with adapter-agnostic helpers. */
  function makeCtx(
    entityId: string,
    dtVal: number,
    timeVal: number,
    inputVal: Input,
    params: Record<string, number | string | boolean>,
  ): import('./script.ts').ScriptContext {
    return {
      entityId,
      entity: renderer.getEntityNativeObject(entityId),
      scene: renderer.getNativeScene(),
      dt: dtVal,
      time: timeVal,
      rigidBody: physicsAdapter?.getBody(entityId),
      input: inputVal,
      params,
      // Animation
      playAnimation(name, opts) {
        renderer.playAnimation(entityId, name, opts)
      },
      stopAnimation() {
        renderer.stopAnimation(entityId)
      },
      getAnimationNames() {
        return renderer.getAnimationNames(entityId)
      },
      // Event bus
      emit(event, data) {
        const listeners = eventListeners.get(event)
        if (listeners) {
          for (const cb of listeners) cb(data)
        }
      },
      on(event, callback) {
        let set = eventListeners.get(event)
        if (!set) {
          set = new Set()
          eventListeners.set(event, set)
        }
        set.add(callback)
        // Track for auto-cleanup
        let tracked = entityListeners.get(entityId)
        if (!tracked) {
          tracked = []
          entityListeners.set(entityId, tracked)
        }
        tracked.push({ event, callback })
        return () => {
          set?.delete(callback)
        }
      },
      off(event, callback) {
        eventListeners.get(event)?.delete(callback)
      },
      playSound(path, opts) {
        if (!audio) return Promise.resolve('')
        return audio.playSound(path, opts)
      },
      stopSound(id) {
        audio?.stopSound(id)
      },
      playMusic(path, opts) {
        if (!audio) return Promise.resolve()
        return audio.playMusic(path, opts)
      },
      stopMusic() {
        audio?.stopMusic()
      },
      setMasterVolume(volume) {
        audio?.setMasterVolume(volume)
      },
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
      findEntitiesByTag(tag) {
        const set = tagIndex.get(tag)
        return set ? [...set] : []
      },
      raycast(origin, direction, maxDistance) {
        return renderer.raycastWorld(origin, direction, maxDistance)
      },
      instantiatePrefab(name, position, rotation) {
        const prefab = prefabs[name]
        if (!prefab) {
          console.warn(`[mana] Prefab "${name}" not found`)
          return null
        }
        const entity: SceneEntity = structuredClone(prefab.entity)
        // Assign unique IDs to the root and all children
        assignUniqueIds(entity, name)
        const instanceId = entity.id
        entity.name = `${prefab.entity.name} (${instanceId})`

        if (position || rotation) {
          if (!entity.transform) entity.transform = {}
          if (position) entity.transform.position = [position.x, position.y, position.z]
          if (rotation) entity.transform.rotation = [rotation.x, rotation.y, rotation.z]
        }

        // Add root entity to the renderer (handles children hierarchy internally)
        renderer.addEntity(entity)

        // Flatten for physics, scripts, tags setup (renderer already has the 3D hierarchy)
        const allEntities = flattenEntities([entity])
        for (const ent of allEntities) {
          nameToId.set(ent.name, ent.id)
          // Index tags for newly instantiated entities
          if (ent.tags) {
            for (const tag of ent.tags) {
              let set = tagIndex.get(tag)
              if (!set) {
                set = new Set()
                tagIndex.set(tag, set)
              }
              set.add(ent.id)
            }
          }

          if (ent.rigidBody && physicsAdapter) {
            physicsAdapter.addEntity(ent, id => renderer.getEntityInitialPhysicsTransform(id))
          }

          if (ent.scripts && scriptDefs && inputVal) {
            const newScripts = setupScripts([ent], scriptDefs)
            for (const entry of newScripts) {
              activeScripts.push(entry)
              entry.script.init?.(makeCtx(entry.entityId, 0, elapsed, inputVal, entry.params))
            }
          }
        }

        // Track children for recursive destruction
        if (allEntities.length > 1) {
          instanceChildren.set(
            instanceId,
            allEntities.slice(1).map(e => e.id),
          )
        }

        return instanceId
      },
      destroyEntity(id) {
        // Recursively destroy children of prefab instances first
        const childIds = instanceChildren.get(id)
        if (childIds) {
          for (const childId of childIds) {
            destroySingleEntity(childId)
          }
          instanceChildren.delete(id)
        }
        destroySingleEntity(id)
      },
      loadScene(name) {
        options.loadScene?.(name)
      },
    }
  }

  // Script setup — flatten entities to catch scripts on children too
  const allEntities = processedData ? flattenEntities(processedData.entities) : []
  if (processedData && scriptDefs) {
    activeScripts.push(...setupScripts(allEntities, scriptDefs))
  }

  // Input system (play mode with scripts only) — only create if we actually have scripts
  const scriptInput = activeScripts.length > 0 && !enableOrbitControls ? new Input(canvas) : null

  // Audio system (play mode — supports both script-driven and entity-driven audio)
  const audio = !enableOrbitControls && typeof AudioContext !== 'undefined' ? new Audio() : null

  // Run init() on all scripts
  let elapsed = 0
  for (const { script, entityId, params } of activeScripts) {
    if (!scriptInput) break
    script.init?.(makeCtx(entityId, 0, 0, scriptInput, params))
  }

  // Auto-play audio entities defined in the scene
  if (audio && allEntities.length > 0) {
    for (const entity of allEntities) {
      if (entity.type === 'audio' && entity.audio?.src) {
        audio.playSound(entity.audio.src, {
          volume: entity.audio.volume ?? 1,
          loop: entity.audio.loop ?? false,
        })
      }
    }
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

      // Dispatch collision events to scripts
      if (physicsAdapter && scriptInput) {
        for (const event of physicsAdapter.getCollisionEvents()) {
          for (const { script, entityId, params } of activeScripts) {
            if (entityId === event.entityIdA) {
              const info = { entityId: event.entityIdB, sensor: event.sensor }
              if (event.started) {
                script.onCollisionEnter?.(makeCtx(entityId, FIXED_DT, elapsed, scriptInput, params), info)
              } else {
                script.onCollisionExit?.(makeCtx(entityId, FIXED_DT, elapsed, scriptInput, params), info)
              }
            } else if (entityId === event.entityIdB) {
              const info = { entityId: event.entityIdA, sensor: event.sensor }
              if (event.started) {
                script.onCollisionEnter?.(makeCtx(entityId, FIXED_DT, elapsed, scriptInput, params), info)
              } else {
                script.onCollisionExit?.(makeCtx(entityId, FIXED_DT, elapsed, scriptInput, params), info)
              }
            }
          }
        }
      }

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

    renderer.updateAnimations(dt)
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
      audio?.dispose()
      physicsAdapter?.dispose()
      renderer.dispose()
    },
    addEntity(entity: SceneEntity, parentId?: string) {
      renderer.addEntity(entity, parentId)
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
    setTransformSnap(translate: number | null, rotate: number | null, scale: number | null) {
      renderer.setTransformSnap(translate, rotate, scale)
    },
    setTransformSpace(space: 'local' | 'world') {
      renderer.setTransformSpace(space)
    },
    setEntityVisible(id: string, visible: boolean) {
      renderer.setEntityVisible(id, visible)
    },
    setOrthographicView(view) {
      renderer.setOrthographicView?.(view)
    },
  }
}
