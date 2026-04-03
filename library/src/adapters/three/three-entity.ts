import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import {
  AmbientLight,
  BoxGeometry,
  CameraHelper,
  CapsuleGeometry,
  DirectionalLight,
  DirectionalLightHelper,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  PointLightHelper,
  SphereGeometry,
  TextureLoader,
  type WebGPURenderer,
} from 'three/webgpu'

import { resolveAsset } from '../../assets.ts'

import type { ColliderData, MaterialData, SceneEntity, Transform } from '../../scene-data.ts'

export interface ThreeEntityMaps {
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
    case 'capsule':
      return new CapsuleGeometry()
    default:
      return new BoxGeometry()
  }
}

export function createColliderWireframe(collider: ColliderData): LineSegments {
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
const ktx2Loader = new KTX2Loader().setTranscoderPath('/__mana/basis/')

let ktx2DetectedSupport = false

function loadTexture(
  path: string,
  material: MeshLambertMaterial,
  slot: keyof MeshLambertMaterial,
  renderer?: WebGPURenderer,
) {
  const url = resolveAsset(path)
  if (path.endsWith('.ktx2')) {
    if (renderer && !ktx2DetectedSupport) {
      ktx2Loader.detectSupport(renderer)
      ktx2DetectedSupport = true
    }
    ktx2Loader.load(url, texture => {
      // biome-ignore lint: dynamic slot assignment
      ;(material as any)[slot] = texture
      material.needsUpdate = true
    })
  } else {
    // biome-ignore lint: dynamic slot assignment
    ;(material as any)[slot] = textureLoader.load(url)
  }
}

export function applyMaterialData(material: MeshLambertMaterial, mat?: MaterialData, renderer?: WebGPURenderer) {
  material.color.set(mat?.color ?? '#4488ff')
  if (!mat) return
  if (mat.map) loadTexture(mat.map, material, 'map', renderer)
  if (mat.emissiveMap) loadTexture(mat.emissiveMap, material, 'emissiveMap', renderer)
}

/** Apply a material override to all meshes in a model group — only overrides fields that are explicitly set. */
export function applyModelMaterialOverride(group: Group, mat: MaterialData, renderer?: WebGPURenderer) {
  group.traverse(child => {
    if (child instanceof Mesh && child.material instanceof MeshLambertMaterial) {
      const m = child.material
      if (mat.color) m.color.set(mat.color)
      if (mat.map) loadTexture(mat.map, m, 'map', renderer)
      if (mat.emissiveMap) loadTexture(mat.emissiveMap, m, 'emissiveMap', renderer)
    }
  })
}

function disposeMaterial(material: MeshLambertMaterial) {
  material.map?.dispose()
  material.emissiveMap?.dispose()
  material.dispose()
}

export function disposeEntityObject(obj: Object3D) {
  if (obj instanceof Mesh) {
    obj.geometry.dispose()
    if (obj.material instanceof MeshLambertMaterial) disposeMaterial(obj.material)
  } else if (obj instanceof Group) {
    obj.traverse(child => {
      if (child instanceof Mesh) {
        child.geometry.dispose()
        if (child.material instanceof MeshLambertMaterial) disposeMaterial(child.material)
      }
    })
  } else if (obj instanceof DirectionalLight) {
    obj.shadow?.map?.dispose()
    obj.dispose()
  } else if (obj instanceof PointLight) {
    obj.shadow?.map?.dispose()
    obj.dispose()
  } else if (obj instanceof AmbientLight) {
    obj.dispose()
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
export function createThreeEntityObject(
  entity: SceneEntity,
  scene: Object3D,
  maps: ThreeEntityMaps,
  options: {
    enableOrbitControls: boolean
    showGizmos: boolean
    renderer?: WebGPURenderer
    isYUp?: boolean
    onAnimationClips?: (entityId: string, clips: import('three/webgpu').AnimationClip[]) => void
  },
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
      // Only apply default lookAt when no rotation was authored in the scene data
      if (!entity.transform?.rotation) cam.lookAt(0, 0, 0)
      if (options.enableOrbitControls) scene.add(cam)
      obj = cam
      const camHelper = new CameraHelper(cam)
      camHelper.visible = options.showGizmos
      scene.add(camHelper)
      maps.gizmoHelpers.set(entity.id, camHelper)
      break
    }
    case 'mesh': {
      const geometry = createGeometry(entity.mesh?.geometry)
      // PlaneGeometry is created in XY (facing +Z). In Y-up scenes, rotate it
      // to lie in XZ (facing +Y) so it acts as a ground plane by default.
      if (entity.mesh?.geometry === 'plane' && options.isYUp !== false) {
        geometry.rotateX(-Math.PI / 2)
      }
      const material = new MeshLambertMaterial()
      applyMaterialData(material, entity.mesh?.material, options.renderer)
      const mesh = new Mesh(geometry, material)
      applyTransform(mesh, entity.transform)
      applyShadowProps(mesh, entity)
      scene.add(mesh)
      obj = mesh
      break
    }
    case 'model': {
      const group = new Group()
      applyTransform(group, entity.transform)
      scene.add(group)
      obj = group
      const modelSrc = entity.model?.src
      if (modelSrc) {
        import('three/examples/jsm/loaders/GLTFLoader.js')
          .then(({ GLTFLoader }) => {
            if (!group.parent) return
            const loader = new GLTFLoader()
            loader.load(
              resolveAsset(modelSrc),
              gltf => {
                if (!group.parent) return
                group.add(gltf.scene)
                if (entity.model?.material) {
                  applyModelMaterialOverride(group, entity.model.material, options.renderer)
                }
                applyShadowProps(group, entity)
                if (gltf.animations.length > 0) {
                  options.onAnimationClips?.(entity.id, gltf.animations)
                }
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
      scene.add(light)
      obj = light
      const dlHelper = new DirectionalLightHelper(light, 1)
      dlHelper.visible = options.showGizmos
      scene.add(dlHelper)
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
      scene.add(light)
      obj = light
      const plHelper = new PointLightHelper(light, 0.5)
      plHelper.visible = options.showGizmos
      scene.add(plHelper)
      maps.gizmoHelpers.set(entity.id, plHelper)
      break
    }
    case 'ambient-light': {
      const light = new AmbientLight(entity.light?.color ?? '#ffffff', entity.light?.intensity ?? 0.3)
      scene.add(light)
      obj = light
      break
    }
    case 'audio': {
      const audioGroup = new Group()
      applyTransform(audioGroup, entity.transform)
      scene.add(audioGroup)
      obj = audioGroup
      // Speaker icon helper — two concentric ring outlines around a small sphere
      const helperGroup = new Group()
      const helperMat = new LineBasicMaterial({ color: 0xe99444, depthTest: false })
      const center = new Mesh(new SphereGeometry(0.12, 8, 8), new MeshLambertMaterial({ color: 0xe99444 }))
      helperGroup.add(center)
      // Inner ring
      const innerRing = new LineSegments(new EdgesGeometry(new SphereGeometry(0.3, 16, 8)), helperMat)
      helperGroup.add(innerRing)
      // Outer ring
      const outerRing = new LineSegments(new EdgesGeometry(new SphereGeometry(0.5, 16, 8)), helperMat)
      helperGroup.add(outerRing)
      applyTransform(helperGroup, entity.transform)
      helperGroup.visible = options.showGizmos
      scene.add(helperGroup)
      maps.gizmoHelpers.set(entity.id, helperGroup)
      break
    }
  }

  if (obj) {
    if (entity.name) obj.name = entity.name
    maps.entityObjects.set(entity.id, obj)
  }

  if (entity.collider) {
    const wireframe = createColliderWireframe(entity.collider)
    if (obj) {
      wireframe.position.copy(obj.position)
      wireframe.rotation.copy(obj.rotation)
    }
    wireframe.visible = options.showGizmos
    scene.add(wireframe)
    maps.debugWireframes.set(entity.id, wireframe)
  }

  return obj
}
