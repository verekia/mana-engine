import { box, capsule, dof, MotionType, rigidBody, sphere } from 'crashcat'

import type { RigidBody, World } from 'crashcat'

import type { SceneEntity } from '../../scene-data.ts'
import type { ManaRigidBody, PhysicsTransform } from '../physics-adapter.ts'

/** Create a ManaRigidBody wrapper around a Crashcat body. */
export function createManaRigidBody(
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
export function createShape(entity: SceneEntity) {
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

export interface CrashcatBodyResult {
  body: RigidBody
  manaBody: ManaRigidBody
  motionType: MotionType
  isSensor: boolean
}

/**
 * Create a Crashcat rigid body for an entity.
 * Returns all the data needed to register the body in the adapter's maps.
 */
export function createCrashcatBody(
  entity: SceneEntity,
  world: World,
  staticLayer: number,
  dynamicLayer: number,
  originalMotionTypes: Map<string, MotionType>,
  getInitialTransform: (id: string) => PhysicsTransform | null,
): CrashcatBodyResult | null {
  if (!entity.rigidBody) return null

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
      objectLayer = staticLayer
      break
    case 'kinematic':
      motionType = MotionType.KINEMATIC
      objectLayer = dynamicLayer
      break
    default:
      motionType = MotionType.DYNAMIC
      objectLayer = dynamicLayer
  }

  let allowedDOF: number | undefined
  if (entity.rigidBody.lockRotation) {
    const [lx, ly, lz] = entity.rigidBody.lockRotation
    allowedDOF = dof(true, true, true, !lx, !ly, !lz)
  }

  const body = rigidBody.create(world, {
    shape: createShape(entity),
    motionType,
    objectLayer,
    position: [px, py, pz],
    quaternion: [qx, qy, qz, qw],
    ...(allowedDOF !== undefined ? { allowedDegreesOfFreedom: allowedDOF } : {}),
  })

  if (entity.collider?.friction !== undefined) {
    body.friction = entity.collider.friction
  }
  if (entity.collider?.restitution !== undefined) {
    body.restitution = entity.collider.restitution
  }

  const manaBody = createManaRigidBody(world, body, entity.id, originalMotionTypes)
  const isSensor = entity.collider?.sensor === true

  return { body, manaBody, motionType, isSensor }
}
