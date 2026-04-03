import {
  addBroadphaseLayer,
  addObjectLayer,
  box,
  capsule,
  createWorld,
  createWorldSettings,
  dof,
  enableCollision,
  MotionType,
  registerAll,
  rigidBody,
  sphere,
  updateWorld,
} from 'crashcat'

import { flattenEntities } from '../../scene-data.ts'

import type { RigidBody, World } from 'crashcat'

import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { ManaRigidBody, PhysicsAdapter, PhysicsTransform } from '../physics-adapter.ts'

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
 * Creates a ManaRigidBody wrapper around a Crashcat body.
 * This bridges the Crashcat functional API (rigidBody.setPosition(world, body, ...))
 * to the object-oriented ManaRigidBody interface (handle.setTranslation(pos, wake)).
 */
function createManaRigidBody(
  world: World,
  body: RigidBody,
  entityId: string,
  originalMotionTypes: Map<string, MotionType>,
): ManaRigidBody {
  return {
    translation() {
      return { x: body.position[0], y: body.position[1], z: body.position[2] }
    },
    linvel() {
      const v = body.motionProperties.linearVelocity
      return { x: v[0], y: v[1], z: v[2] }
    },
    setTranslation(pos, wake) {
      rigidBody.setPosition(world, body, [pos.x, pos.y, pos.z], wake)
    },
    setLinvel(vel, _wake) {
      rigidBody.setLinearVelocity(world, body, [vel.x, vel.y, vel.z])
    },
    angvel() {
      const v = body.motionProperties.angularVelocity
      return { x: v[0], y: v[1], z: v[2] }
    },
    setAngvel(vel, _wake) {
      rigidBody.setAngularVelocity(world, body, [vel.x, vel.y, vel.z])
    },
    rotation() {
      const q = body.quaternion
      return { x: q[0], y: q[1], z: q[2], w: q[3] }
    },
    setRotation(quat, wake) {
      rigidBody.setQuaternion(world, body, [quat.x, quat.y, quat.z, quat.w], wake)
    },
    applyImpulse(impulse) {
      rigidBody.addImpulse(world, body, [impulse.x, impulse.y, impulse.z])
    },
    applyForce(force) {
      rigidBody.addForce(world, body, [force.x, force.y, force.z], true)
    },
    mass() {
      return body.massProperties.mass
    },
    setEnabled(enabled) {
      if (enabled) {
        const original = originalMotionTypes.get(entityId) ?? MotionType.DYNAMIC
        rigidBody.setMotionType(world, body, original, true)
      } else {
        rigidBody.setMotionType(world, body, MotionType.STATIC, false)
      }
    },
  }
}

/** Create a Crashcat shape from collider data, falling back to a unit box. */
function createShape(entity: SceneEntity) {
  if (entity.collider) {
    switch (entity.collider.shape) {
      case 'sphere':
        return sphere.create({ radius: entity.collider.radius ?? 0.5 })
      case 'capsule':
        return capsule.create({
          halfHeightOfCylinder: entity.collider.halfHeight ?? 0.5,
          radius: entity.collider.radius ?? 0.5,
        })
      default: {
        const he = entity.collider.halfExtents ?? [0.5, 0.5, 0.5]
        return box.create({ halfExtents: [he[0], he[1], he[2]] })
      }
    }
  }
  return box.create({ halfExtents: [0.5, 0.5, 0.5] })
}

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
  private staticLayer = 0
  private dynamicLayer = 1

  /** Create a rigid body for an entity and register it in all maps. */
  private _createBody(entity: SceneEntity, getInitialTransform: (id: string) => PhysicsTransform | null): void {
    if (!entity.rigidBody) return

    const initial = getInitialTransform(entity.id)
    const px = initial?.position[0] ?? 0
    const py = initial?.position[1] ?? 0
    const pz = initial?.position[2] ?? 0
    const qx = initial?.quaternion[0] ?? 0
    const qy = initial?.quaternion[1] ?? 0
    const qz = initial?.quaternion[2] ?? 0
    const qw = initial?.quaternion[3] ?? 1

    let motionType: MotionType
    let objectLayer: number
    switch (entity.rigidBody.type) {
      case 'fixed':
        motionType = MotionType.STATIC
        objectLayer = this.staticLayer
        break
      case 'kinematic':
        motionType = MotionType.KINEMATIC
        objectLayer = this.dynamicLayer
        break
      default:
        motionType = MotionType.DYNAMIC
        objectLayer = this.dynamicLayer
    }

    let allowedDOF: number | undefined
    if (entity.rigidBody.lockRotation) {
      const [lx, ly, lz] = entity.rigidBody.lockRotation
      allowedDOF = dof(true, true, true, !lx, !ly, !lz)
    }

    const body = rigidBody.create(this.world, {
      shape: createShape(entity),
      motionType,
      objectLayer,
      position: [px, py, pz],
      quaternion: [qx, qy, qz, qw],
      ...(allowedDOF !== undefined ? { allowedDegreesOfFreedom: allowedDOF } : {}),
    })

    this.bodyMap.set(entity.id, body)
    this.originalMotionType.set(entity.id, motionType)
    this.manaBodyMap.set(entity.id, createManaRigidBody(this.world, body, entity.id, this.originalMotionType))

    if (motionType !== MotionType.STATIC) {
      this.dynamicBodies.push({ id: entity.id, body })
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
  }

  step(dt: number): void {
    if (!this.world) return
    updateWorld(this.world, undefined, dt)
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

  addEntity(entity: SceneEntity, getInitialTransform: (id: string) => PhysicsTransform | null): void {
    if (!entity.rigidBody || !this.world) return
    ensureRegistered()
    this._createBody(entity, getInitialTransform)
  }

  removeEntity(entityId: string): void {
    const body = this.bodyMap.get(entityId)
    if (body && this.world) {
      rigidBody.remove(this.world, body)
    }
    this.bodyMap.delete(entityId)
    this.manaBodyMap.delete(entityId)
    this.originalMotionType.delete(entityId)
    this.dynamicBodies = this.dynamicBodies.filter(e => e.id !== entityId)
  }
}
