import type { SceneData, SceneEntity, Transform } from '../scene-data.ts'
import type { PhysicsTransform } from './physics-adapter.ts'

export type TransformMode = 'translate' | 'rotate' | 'scale'

/** Result of a world-space raycast from a script. */
export interface RaycastHit {
  /** The entity ID of the hit object. */
  entityId: string
  /** Distance from the ray origin to the hit point. */
  distance: number
  /** World-space hit point. */
  point: { x: number; y: number; z: number }
}

export interface EditorCameraState {
  position: [number, number, number]
  target: [number, number, number]
}

export interface RendererAdapterOptions {
  /** Whether to enable editor orbit controls (edit mode) or game camera (play mode) */
  orbitControls?: boolean
  /** Initial editor camera state (orbit controls mode only) */
  editorCamera?: EditorCameraState
  /** Whether to show debug gizmos (collider wireframes, light helpers) */
  showGizmos?: boolean
  /** Called when a transform gizmo drag begins */
  onTransformStart?: (id: string) => void
  /** Called continuously while a transform gizmo is dragged */
  onTransformChange?: (id: string, transform: Transform) => void
  /** Called when a transform gizmo drag ends */
  onTransformEnd?: (id: string, transform: Transform) => void
}

/**
 * Adapter interface that decouples the engine from any specific 3D rendering library.
 * Implement this interface to add support for Three.js, VoidCore, or any other renderer.
 */
export interface RendererAdapter {
  /**
   * Initialize the renderer and attach it to the canvas.
   * Called once before any other methods.
   */
  init(canvas: HTMLCanvasElement, options: RendererAdapterOptions): Promise<void>

  /** Tear down the renderer and release all GPU resources. */
  dispose(): void

  /**
   * Load all entities from a scene data object.
   * Called after init(), replaces any previously loaded entities.
   */
  loadScene(sceneData: SceneData): Promise<void>

  /** Add a single entity to the scene. */
  addEntity(entity: SceneEntity): Promise<void>

  /** Remove an entity from the scene by ID. */
  removeEntity(id: string): void

  /**
   * Update an existing entity's properties (transform, material, light, etc.).
   * Only the fields present on the entity object are applied.
   */
  updateEntity(id: string, entity: SceneEntity): void

  /** Show or hide an entity. For lights, only toggles the debug gizmo. */
  setEntityVisible(id: string, visible: boolean): void

  /**
   * Sync an entity's world transform from the physics simulation.
   * Called each frame for entities with a rigid body.
   */
  setEntityPhysicsTransform(
    id: string,
    position: [number, number, number],
    quaternion: [number, number, number, number],
  ): void

  /**
   * Return the initial world-space transform of an entity for physics seeding.
   * Called during physics init to position rigid bodies at their authored locations.
   */
  getEntityInitialPhysicsTransform(id: string): PhysicsTransform | null

  /**
   * Return an entity's current position as [x, y, z].
   * Used by scripts via ctx.getPosition() and ctx.findEntityPosition().
   */
  getEntityPosition(id: string): [number, number, number] | null

  /**
   * Set an entity's position directly (bypassing physics).
   * Used by scripts via ctx.setPosition().
   */
  setEntityPosition(id: string, x: number, y: number, z: number): void

  /**
   * Set an entity's rotation from Euler angles [x, y, z] in radians.
   * Used by scripts via ctx.setRotation().
   */
  setEntityEulerRotation(id: string, x: number, y: number, z: number): void

  /**
   * Set an entity's scale directly.
   * Used by scripts via ctx.setScale().
   */
  setEntityScale(id: string, x: number, y: number, z: number): void

  /**
   * Return the native object for a given entity ID so that scripts can
   * access renderer-specific APIs. The concrete type depends on the adapter
   * (e.g. `Object3D` for Three.js, a VoidCore node, etc.).
   */
  getEntityNativeObject(id: string): unknown

  /**
   * Return the native scene object so that scripts can query/modify it.
   * The concrete type depends on the adapter.
   */
  getNativeScene(): unknown

  // ── Script helpers ──────────────────────────────────────────────────────────

  /**
   * Raycast from a world-space origin in a given direction.
   * Returns the first entity hit and hit details, or null if nothing was hit.
   * Used by scripts via ctx.raycast() for gameplay logic (shooting, line-of-sight, etc.).
   * @param maxDistance Maximum ray distance (default: 1000).
   */
  raycastWorld(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance?: number,
  ): RaycastHit | null

  // ── Editor helpers ──────────────────────────────────────────────────────────

  /** Enable or disable all debug gizmos (collider wireframes, light helpers). */
  setGizmos(enabled: boolean): void

  /** Highlight selected entities (e.g. outline pass). */
  setSelectedEntities(ids: string[]): void

  /**
   * Perform a raycast from normalized device coordinates (-1 to 1).
   * Returns the entity ID of the first hit, or null.
   */
  raycast(ndcX: number, ndcY: number): string | null

  /** Attach the transform gizmo to an entity, or detach if id is null. */
  setTransformTarget(id: string | null): void

  /** Set the transform gizmo mode. */
  setTransformMode(mode: TransformMode): void

  /** Get the editor camera state (position + orbit target). Null in play mode. */
  getEditorCamera(): EditorCameraState | null

  /** Restore the editor camera to a previously saved state. */
  setEditorCamera(state: EditorCameraState): void

  // ── Frame loop ──────────────────────────────────────────────────────────────

  /**
   * Update per-frame control state (e.g. OrbitControls.update()).
   * Called by scene.ts once per frame, before render().
   */
  updateControls(): void

  /**
   * Render the current frame.
   * Called by scene.ts at the end of each animation frame, after physics and
   * script updates have been applied.
   * The adapter must NOT start its own requestAnimationFrame loop — scene.ts
   * owns the single main loop and calls render() at the right point.
   */
  render(): void
}
