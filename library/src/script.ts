import type { CollisionEvent, ManaRigidBody } from './adapters/physics-adapter.ts'
import type { Input } from './input.ts'

export interface ScriptParamDef {
  type: 'number' | 'string' | 'boolean'
  default: number | string | boolean
}

export interface ScriptContext {
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
