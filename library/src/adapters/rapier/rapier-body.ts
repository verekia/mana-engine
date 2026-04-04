import type { SceneEntity } from '../../scene-data.ts'
import type { ManaRigidBody, PhysicsTransform } from '../physics-adapter.ts'
import type { RapierModule, RapierRigidBody } from './index.ts'

/** Create a ManaRigidBody wrapper around a Rapier rigid body. */
export function createManaRigidBody(rb: RapierRigidBody): ManaRigidBody {
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

export interface RapierBodyResult {
  rigidBody: RapierRigidBody
  manaBody: ManaRigidBody
  colliderHandles: number[]
  isSensor: boolean
  isDynamic: boolean
}

/**
 * Create a Rapier rigid body + collider for an entity.
 * Returns all the data needed to register the body in the adapter's maps.
 */
export function createRapierBody(
  entity: SceneEntity,
  world: InstanceType<RapierModule['World']>,
  RAPIER: RapierModule,
  getInitialTransform: (id: string) => PhysicsTransform | null,
): RapierBodyResult | null {
  if (!entity.rigidBody) return null

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

  const rb = world.createRigidBody(bodyDesc)

  const colliderHandles: number[] = []
  let isSensor = false

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
    if (entity.collider.friction !== undefined) {
      colliderDesc.setFriction(entity.collider.friction)
    }
    if (entity.collider.restitution !== undefined) {
      colliderDesc.setRestitution(entity.collider.restitution)
    }
    isSensor = entity.collider.sensor === true
    if (isSensor) {
      colliderDesc.setSensor(true)
    }
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
    const collider = world.createCollider(colliderDesc, rb)
    colliderHandles.push(collider.handle)
  }

  const manaBody = createManaRigidBody(rb)
  const isDynamic = entity.rigidBody.type !== 'fixed'

  return { rigidBody: rb, manaBody, colliderHandles, isSensor, isDynamic }
}
