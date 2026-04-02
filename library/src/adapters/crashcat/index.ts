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

import type { RigidBody, World } from 'crashcat'

import type { SceneData } from '../../scene-data.ts'
import type { ManaRigidBody, PhysicsAdapter, PhysicsTransform } from '../physics-adapter.ts'

// registerAll() is idempotent — safe to call multiple times
let registered = false
function ensureRegistered() {
  if (!registered) {
    registerAll()
    registered = true
  }
}

// Object layers for the two-tier broadphase
const BROADPHASE_LAYER = 0
const LAYER_STATIC = 0
const LAYER_DYNAMIC = 1

export type CrashcatRigidBody = RigidBody
export type CrashcatWorld = World

/**
 * Creates a ManaRigidBody wrapper around a Crashcat body.
 * This bridges the Crashcat functional API (rigidBody.setPosition(world, body, ...))
 * to the object-oriented ManaRigidBody interface (handle.setTranslation(pos, wake)).
 */
function createManaRigidBody(world: World, body: RigidBody): ManaRigidBody {
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
  }
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

  async init(sceneData: SceneData, getInitialTransform: (id: string) => PhysicsTransform | null): Promise<void> {
    const hasPhysics = sceneData.entities.some(e => e.rigidBody)
    if (!hasPhysics) return

    ensureRegistered()

    // ── World setup ────────────────────────────────────────────────────────────
    const settings = createWorldSettings()

    const bpLayer = addBroadphaseLayer(settings)
    const staticLayer = addObjectLayer(settings, bpLayer)
    const dynamicLayer = addObjectLayer(settings, bpLayer)
    enableCollision(settings, staticLayer, dynamicLayer)
    enableCollision(settings, dynamicLayer, dynamicLayer)

    // Silence TS — we want consistent named constants even if unused post-setup
    void BROADPHASE_LAYER
    void LAYER_STATIC
    void LAYER_DYNAMIC

    this.world = createWorld(settings)

    // ── Entity bodies ──────────────────────────────────────────────────────────
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

      // ── Motion type ────────────────────────────────────────────────────────
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

      // ── DOF / rotation lock ────────────────────────────────────────────────
      let allowedDOF: number | undefined
      if (entity.rigidBody.lockRotation) {
        const [lx, ly, lz] = entity.rigidBody.lockRotation
        allowedDOF = dof(true, true, true, !lx, !ly, !lz)
      }

      // ── Shape ──────────────────────────────────────────────────────────────
      let shape:
        | ReturnType<typeof box.create>
        | ReturnType<typeof sphere.create>
        | ReturnType<typeof capsule.create>
        | null = null

      if (entity.collider) {
        switch (entity.collider.shape) {
          case 'sphere':
            shape = sphere.create({ radius: entity.collider.radius ?? 0.5 })
            break
          case 'capsule': {
            // Crashcat uses halfHeightOfCylinder (the straight section only)
            // our ColliderData.halfHeight is already the half-height of the cylinder
            shape = capsule.create({
              halfHeightOfCylinder: entity.collider.halfHeight ?? 0.5,
              radius: entity.collider.radius ?? 0.5,
            })
            break
          }
          default: {
            const he = entity.collider.halfExtents ?? [0.5, 0.5, 0.5]
            shape = box.create({ halfExtents: [he[0], he[1], he[2]] })
          }
        }
      } else {
        // No collider specified — use a unit box as a default shape
        shape = box.create({ halfExtents: [0.5, 0.5, 0.5] })
      }

      // ── Create body ────────────────────────────────────────────────────────
      const body = rigidBody.create(this.world, {
        shape,
        motionType,
        objectLayer,
        position: [px, py, pz],
        quaternion: [qx, qy, qz, qw],
        ...(allowedDOF !== undefined ? { allowedDegreesOfFreedom: allowedDOF } : {}),
      })

      this.bodyMap.set(entity.id, body)
      this.manaBodyMap.set(entity.id, createManaRigidBody(this.world, body))

      if (motionType !== MotionType.STATIC) {
        this.dynamicBodies.push({ id: entity.id, body })
      }
    }
  }

  dispose(): void {
    // Crashcat has no explicit world.free() — just drop references
    this.dynamicBodies = []
    this.bodyMap.clear()
    this.manaBodyMap.clear()
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
}
