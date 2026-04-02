import { Input } from './input.ts'

import type { PhysicsAdapter } from './adapters/physics-adapter.ts'
import type { RendererAdapter, EditorCameraState, TransformMode } from './adapters/renderer-adapter.ts'
import type { SceneData, SceneEntity, Transform } from './scene-data.ts'
import type { ManaScript } from './script.ts'

// Re-export adapter types so existing consumers can keep importing from 'scene.ts'
export type { EditorCameraState, TransformMode } from './adapters/renderer-adapter.ts'

// Re-export Rapier types for scripts that use the Three.js adapter
export type { RapierModule, RapierRigidBody } from './adapters/three/index.ts'

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

function setupScripts(sceneData: SceneData, scriptDefs: Record<string, ManaScript>) {
  const activeScripts: {
    script: ManaScript
    entityId: string
    params: Record<string, number | string | boolean>
  }[] = []

  for (const entity of sceneData.entities) {
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

  // Initialize the renderer
  await renderer.init(canvas, {
    orbitControls: enableOrbitControls,
    editorCamera: options.editorCamera,
    showGizmos: enableOrbitControls, // show gizmos in editor mode by default
    onTransformStart: options.onTransformStart,
    onTransformChange: options.onTransformChange,
    onTransformEnd: options.onTransformEnd,
  })

  // Load scene entities into the renderer
  if (sceneData) {
    await renderer.loadScene(sceneData)
  }

  // Physics setup (play mode only)
  let physicsAdapter: PhysicsAdapter | null = null
  if (sceneData && !enableOrbitControls && options.physics) {
    physicsAdapter = options.physics
    await physicsAdapter.init(sceneData, id => {
      // Query the renderer for the initial world transform of each entity
      const obj = renderer.getEntityNativeObject(id) as any
      if (!obj) return null
      // Support Three.js Object3D duck-typed interface
      if (obj.position && obj.quaternion) {
        return {
          position: [obj.position.x, obj.position.y, obj.position.z] as [number, number, number],
          quaternion: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w] as [
            number,
            number,
            number,
            number,
          ],
        }
      }
      return null
    })
  }

  // Input system (play mode with scripts only)
  const input = scriptDefs && !enableOrbitControls ? new Input(canvas) : null

  // Script setup
  const activeScripts = sceneData && scriptDefs ? setupScripts(sceneData, scriptDefs) : []

  const scriptInput = activeScripts.length > 0 ? (input ?? new Input(canvas)) : null

  // Run init() on all scripts
  for (const { script, entityId, params } of activeScripts) {
    if (!scriptInput) break
    script.init?.({
      entity: renderer.getEntityNativeObject(entityId),
      scene: renderer.getNativeScene(),
      dt: 0,
      time: 0,
      rigidBody: physicsAdapter?.getBody(entityId),
      input: scriptInput,
      params,
    })
  }

  let lastTime = performance.now() / 1000
  let elapsed = 0
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
          script.fixedUpdate?.({
            entity: renderer.getEntityNativeObject(entityId),
            scene: renderer.getNativeScene(),
            dt: FIXED_DT,
            time: elapsed,
            rigidBody: physicsAdapter?.getBody(entityId),
            input: scriptInput,
            params,
          })
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
        script.update?.({
          entity: renderer.getEntityNativeObject(entityId),
          scene: renderer.getNativeScene(),
          dt,
          time: elapsed,
          rigidBody: physicsAdapter?.getBody(entityId),
          input: scriptInput,
          params,
        })
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
