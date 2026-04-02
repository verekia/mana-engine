import type { SceneData } from '../scene-data.ts'

export interface PhysicsTransform {
  position: [number, number, number]
  quaternion: [number, number, number, number]
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
   * Return the native physics body for an entity so that scripts can apply
   * forces, read velocity, etc. The concrete type depends on the adapter
   * (e.g. a Rapier `RigidBody`, a Cannon `Body`, etc.).
   */
  getBody(entityId: string): unknown
}
