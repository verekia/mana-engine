import type { Object3D } from 'three/webgpu'

import type { SceneData } from './scene-data.ts'
import type { RapierModule, RapierRigidBody } from './scene.ts'

export interface PhysicsState {
  RAPIER: RapierModule
  world: InstanceType<RapierModule['World']>
  physicsEntities: { rigidBody: RapierRigidBody; entityObj: Object3D }[]
  rigidBodyMap: Map<string, RapierRigidBody>
}

export async function setupPhysics(
  sceneData: SceneData,
  entityObjects: Map<string, Object3D>,
): Promise<PhysicsState | null> {
  const hasPhysics = sceneData.entities.some(e => e.rigidBody)
  if (!hasPhysics) return null

  const RAPIER = await import('@dimforge/rapier3d-compat')
  await RAPIER.init()

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const physicsEntities: PhysicsState['physicsEntities'] = []
  const rigidBodyMap = new Map<string, RapierRigidBody>()

  for (const entity of sceneData.entities) {
    if (!entity.rigidBody) continue
    const obj = entityObjects.get(entity.id)
    if (!obj) continue

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

    bodyDesc.setTranslation(obj.position.x, obj.position.y, obj.position.z)
    bodyDesc.setRotation({ x: obj.quaternion.x, y: obj.quaternion.y, z: obj.quaternion.z, w: obj.quaternion.w })

    if (entity.rigidBody.lockRotation) {
      const [lx, ly, lz] = entity.rigidBody.lockRotation
      bodyDesc.enabledRotations(!lx, !ly, !lz)
    }

    const rigidBody = world.createRigidBody(bodyDesc)

    if (entity.collider) {
      let colliderDesc: InstanceType<RapierModule['ColliderDesc']>
      switch (entity.collider.shape) {
        case 'sphere':
          colliderDesc = RAPIER.ColliderDesc.ball(entity.collider.radius ?? 0.5)
          break
        case 'capsule':
          colliderDesc = RAPIER.ColliderDesc.capsule(entity.collider.halfHeight ?? 0.5, entity.collider.radius ?? 0.5)
          break
        case 'cylinder':
          colliderDesc = RAPIER.ColliderDesc.cylinder(entity.collider.halfHeight ?? 0.5, entity.collider.radius ?? 0.5)
          break
        case 'plane': {
          const he = entity.collider.halfExtents ?? [5, 0.01, 5]
          colliderDesc = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2])
          break
        }
        default: {
          const he = entity.collider.halfExtents ?? [0.5, 0.5, 0.5]
          colliderDesc = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2])
        }
      }
      world.createCollider(colliderDesc, rigidBody)
    }

    physicsEntities.push({ rigidBody, entityObj: obj })
    rigidBodyMap.set(entity.id, rigidBody)
  }

  return { RAPIER, world, physicsEntities, rigidBodyMap }
}
