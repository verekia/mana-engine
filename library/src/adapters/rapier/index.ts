import { flattenEntities } from '../../scene-data.ts'
import { createRapierBody } from './rapier-body.ts'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { CollisionEvent, ManaRigidBody, PhysicsAdapter, PhysicsTransform } from '../physics-adapter.ts'

export type RapierModule = typeof import('@dimforge/rapier3d-compat')
export type RapierRigidBody = InstanceType<RapierModule['RigidBody']>

/**
 * PhysicsAdapter implementation backed by Rapier 3D.
 *
 * Only dynamic and kinematic rigid bodies have their transforms read back
 * each frame — fixed bodies never move, so they are excluded from getTransforms().
 */
export class RapierPhysicsAdapter implements PhysicsAdapter {
  private RAPIER!: RapierModule
  private world!: InstanceType<RapierModule['World']>
  private eventQueue!: InstanceType<RapierModule['EventQueue']>
  private dynamicEntities: { id: string; rigidBody: RapierRigidBody }[] = []
  private rigidBodyMap = new Map<string, RapierRigidBody>()
  private manaBodyMap = new Map<string, ManaRigidBody>()
  /** Map from Rapier collider handle to entity ID, for resolving collision events. */
  private colliderToEntity = new Map<number, string>()
  /** Map from entity ID to whether its collider is a sensor. */
  private sensorMap = new Map<string, boolean>()
  private pendingCollisionEvents: CollisionEvent[] = []

  /** Create a rigid body + collider for an entity and register it in all maps. */
  private _createBody(entity: SceneEntity, getInitialTransform: (id: string) => PhysicsTransform | null): void {
    const result = createRapierBody(entity, this.world, this.RAPIER, getInitialTransform)
    if (!result) return

    this.rigidBodyMap.set(entity.id, result.rigidBody)
    this.manaBodyMap.set(entity.id, result.manaBody)

    for (const handle of result.colliderHandles) {
      this.colliderToEntity.set(handle, entity.id)
    }
    this.sensorMap.set(entity.id, result.isSensor)

    if (result.isDynamic) {
      this.dynamicEntities.push({ id: entity.id, rigidBody: result.rigidBody })
    }
  }

  async init(sceneData: SceneData, getInitialTransform: (id: string) => PhysicsTransform | null): Promise<void> {
    const allEntities = flattenEntities(sceneData.entities)
    const hasPhysics = allEntities.some(e => e.rigidBody)
    if (!hasPhysics) return

    const RAPIER = await import('@dimforge/rapier3d-compat')
    await RAPIER.init()
    this.RAPIER = RAPIER

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.eventQueue = new RAPIER.EventQueue(true)

    for (const entity of allEntities) {
      this._createBody(entity, getInitialTransform)
    }
  }

  dispose(): void {
    this.eventQueue?.free()
    this.world?.free()
    this.dynamicEntities = []
    this.rigidBodyMap.clear()
    this.manaBodyMap.clear()
    this.colliderToEntity.clear()
    this.sensorMap.clear()
    this.pendingCollisionEvents = []
  }

  step(dt: number): void {
    if (!this.world) return
    this.world.timestep = dt
    this.world.step(this.eventQueue)

    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      const entityA = this.colliderToEntity.get(handle1)
      const entityB = this.colliderToEntity.get(handle2)
      if (!entityA || !entityB) return
      const sensorA = this.sensorMap.get(entityA) === true
      const sensorB = this.sensorMap.get(entityB) === true
      this.pendingCollisionEvents.push({
        entityIdA: entityA,
        entityIdB: entityB,
        started,
        sensor: sensorA || sensorB,
      })
    })
  }

  getTransforms(): Map<string, PhysicsTransform> {
    const transforms = new Map<string, PhysicsTransform>()
    for (const { id, rigidBody } of this.dynamicEntities) {
      if (rigidBody.isSleeping()) continue
      const pos = rigidBody.translation()
      const rot = rigidBody.rotation()
      transforms.set(id, {
        position: [pos.x, pos.y, pos.z],
        quaternion: [rot.x, rot.y, rot.z, rot.w],
      })
    }
    return transforms
  }

  getBody(entityId: string): ManaRigidBody | undefined {
    return this.manaBodyMap.get(entityId)
  }

  getCollisionEvents(): CollisionEvent[] {
    const events = this.pendingCollisionEvents
    this.pendingCollisionEvents = []
    return events
  }

  addEntity(entity: SceneEntity, getInitialTransform: (id: string) => PhysicsTransform | null): void {
    if (!this.RAPIER || !this.world) return
    this._createBody(entity, getInitialTransform)
  }

  removeEntity(entityId: string): void {
    const rb = this.rigidBodyMap.get(entityId)
    if (rb && this.world) {
      // Clean up collider-to-entity mapping before removing the body
      for (let i = 0; i < rb.numColliders(); i++) {
        this.colliderToEntity.delete(rb.collider(i).handle)
      }
      this.world.removeRigidBody(rb)
    }
    this.rigidBodyMap.delete(entityId)
    this.manaBodyMap.delete(entityId)
    this.sensorMap.delete(entityId)
    this.dynamicEntities = this.dynamicEntities.filter(e => e.id !== entityId)
  }
}
