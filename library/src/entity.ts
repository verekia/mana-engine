import {
  AmbientLight,
  BoxGeometry,
  CameraHelper,
  CapsuleGeometry,
  CylinderGeometry,
  DirectionalLight,
  DirectionalLightHelper,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  PointLightHelper,
  type Scene,
  SphereGeometry,
  TextureLoader,
} from 'three/webgpu'

import type { ColliderData, MaterialData, SceneEntity, Transform } from './scene-data.ts'

export interface EntityMaps {
  entityObjects: Map<string, Object3D>
  debugWireframes: Map<string, LineSegments>
  gizmoHelpers: Map<string, Object3D>
}

export function applyTransform(obj: Object3D, transform?: Transform) {
  if (!transform) return
  if (transform.position) obj.position.set(...transform.position)
  if (transform.rotation) obj.rotation.set(...transform.rotation)
  if (transform.scale) obj.scale.set(...transform.scale)
}

export function snapshotTransform(obj: Object3D): Transform {
  return {
    position: [
      Math.round(obj.position.x * 1000) / 1000,
      Math.round(obj.position.y * 1000) / 1000,
      Math.round(obj.position.z * 1000) / 1000,
    ],
    rotation: [
      Math.round(obj.rotation.x * 1000) / 1000,
      Math.round(obj.rotation.y * 1000) / 1000,
      Math.round(obj.rotation.z * 1000) / 1000,
    ],
    scale: [
      Math.round(obj.scale.x * 1000) / 1000,
      Math.round(obj.scale.y * 1000) / 1000,
      Math.round(obj.scale.z * 1000) / 1000,
    ],
  }
}

function createGeometry(type?: string) {
  switch (type) {
    case 'sphere':
      return new SphereGeometry()
    case 'plane':
      return new PlaneGeometry()
    case 'cylinder':
      return new CylinderGeometry()
    case 'capsule':
      return new CapsuleGeometry()
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

const textureLoader = new TextureLoader()

export function applyMaterialData(material: MeshStandardMaterial, mat?: MaterialData) {
  material.color.set(mat?.color ?? '#4488ff')
  if (!mat) return
  if (mat.roughness !== undefined) material.roughness = mat.roughness
  if (mat.metalness !== undefined) material.metalness = mat.metalness
  if (mat.emissive) material.emissive.set(mat.emissive)
  if (mat.map) material.map = textureLoader.load(mat.map)
  if (mat.normalMap) material.normalMap = textureLoader.load(mat.normalMap)
  if (mat.roughnessMap) material.roughnessMap = textureLoader.load(mat.roughnessMap)
  if (mat.metalnessMap) material.metalnessMap = textureLoader.load(mat.metalnessMap)
  if (mat.emissiveMap) material.emissiveMap = textureLoader.load(mat.emissiveMap)
}

function disposeMaterial(material: MeshStandardMaterial) {
  material.map?.dispose()
  material.normalMap?.dispose()
  material.roughnessMap?.dispose()
  material.metalnessMap?.dispose()
  material.emissiveMap?.dispose()
  material.dispose()
}

export function disposeEntityObject(obj: Object3D) {
  if (obj instanceof Mesh) {
    obj.geometry.dispose()
    if (obj.material instanceof MeshStandardMaterial) disposeMaterial(obj.material)
  } else if (obj instanceof Group) {
    obj.traverse(child => {
      if (child instanceof Mesh) {
        child.geometry.dispose()
        if (child.material instanceof MeshStandardMaterial) disposeMaterial(child.material)
      }
    })
  }
}

export function applyShadowProps(obj: Object3D, entity: SceneEntity) {
  obj.traverse(child => {
    if (child instanceof Mesh) {
      if (entity.castShadow !== undefined) child.castShadow = entity.castShadow
      if (entity.receiveShadow !== undefined) child.receiveShadow = entity.receiveShadow
    }
  })
}

/** Creates a Three.js object from a scene entity and registers it in the entity maps. */
export function createEntityObject(
  entity: SceneEntity,
  threeScene: Scene,
  maps: EntityMaps,
  options: { enableOrbitControls: boolean; showGizmos: boolean },
): Object3D | null {
  let obj: Object3D | null = null

  switch (entity.type) {
    case 'camera': {
      const cam = new PerspectiveCamera(
        entity.camera?.fov ?? 50,
        1,
        entity.camera?.near ?? 0.1,
        entity.camera?.far ?? 100,
      )
      applyTransform(cam, entity.transform)
      cam.lookAt(0, 0, 0)
      if (options.enableOrbitControls) threeScene.add(cam)
      obj = cam
      // Camera helper
      const camHelper = new CameraHelper(cam)
      camHelper.visible = options.showGizmos
      threeScene.add(camHelper)
      maps.gizmoHelpers.set(entity.id, camHelper)
      break
    }
    case 'mesh': {
      const geometry = createGeometry(entity.mesh?.geometry)
      const material = new MeshStandardMaterial()
      applyMaterialData(material, entity.mesh?.material)
      const mesh = new Mesh(geometry, material)
      applyTransform(mesh, entity.transform)
      applyShadowProps(mesh, entity)
      threeScene.add(mesh)
      obj = mesh
      break
    }
    case 'model': {
      const group = new Group()
      applyTransform(group, entity.transform)
      threeScene.add(group)
      obj = group
      const modelSrc = entity.model?.src
      if (modelSrc) {
        import('three/examples/jsm/loaders/GLTFLoader.js')
          .then(({ GLTFLoader }) => {
            const loader = new GLTFLoader()
            loader.load(
              modelSrc,
              gltf => {
                group.add(gltf.scene)
                applyShadowProps(group, entity)
              },
              undefined,
              err => console.warn(`[mana] Failed to load model "${modelSrc}":`, err),
            )
          })
          .catch(err => console.warn('[mana] Failed to load GLTFLoader:', err))
      }
      break
    }
    case 'directional-light': {
      const light = new DirectionalLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 1)
      applyTransform(light, entity.transform)
      if (entity.light?.castShadow) {
        light.castShadow = true
        light.shadow.mapSize.width = 2048
        light.shadow.mapSize.height = 2048
        light.shadow.camera.near = 0.5
        light.shadow.camera.far = 50
        light.shadow.camera.left = -10
        light.shadow.camera.right = 10
        light.shadow.camera.top = 10
        light.shadow.camera.bottom = -10
      }
      threeScene.add(light)
      obj = light
      const dlHelper = new DirectionalLightHelper(light, 1)
      dlHelper.visible = options.showGizmos
      threeScene.add(dlHelper)
      maps.gizmoHelpers.set(entity.id, dlHelper)
      break
    }
    case 'point-light': {
      const light = new PointLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 1)
      applyTransform(light, entity.transform)
      if (entity.light?.castShadow) {
        light.castShadow = true
        light.shadow.mapSize.width = 1024
        light.shadow.mapSize.height = 1024
      }
      threeScene.add(light)
      obj = light
      const plHelper = new PointLightHelper(light, 0.5)
      plHelper.visible = options.showGizmos
      threeScene.add(plHelper)
      maps.gizmoHelpers.set(entity.id, plHelper)
      break
    }
    case 'ambient-light': {
      const light = new AmbientLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 0.3)
      threeScene.add(light)
      obj = light
      break
    }
  }

  if (obj) {
    maps.entityObjects.set(entity.id, obj)
  }

  // Collider wireframe
  if (entity.collider) {
    const wireframe = createColliderWireframe(entity.collider)
    if (obj) {
      wireframe.position.copy(obj.position)
      wireframe.rotation.copy(obj.rotation)
    }
    wireframe.visible = options.showGizmos
    threeScene.add(wireframe)
    maps.debugWireframes.set(entity.id, wireframe)
  }

  return obj
}
