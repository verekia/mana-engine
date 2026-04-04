import type { ManaRigidBody } from './adapters/physics-adapter.ts'
import type { RaycastHit } from './adapters/renderer-adapter.ts'
import type { Input } from './input.ts'

export interface ScriptParamDef {
  type: 'number' | 'string' | 'boolean'
  default: number | string | boolean
}

export interface ScriptContext {
  /** The ID of the entity this script is attached to. */
  entityId: string
  /**
   * The native object this script is attached to.
   * The concrete type depends on the renderer adapter in use —
   * e.g. `Object3D` for Three.js, a VoidCore node for the void adapter.
   * Cast to the appropriate type inside adapter-specific scripts.
   */
  entity: unknown
  /**
   * The native scene object.
   * The concrete type depends on the renderer adapter in use.
   */
  scene: unknown
  /** Delta time in seconds since last frame */
  dt: number
  /** Total elapsed time in seconds since scene started */
  time: number
  /** The physics body for this entity, if it has a rigid body component. */
  rigidBody?: ManaRigidBody
  /** Input state for keyboard, mouse, and axes */
  input: Input
  /** Script parameters configured in the editor */
  params: Record<string, number | string | boolean>

  // ── Audio ────────────────────────────────────────────────────────────────────

  /**
   * Play a one-shot sound effect.
   * @param path Asset path (e.g. 'audio/hit.mp3')
   * @param options.volume Volume 0–1 (default 1)
   * @param options.loop Loop playback (default false)
   * @returns Promise resolving to a sound ID for stopSound()
   */
  playSound(path: string, options?: { volume?: number; loop?: boolean }): Promise<string>
  /** Stop a sound effect by its ID. */
  stopSound(id: string): void
  /**
   * Play a music track (loops by default). Stops any current music.
   * @param path Asset path (e.g. 'audio/bgm.mp3')
   * @param options.volume Volume 0–1 (default 1)
   * @param options.loop Loop playback (default true)
   */
  playMusic(path: string, options?: { volume?: number; loop?: boolean }): Promise<void>
  /** Stop the current music track. */
  stopMusic(): void
  /** Set master volume (0–1) for all sounds and music. */
  setMasterVolume(volume: number): void

  // ── Event bus ────────────────────────────────────────────────────────────────

  /**
   * Emit a named event to all listeners across all scripts.
   * @param event Event name (e.g. 'player-died', 'coin-collected')
   * @param data Optional payload data
   */
  emit(event: string, data?: unknown): void
  /**
   * Subscribe to a named event. The callback fires whenever any script emits that event.
   * Listeners are automatically cleaned up when the script is disposed.
   * @returns An unsubscribe function
   */
  on(event: string, callback: (data: unknown) => void): () => void
  /**
   * Remove a specific listener for a named event.
   */
  off(event: string, callback: (data: unknown) => void): void

  // ── Animation ───────────────────────────────────────────────────────────────

  /**
   * Play a named animation clip on this entity's model.
   * @param name Animation clip name (from the GLTF file)
   * @param options.loop Whether to loop (default true)
   * @param options.crossFadeDuration Crossfade from current animation in seconds (default 0.3)
   */
  playAnimation(name: string, options?: { loop?: boolean; crossFadeDuration?: number }): void
  /** Stop the currently playing animation on this entity. */
  stopAnimation(): void
  /** Get the names of all animation clips available on this entity's model. */
  getAnimationNames(): string[]

  // ── Adapter-agnostic helpers ─────────────────────────────────────────────────

  /** Get this entity's current position. */
  getPosition(): { x: number; y: number; z: number }
  /** Set this entity's position directly (bypasses physics). */
  setPosition(x: number, y: number, z: number): void
  /** Set this entity's rotation from Euler angles (radians). */
  setRotation(x: number, y: number, z: number): void
  /** Set this entity's scale. */
  setScale(x: number, y: number, z: number): void
  /** Find another entity by name and return its position, or null if not found. */
  findEntityPosition(name: string): { x: number; y: number; z: number } | null
  /**
   * Find all entity IDs that have a given tag.
   * @param tag The tag to search for (e.g. 'enemy', 'collectible')
   * @returns Array of entity IDs matching the tag
   */
  findEntitiesByTag(tag: string): string[]
  /**
   * Cast a ray from a world-space origin in a direction.
   * Returns the first entity hit with distance and hit point, or null.
   * Useful for shooting, line-of-sight checks, ground detection, etc.
   * @param origin World-space ray origin
   * @param direction Ray direction (will be normalized)
   * @param maxDistance Maximum ray length (default 1000)
   */
  raycast(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance?: number,
  ): RaycastHit | null
  /**
   * Instantiate a prefab at runtime.
   * The prefab must exist in the `prefabs/` directory as `<name>.prefab.yaml`.
   * Returns the entity ID of the newly created instance, or null if the prefab is not found.
   * Physics bodies and scripts on the prefab are automatically initialized.
   *
   * @param name The prefab name (without .prefab.yaml extension)
   * @param position Optional spawn position override
   * @param rotation Optional spawn rotation override (Euler angles in radians)
   */
  instantiatePrefab(
    name: string,
    position?: { x: number; y: number; z: number },
    rotation?: { x: number; y: number; z: number },
  ): string | null
  /**
   * Destroy an entity by ID, removing it from the renderer, physics, and scripts.
   * Can destroy both scene entities and runtime-instantiated prefab instances.
   */
  destroyEntity(id: string): void

  /**
   * Load a different scene by name.
   * The current scene will be disposed and replaced with the new one.
   * @param name Scene name (e.g. 'main-menu', 'level-1')
   */
  loadScene(name: string): void
}

/**
 * Collision info passed to onCollisionEnter/onCollisionExit callbacks.
 */
export interface CollisionInfo {
  /** Entity ID of the other entity involved in the collision. */
  entityId: string
  /** True if at least one of the colliders is a sensor (trigger volume). */
  sensor: boolean
}

export interface ManaScript {
  params?: Record<string, ScriptParamDef>
  init?(ctx: ScriptContext): void
  update?(ctx: ScriptContext): void
  fixedUpdate?(ctx: ScriptContext): void
  /** Called when this entity's collider starts touching another entity's collider. */
  onCollisionEnter?(ctx: ScriptContext, other: CollisionInfo): void
  /** Called when this entity's collider stops touching another entity's collider. */
  onCollisionExit?(ctx: ScriptContext, other: CollisionInfo): void
  dispose?(): void
}
