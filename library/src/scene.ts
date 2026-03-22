import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three'

import type { SceneData, SceneEntity, Transform } from './scene-data.ts'

export interface ManaScene {
  dispose(): void
  updateEntity(id: string, entity: SceneEntity): void
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

export function createScene(canvas: HTMLCanvasElement, sceneData?: SceneData): ManaScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)

  const scene = new Scene()
  scene.background = new Color(sceneData?.background ?? '#111111')

  const entityObjects = new Map<string, Object3D>()

  let cam: PerspectiveCamera | null = null

  if (sceneData) {
    for (const entity of sceneData.entities) {
      switch (entity.type) {
        case 'camera': {
          cam = new PerspectiveCamera(
            entity.camera?.fov ?? 50,
            1,
            entity.camera?.near ?? 0.1,
            entity.camera?.far ?? 100,
          )
          applyTransform(cam, entity.transform)
          cam.lookAt(0, 0, 0)
          entityObjects.set(entity.id, cam)
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
    }
  }

  if (!cam) {
    cam = new PerspectiveCamera(50, 1, 0.1, 100)
    cam.position.set(0, 1, 3)
    cam.lookAt(0, 0, 0)
  }

  const camera = cam

  let animationId = 0

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
    renderer.render(scene, camera)
  }

  animate()

  return {
    dispose() {
      cancelAnimationFrame(animationId)
      observer.disconnect()
      renderer.dispose()
      for (const obj of entityObjects.values()) {
        if (obj instanceof Mesh) {
          obj.geometry.dispose()
          if (obj.material instanceof MeshStandardMaterial) {
            obj.material.dispose()
          }
        }
      }
    },
    updateEntity(id: string, entity: SceneEntity) {
      const obj = entityObjects.get(id)
      if (!obj) return
      applyTransform(obj, entity.transform)
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
