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
}
