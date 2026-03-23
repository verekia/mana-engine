import {
  AmbientLight,
  BoxGeometry,
  CameraHelper,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DirectionalLightHelper,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three'

import type { ColliderData, SceneData, SceneEntity, Transform } from './scene-data.ts'
import type { ManaScript } from './script.ts'

export interface ManaScene {
  dispose(): void
  updateEntity(id: string, entity: SceneEntity): void
  setGizmos(enabled: boolean): void
}

export interface CreateSceneOptions {
  scripts?: Record<string, ManaScript>
  debugPhysics?: boolean
  orbitControls?: boolean
}

function applyTransform(obj: Object3D, transform?: Transform) {
  if (!transform) return
  if (transform.position) obj.position.set(...transform.position)
  if (transform.rotation) obj.rotation.set(...transform.rotation)
  if (transform.scale) obj.scale.set(...transform.scale)
}

function createGeometry(type?: string) {
  switch (type) {
    case 'sphere':
      return new SphereGeometry()
    case 'plane':
      return new PlaneGeometry()
    case 'cylinder':
      return new CylinderGeometry()
    default:
      return new BoxGeometry()
  }
}

function createColliderWireframe(collider: ColliderData): LineSegments {
  let geometry: EdgesGeometry
  switch (collider.shape) {
    case 'sphere': {
      const r = collider.radius ?? 0.5
      geometry = new EdgesGeometry(new SphereGeometry(r, 16, 12))
      break
    }
    case 'capsule': {
      const r = collider.radius ?? 0.5
      const hh = collider.halfHeight ?? 0.5
      geometry = new EdgesGeometry(new CapsuleGeometry(r, hh * 2, 8, 16))
      break
    }
    case 'cylinder': {
      const r = collider.radius ?? 0.5
      const hh = collider.halfHeight ?? 0.5
      geometry = new EdgesGeometry(new CylinderGeometry(r, r, hh * 2, 16))
      break
    }
    default: {
      const he = collider.halfExtents ?? [0.5, 0.5, 0.5]
      geometry = new EdgesGeometry(new BoxGeometry(he[0] * 2, he[1] * 2, he[2] * 2))
      break
    }
  }
  const material = new LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 })
  return new LineSegments(geometry, material)
}

const FIXED_DT = 1 / 60
const rendererCache = new WeakMap<HTMLCanvasElement, WebGLRenderer>()

function getOrCreateRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  let renderer = rendererCache.get(canvas)
  if (!renderer) {
    renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    rendererCache.set(canvas, renderer)
  }
  return renderer
}

export async function createScene(
  canvas: HTMLCanvasElement,
  sceneData?: SceneData,
  options?: CreateSceneOptions,
): Promise<ManaScene> {
  const scriptDefs = options?.scripts
  const debugPhysics = options?.debugPhysics ?? false
  const enableOrbitControls = options?.orbitControls ?? false

  const renderer = getOrCreateRenderer(canvas)

  const scene = new Scene()
  scene.background = new Color(sceneData?.background ?? '#111111')

  const entityObjects = new Map<string, Object3D>()
  const debugWireframes = new Map<string, LineSegments>()
  const gizmoHelpers: Object3D[] = []

  let gameCam: PerspectiveCamera | null = null

  if (sceneData) {
    for (const entity of sceneData.entities) {
      switch (entity.type) {
        case 'camera': {
          gameCam = new PerspectiveCamera(
            entity.camera?.fov ?? 50,
            1,
            entity.camera?.near ?? 0.1,
            entity.camera?.far ?? 100,
          )
          applyTransform(gameCam, entity.transform)
          gameCam.lookAt(0, 0, 0)
          // In edit mode, add the game camera to the scene so it's visible
          if (enableOrbitControls) {
            scene.add(gameCam)
          }
          entityObjects.set(entity.id, gameCam)
          break
        }
        case 'mesh': {
          const geometry = createGeometry(entity.mesh?.geometry)
          const material = new MeshStandardMaterial({
            color: entity.mesh?.material?.color ?? '#4488ff',
          })
          const mesh = new Mesh(geometry, material)
          applyTransform(mesh, entity.transform)
          scene.add(mesh)
          entityObjects.set(entity.id, mesh)
          break
        }
        case 'directional-light': {
          const light = new DirectionalLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 1)
          applyTransform(light, entity.transform)
          scene.add(light)
          entityObjects.set(entity.id, light)
          break
        }
        case 'ambient-light': {
          const light = new AmbientLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 0.3)
          scene.add(light)
          entityObjects.set(entity.id, light)
          break
        }
      }

      // Debug collider wireframes (created for all colliders, visibility toggled)
      if (entity.collider) {
        const wireframe = createColliderWireframe(entity.collider)
        const obj = entityObjects.get(entity.id)
        if (obj) {
          wireframe.position.copy(obj.position)
          wireframe.rotation.copy(obj.rotation)
        }
        wireframe.visible = debugPhysics
        scene.add(wireframe)
        debugWireframes.set(entity.id, wireframe)
      }

      // Gizmo helpers for cameras and lights
      if (entity.type === 'camera' && gameCam) {
        const helper = new CameraHelper(gameCam)
        helper.visible = debugPhysics
        scene.add(helper)
        gizmoHelpers.push(helper)
      }
      if (entity.type === 'directional-light') {
        const obj = entityObjects.get(entity.id) as DirectionalLight
        const helper = new DirectionalLightHelper(obj, 1)
        helper.visible = debugPhysics
        scene.add(helper)
        gizmoHelpers.push(helper)
      }
    }
  }

  if (!gameCam) {
    gameCam = new PerspectiveCamera(50, 1, 0.1, 100)
    gameCam.position.set(0, 1, 3)
    gameCam.lookAt(0, 0, 0)
  }

  // In edit mode, use a separate editor camera for the viewport.
  // The game camera entity is visible in the scene with its helper.
  // In play mode, use the game camera directly.
  let camera: PerspectiveCamera
  let controls: { update(): void; dispose(): void } | null = null

  if (enableOrbitControls) {
    camera = new PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(5, 5, 10)
    camera.lookAt(0, 0, 0)
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
    controls = new OrbitControls(camera, canvas)
  } else {
    camera = gameCam
  }

  // Ensure renderer and camera match current canvas size
  const initW = canvas.clientWidth
  const initH = canvas.clientHeight
  if (initW > 0 && initH > 0) {
    renderer.setSize(initW, initH, false)
    camera.aspect = initW / initH
    camera.updateProjectionMatrix()
  }

  // Physics setup
  type RapierModule = typeof import('@dimforge/rapier3d-compat')
  let RAPIER: RapierModule | null = null
  let world: InstanceType<RapierModule['World']> | null = null
  const physicsEntities: {
    rigidBody: InstanceType<RapierModule['RigidBody']>
    entityObj: Object3D
  }[] = []
  // biome-ignore lint: rapier types are dynamically imported
  const rigidBodyMap = new Map<string, any>()

  const hasPhysics = sceneData?.entities.some(e => e.rigidBody) ?? false

  if (hasPhysics && sceneData) {
    RAPIER = await import('@dimforge/rapier3d-compat')
    await RAPIER.init()

    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

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
            colliderDesc = RAPIER.ColliderDesc.cylinder(
              entity.collider.halfHeight ?? 0.5,
              entity.collider.radius ?? 0.5,
            )
            break
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
  }

  // Script setup
  // biome-ignore lint: rapier types are dynamically imported
  const activeScripts: { script: ManaScript; entityObj: Object3D; rb?: any }[] = []

  if (sceneData && scriptDefs) {
    for (const entity of sceneData.entities) {
      if (!entity.scripts) continue
      const obj = entityObjects.get(entity.id)
      if (!obj) continue
      const rb = rigidBodyMap.get(entity.id)
      for (const name of entity.scripts) {
        const script = scriptDefs[name]
        if (script) {
          activeScripts.push({ script, entityObj: obj, rb })
        }
      }
    }
  }

  for (const { script, entityObj, rb } of activeScripts) {
    script.init?.({ entity: entityObj, scene, dt: 0, time: 0, rigidBody: rb })
  }

  let animationId = 0
  let lastTime = performance.now() / 1000
  let elapsed = 0
  let fixedAccumulator = 0

  const observer = new ResizeObserver(() => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }
  })
  observer.observe(canvas)

  function animate() {
    animationId = requestAnimationFrame(animate)

    const now = performance.now() / 1000
    const dt = Math.min(now - lastTime, 0.1)
    lastTime = now
    elapsed += dt

    // Fixed update
    fixedAccumulator += dt
    while (fixedAccumulator >= FIXED_DT) {
      // Step physics (only in game mode, not edit mode)
      if (scriptDefs) world?.step()

      for (const { script, entityObj, rb } of activeScripts) {
        script.fixedUpdate?.({ entity: entityObj, scene, dt: FIXED_DT, time: elapsed, rigidBody: rb })
      }
      fixedAccumulator -= FIXED_DT
    }

    // Sync physics transforms to Three.js (only in game mode)
    if (scriptDefs) {
      for (const { rigidBody, entityObj } of physicsEntities) {
        const pos = rigidBody.translation()
        const rot = rigidBody.rotation()
        entityObj.position.set(pos.x, pos.y, pos.z)
        entityObj.quaternion.set(rot.x, rot.y, rot.z, rot.w)
      }
    }

    // Update scripts
    for (const { script, entityObj, rb } of activeScripts) {
      script.update?.({ entity: entityObj, scene, dt, time: elapsed, rigidBody: rb })
    }

    controls?.update()
    renderer.render(scene, camera)
  }

  animate()

  return {
    dispose() {
      cancelAnimationFrame(animationId)
      observer.disconnect()
      controls?.dispose()
      for (const { script } of activeScripts) {
        script.dispose?.()
      }
      world?.free()
      for (const wireframe of debugWireframes.values()) {
        wireframe.geometry.dispose()
        ;(wireframe.material as LineBasicMaterial).dispose()
        scene.remove(wireframe)
      }
      for (const helper of gizmoHelpers) {
        scene.remove(helper)
      }
      for (const obj of entityObjects.values()) {
        if (obj instanceof Mesh) {
          obj.geometry.dispose()
          if (obj.material instanceof MeshStandardMaterial) {
            obj.material.dispose()
          }
        }
      }
    },
    setGizmos(enabled: boolean) {
      for (const wireframe of debugWireframes.values()) {
        wireframe.visible = enabled
      }
      for (const helper of gizmoHelpers) {
        helper.visible = enabled
      }
    },
    updateEntity(id: string, entity: SceneEntity) {
      const obj = entityObjects.get(id)
      if (!obj) return
      applyTransform(obj, entity.transform)
      // Sync debug wireframe position
      const wireframe = debugWireframes.get(id)
      if (wireframe) {
        wireframe.position.copy(obj.position)
        wireframe.rotation.copy(obj.rotation)
      }
      if (entity.type === 'mesh' && obj instanceof Mesh && entity.mesh?.material?.color) {
        ;(obj.material as MeshStandardMaterial).color.set(entity.mesh.material.color)
      }
      if (
        (entity.type === 'directional-light' || entity.type === 'ambient-light') &&
        (obj instanceof DirectionalLight || obj instanceof AmbientLight)
      ) {
        if (entity.light?.color) obj.color.set(entity.light.color)
        if (entity.light?.intensity !== undefined) obj.intensity = entity.light.intensity
      }
    },
  }
}
