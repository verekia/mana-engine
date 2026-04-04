import { enableCollision, registerAll, rigidBody, updateWorld } from 'crashcat'
import { addBroadphaseLayer, addObjectLayer, createWorld, createWorldSettings } from 'crashcat'
import { MotionType } from 'crashcat'

import { flattenEntities } from '../../scene-data.ts'
import { createCrashcatBody } from './crashcat-body.ts'

import type { RigidBody, World } from 'crashcat'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { CollisionEvent, ManaRigidBody, PhysicsAdapter, PhysicsTransform } from '../physics-adapter.ts'

// registerAll() is idempotent — safe to call multiple times
let registered = false
function ensureRegistered() {
  if (!registered) {
    registerAll()
    registered = true
  }
}

export type CrashcatRigidBody = RigidBody
export type CrashcatWorld = World

/**
 * PhysicsAdapter implementation backed by Crashcat.
 *
 * Crashcat is a pure-JavaScript physics engine — no WASM, synchronous init.
 * Only dynamic and kinematic bodies are included in getTransforms() each frame.
 *
 * @see https://github.com/isaac-mason/crashcat
 */
export class CrashcatPhysicsAdapter implements PhysicsAdapter {
  private world!: World
  private dynamicBodies: { id: string; body: RigidBody }[] = []
  private bodyMap = new Map<string, RigidBody>()
  private manaBodyMap = new Map<string, ManaRigidBody>()
  /** Original motion type per body, used to restore after setEnabled(true). */
  private originalMotionType = new Map<string, MotionType>()
  /** Map from Crashcat BodyId to entity ID. */
  private bodyIdToEntity = new Map<number, string>()
  /** Map from entity ID to whether its collider is a sensor. */
  private sensorMap = new Map<string, boolean>()
  /** Set of currently active contact pairs (entityA:entityB, sorted). */
  private activeContacts = new Set<string>()
  private pendingCollisionEvents: CollisionEvent[] = []
  private staticLayer = 0
  private dynamicLayer = 1

  /** Create a rigid body for an entity and register it in all maps. */
  private _createBody(entity: SceneEntity, getInitialTransform: (id: string) => PhysicsTransform | null): void {
    const result = createCrashcatBody(
      entity,
      this.world,
      this.staticLayer,
      this.dynamicLayer,
      this.originalMotionType,
      getInitialTransform,
    )
    if (!result) return

    this.bodyMap.set(entity.id, result.body)
    this.originalMotionType.set(entity.id, result.motionType)
    this.manaBodyMap.set(entity.id, result.manaBody)
    this.bodyIdToEntity.set(result.body.id, entity.id)
    this.sensorMap.set(entity.id, result.isSensor)

    if (result.motionType !== MotionType.STATIC) {
      this.dynamicBodies.push({ id: entity.id, body: result.body })
    }
  }

  async init(sceneData: SceneData, getInitialTransform: (id: string) => PhysicsTransform | null): Promise<void> {
    const allEntities = flattenEntities(sceneData.entities)
    const hasPhysics = allEntities.some(e => e.rigidBody)
    if (!hasPhysics) return

    ensureRegistered()

    const settings = createWorldSettings()

    const bpLayer = addBroadphaseLayer(settings)
    const staticLayer = addObjectLayer(settings, bpLayer)
    const dynamicLayer = addObjectLayer(settings, bpLayer)
    enableCollision(settings, staticLayer, dynamicLayer)
    enableCollision(settings, dynamicLayer, dynamicLayer)

    this.staticLayer = staticLayer
    this.dynamicLayer = dynamicLayer
    this.world = createWorld(settings)

    for (const entity of allEntities) {
      this._createBody(entity, getInitialTransform)
    }
  }

  dispose(): void {
    // Crashcat has no explicit world.free() — just drop references
    this.dynamicBodies = []
    this.bodyMap.clear()
    this.manaBodyMap.clear()
    this.originalMotionType.clear()
    this.bodyIdToEntity.clear()
    this.sensorMap.clear()
    this.activeContacts.clear()
    this.pendingCollisionEvents = []
  }

  /** Make a sorted contact pair key from two entity IDs. */
  private _pairKey(a: string, b: string): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`
  }

  step(dt: number): void {
    if (!this.world) return

    const currentContacts = new Set<string>()

    updateWorld(
      this.world,
      {
        onContactAdded: (bodyA, bodyB) => {
          const entityA = this.bodyIdToEntity.get(bodyA.id)
          const entityB = this.bodyIdToEntity.get(bodyB.id)
          if (!entityA || !entityB) return
          const key = this._pairKey(entityA, entityB)
          currentContacts.add(key)
          if (!this.activeContacts.has(key)) {
            const sensorA = this.sensorMap.get(entityA) === true
            const sensorB = this.sensorMap.get(entityB) === true
            this.pendingCollisionEvents.push({
              entityIdA: entityA,
              entityIdB: entityB,
              started: true,
              sensor: sensorA || sensorB,
            })
          }
        },
        onContactPersisted: (bodyA, bodyB) => {
          const entityA = this.bodyIdToEntity.get(bodyA.id)
          const entityB = this.bodyIdToEntity.get(bodyB.id)
          if (!entityA || !entityB) return
          currentContacts.add(this._pairKey(entityA, entityB))
        },
        onContactRemoved: (bodyIdA, bodyIdB) => {
          const entityA = this.bodyIdToEntity.get(bodyIdA)
          const entityB = this.bodyIdToEntity.get(bodyIdB)
          if (!entityA || !entityB) return
          const key = this._pairKey(entityA, entityB)
          if (this.activeContacts.has(key)) {
            const sensorA = this.sensorMap.get(entityA) === true
            const sensorB = this.sensorMap.get(entityB) === true
            this.pendingCollisionEvents.push({
              entityIdA: entityA,
              entityIdB: entityB,
              started: false,
              sensor: sensorA || sensorB,
            })
          }
        },
      },
      dt,
    )

    this.activeContacts = currentContacts
  }

  getTransforms(): Map<string, PhysicsTransform> {
    const transforms = new Map<string, PhysicsTransform>()
    for (const { id, body } of this.dynamicBodies) {
      if (body.sleeping) continue
      const p = body.position
      const q = body.quaternion
      transforms.set(id, {
        position: [p[0], p[1], p[2]],
        quaternion: [q[0], q[1], q[2], q[3]],
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
    if (!entity.rigidBody || !this.world) return
    ensureRegistered()
    this._createBody(entity, getInitialTransform)
  }

  removeEntity(entityId: string): void {
    const body = this.bodyMap.get(entityId)
    if (body && this.world) {
      this.bodyIdToEntity.delete(body.id)
      rigidBody.remove(this.world, body)
    }
    this.bodyMap.delete(entityId)
    this.manaBodyMap.delete(entityId)
    this.originalMotionType.delete(entityId)
    this.sensorMap.delete(entityId)
    this.dynamicBodies = this.dynamicBodies.filter(e => e.id !== entityId)
  }
}
