import type { SceneData } from '../../scene-data.ts'
import type { ManaRigidBody, PhysicsAdapter, PhysicsTransform } from '../physics-adapter.ts'

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
  private dynamicEntities: { id: string; rigidBody: RapierRigidBody }[] = []
  private rigidBodyMap = new Map<string, RapierRigidBody>()

  async init(sceneData: SceneData, getInitialTransform: (id: string) => PhysicsTransform | null): Promise<void> {
    const hasPhysics = sceneData.entities.some(e => e.rigidBody)
    if (!hasPhysics) return

    const RAPIER = await import('@dimforge/rapier3d-compat')
    await RAPIER.init()
    this.RAPIER = RAPIER

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    for (const entity of sceneData.entities) {
      if (!entity.rigidBody) continue

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

      const rigidBody = this.world.createRigidBody(bodyDesc)

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
        this.world.createCollider(colliderDesc, rigidBody)
      }

      this.rigidBodyMap.set(entity.id, rigidBody)

      // Only track dynamic/kinematic bodies for transform readback
      if (entity.rigidBody.type !== 'fixed') {
        this.dynamicEntities.push({ id: entity.id, rigidBody })
      }
    }
  }

  dispose(): void {
    this.world?.free()
    this.dynamicEntities = []
    this.rigidBodyMap.clear()
  }

  step(_dt: number): void {
    this.world?.step()
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
    const body = this.rigidBodyMap.get(entityId)
    if (!body) return undefined
    // Rapier's RigidBody already matches ManaRigidBody — delegate directly.
    return {
      translation: () => body.translation(),
      linvel: () => body.linvel(),
      setTranslation: (pos, wake) => body.setTranslation(pos, wake),
      setLinvel: (vel, wake) => body.setLinvel(vel, wake),
    }
  }
}
