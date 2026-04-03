import { flattenEntities } from '../../scene-data.ts'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { CollisionEvent, ManaRigidBody, PhysicsAdapter, PhysicsTransform } from '../physics-adapter.ts'

export type RapierModule = typeof import('@dimforge/rapier3d-compat')
export type RapierRigidBody = InstanceType<RapierModule['RigidBody']>

/** Create a ManaRigidBody wrapper around a Rapier rigid body. */
function createManaBody(rb: RapierRigidBody): ManaRigidBody {
  return {
    translation: () => rb.translation(),
    linvel: () => rb.linvel(),
    setTranslation: (pos, wake) => rb.setTranslation(pos, wake),
    setLinvel: (vel, wake) => rb.setLinvel(vel, wake),
    angvel: () => rb.angvel(),
    setAngvel: (vel, wake) => rb.setAngvel(vel, wake),
    rotation: () => rb.rotation(),
    setRotation: (quat, wake) => rb.setRotation(quat, wake),
    applyImpulse: impulse => rb.applyImpulse(impulse, true),
    applyForce: force => rb.addForce(force, true),
    mass: () => rb.mass(),
    setEnabled: enabled => rb.setEnabled(enabled),
  }
}

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
    if (!entity.rigidBody) return

    const RAPIER = this.RAPIER
    const initial = getInitialTransform(entity.id)
    const px = initial?.position[0] ?? 0
    const py = initial?.position[1] ?? 0
    const pz = initial?.position[2] ?? 0
    const qx = initial?.quaternion[0] ?? 0
    const qy = initial?.quaternion[1] ?? 0
    const qz = initial?.quaternion[2] ?? 0
    const qw = initial?.quaternion[3] ?? 1

    let bodyDesc: InstanceType<RapierModule['RigidBodyDesc']>
    switch (entity.rigidBody.type) {
      case 'fixed':
        bodyDesc = RAPIER.RigidBodyDesc.fixed()
        break
      case 'kinematic':
        bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        break
      default:
        bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    }

    bodyDesc.setTranslation(px, py, pz)
    bodyDesc.setRotation({ x: qx, y: qy, z: qz, w: qw })

    if (entity.rigidBody.lockRotation) {
      const [lx, ly, lz] = entity.rigidBody.lockRotation
      bodyDesc.enabledRotations(!lx, !ly, !lz)
    }

    const rb = this.world.createRigidBody(bodyDesc)

    if (entity.collider) {
      let colliderDesc: InstanceType<RapierModule['ColliderDesc']>
      switch (entity.collider.shape) {
        case 'sphere':
          colliderDesc = RAPIER.ColliderDesc.ball(entity.collider.radius ?? 0.5)
          break
        case 'capsule':
          colliderDesc = RAPIER.ColliderDesc.capsule(entity.collider.halfHeight ?? 0.5, entity.collider.radius ?? 0.5)
          break
        default: {
          const he = entity.collider.halfExtents ?? [0.5, 0.5, 0.5]
          colliderDesc = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2])
        }
      }
      const isSensor = entity.collider.sensor === true
      if (isSensor) {
        colliderDesc.setSensor(true)
      }
      colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      const collider = this.world.createCollider(colliderDesc, rb)
      this.colliderToEntity.set(collider.handle, entity.id)
      this.sensorMap.set(entity.id, isSensor)
    }

    this.rigidBodyMap.set(entity.id, rb)
    this.manaBodyMap.set(entity.id, createManaBody(rb))

    if (entity.rigidBody.type !== 'fixed') {
      this.dynamicEntities.push({ id: entity.id, rigidBody: rb })
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
