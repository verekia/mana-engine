import type { SceneData } from '../scene-data.ts'

export interface PhysicsTransform {
  position: [number, number, number]
  quaternion: [number, number, number, number]
}

/**
 * Adapter-agnostic rigid body handle exposed to scripts via `ctx.rigidBody`.
 * Covers the operations used in the engine's example scripts.
 * Both Rapier and Crashcat adapters return wrappers implementing this interface.
 */
export interface ManaRigidBody {
  /** World-space position. */
  translation(): { x: number; y: number; z: number }
  /** World-space linear velocity. */
  linvel(): { x: number; y: number; z: number }
  /** Teleport the body to a new position. */
  setTranslation(pos: { x: number; y: number; z: number }, wake: boolean): void
  /** Set linear velocity directly. */
  setLinvel(vel: { x: number; y: number; z: number }, wake: boolean): void
  /** World-space angular velocity. */
  angvel(): { x: number; y: number; z: number }
  /** Set angular velocity directly. */
  setAngvel(vel: { x: number; y: number; z: number }, wake: boolean): void
  /** World-space rotation as a quaternion. */
  rotation(): { x: number; y: number; z: number; w: number }
  /** Set rotation quaternion. */
  setRotation(quat: { x: number; y: number; z: number; w: number }, wake: boolean): void
  /** Apply an instantaneous impulse at the center of mass. */
  applyImpulse(impulse: { x: number; y: number; z: number }): void
  /** Apply a continuous force at the center of mass (accumulated over the next step). */
  applyForce(force: { x: number; y: number; z: number }): void
  /** Get the body's mass. */
  mass(): number
  /** Enable or disable the body (disabled bodies are excluded from simulation). */
  setEnabled(enabled: boolean): void
}

/**
 * Adapter interface that decouples the engine from any specific physics library.
 * Implement this interface to add support for Rapier, Cannon, Ammo, etc.
 */
export interface PhysicsAdapter {
  /**
   * Initialize the physics world from scene data.
   * @param sceneData - The scene to build the physics world from.
   * @param getInitialTransform - Callback to read the initial world transform for each entity ID.
   *   The physics adapter should use this to seed rigid body positions from the renderer.
   */
  init(sceneData: SceneData, getInitialTransform: (id: string) => PhysicsTransform | null): Promise<void>

  /** Destroy the physics world and free all resources. */
  dispose(): void

  /** Advance the simulation by one fixed timestep. */
  step(dt: number): void

  /**
   * Return the current world transforms of all simulated entities.
   * Only entities with a dynamic or kinematic rigid body should be included.
   * The engine will call setEntityPhysicsTransform on the renderer for each entry.
   */
  getTransforms(): Map<string, PhysicsTransform>

  /**
   * Return the ManaRigidBody handle for an entity so scripts can read/write
   * velocity and position in a physics-library-agnostic way.
   */
  getBody(entityId: string): ManaRigidBody | undefined

  /**
   * Add a single entity's physics body at runtime (e.g. for prefab instantiation).
   * Only creates a body if the entity has a rigidBody component.
   */
  addEntity(
    entity: import('../scene-data.ts').SceneEntity,
    getInitialTransform: (id: string) => PhysicsTransform | null,
  ): void

  /**
   * Remove a single entity's physics body at runtime.
   */
  removeEntity(entityId: string): void
}
