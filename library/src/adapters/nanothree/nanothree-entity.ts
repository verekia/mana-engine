import {
  AmbientLight,
  BoxGeometry,
  CameraHelper,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DirectionalLightHelper,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  SphereGeometry,
} from '../../nanothree/index.ts'
import { applyTransform, createColliderWireframe, hexToColor } from './nanothree-utils.ts'

import type { SceneEntity } from '../../scene-data.ts'

/** Shared state passed from the adapter to entity creation functions. */
export interface NanothreeEntityState {
  entityObjects: Map<string, Object3D>
  scene: import('../../nanothree/index.ts').Scene
  enableOrbitControls: boolean
  showGizmos: boolean
  gameCam: PerspectiveCamera | null
  setGameCam: (cam: PerspectiveCamera) => void
  debugWireframes: Map<string, Object3D>
  lightHelpers: Map<string, DirectionalLightHelper | CameraHelper>
}

/**
 * Create a nanothree entity from a SceneEntity definition and add it to the parent.
 * Nanothree supports: box geometry, Lambert material, ambient + directional lights, shadows.
 * Unsupported entity types (model, particles, audio, point-light) get an empty Group placeholder.
 */
export function createNanothreeEntity(entity: SceneEntity, parent: Object3D, state: NanothreeEntityState): void {
  let obj: Object3D | null = null

  switch (entity.type) {
    case 'camera': {
      const cam = new PerspectiveCamera(
        entity.camera?.fov ?? 50,
        1,
        entity.camera?.near ?? 0.1,
        entity.camera?.far ?? 1000,
      )
      applyTransform(cam, entity.transform)
      if (entity.transform?.position) {
        // Default lookAt origin unless we have a rotation
        if (
          !entity.transform.rotation ||
          (entity.transform.rotation[0] === 0 &&
            entity.transform.rotation[1] === 0 &&
            entity.transform.rotation[2] === 0)
        ) {
          cam.lookAt(0, 0, 0)
        }
      }
      parent.add(cam)
      state.entityObjects.set(entity.id, cam)
      if (!state.gameCam) state.setGameCam(cam)

      // Camera helper gizmo (editor mode only)
      if (state.enableOrbitControls) {
        const helper = new CameraHelper(cam)
        helper.visible = state.showGizmos
        if (entity.transform?.position) {
          helper.setPosition(entity.transform.position[0], entity.transform.position[1], entity.transform.position[2])
        }
        if (entity.transform?.rotation) {
          helper.setRotation(entity.transform.rotation[0], entity.transform.rotation[1], entity.transform.rotation[2])
        }
        helper.addToScene(state.scene)
        state.lightHelpers.set(entity.id, helper)
      }
      return
    }

    case 'mesh': {
      const geomType = entity.mesh?.geometry
      if (!geomType) {
        obj = new Group()
        break
      }
      let geometry
      switch (geomType) {
        case 'sphere':
          geometry = new SphereGeometry()
          break
        case 'capsule':
          geometry = new CapsuleGeometry()
          break
        case 'plane':
          geometry = new CircleGeometry(1, 32)
          break
        default:
          geometry = new BoxGeometry()
          break
      }
      const color = entity.mesh?.material?.color ? hexToColor(entity.mesh.material.color) : new Color(0x4a9eff)
      const material = new MeshLambertMaterial({ color })
      const mesh = new Mesh(geometry, material)
      mesh.castShadow = entity.castShadow ?? false
      mesh.receiveShadow = entity.receiveShadow ?? false
      obj = mesh
      break
    }

    case 'model': {
      // No GLTF support — create an empty Group placeholder
      obj = new Group()
      break
    }

    case 'directional-light': {
      const color = entity.light?.color ? hexToColor(entity.light.color) : new Color(0xffffff)
      const light = new DirectionalLight(color, entity.light?.intensity ?? 1)
      if (entity.light?.castShadow) {
        // Enable shadow map on renderer side
        light.shadow.mapSize.set(2048, 2048)
      }
      obj = light

      // Light helper gizmo (editor mode only)
      if (state.enableOrbitControls) {
        const helper = new DirectionalLightHelper(light)
        helper.visible = state.showGizmos
        helper.addToScene(state.scene)
        state.lightHelpers.set(entity.id, helper)
      }
      break
    }

    case 'ambient-light': {
      const color = entity.light?.color ? hexToColor(entity.light.color) : new Color(0xffffff)
      const light = new AmbientLight(color, entity.light?.intensity ?? 0.3)
      obj = light
      break
    }

    case 'point-light':
    case 'particles': {
      // Not supported — empty Group placeholder
      obj = new Group()
      break
    }

    case 'ui':
    case 'ui-group':
    case 'audio': {
      // Non-visual entities — skip
      return
    }
  }

  if (!obj) return

  applyTransform(obj, entity.transform)
  parent.add(obj)
  state.entityObjects.set(entity.id, obj)

  // Collider wireframe (editor mode only)
  if (entity.collider && state.enableOrbitControls) {
    const wireframe = createColliderWireframe(entity.collider)
    wireframe.visible = state.showGizmos
    applyTransform(
      wireframe,
      entity.transform && { position: entity.transform.position, rotation: entity.transform.rotation },
    )
    parent.add(wireframe)
    state.debugWireframes.set(entity.id, wireframe)
  }
}

/** Update an existing entity's transform and visual properties. */
export function updateNanothreeEntity(
  id: string,
  entity: SceneEntity,
  entityObjects: Map<string, Object3D>,
  debugWireframes: Map<string, Object3D>,
  lightHelpers: Map<string, DirectionalLightHelper | CameraHelper>,
): void {
  const obj = entityObjects.get(id)
  if (!obj) return
  applyTransform(obj, entity.transform)

  const wireframe = debugWireframes.get(id)
  if (wireframe) applyTransform(wireframe, entity.transform)

  // Update material color
  if (entity.type === 'mesh' && obj instanceof Mesh && entity.mesh?.material?.color) {
    ;(obj.material as MeshLambertMaterial).color = hexToColor(entity.mesh.material.color)
  }

  // Update light properties
  if (obj instanceof DirectionalLight) {
    if (entity.light?.color) obj.color = hexToColor(entity.light.color)
    if (entity.light?.intensity !== undefined) obj.intensity = entity.light.intensity
  }
  if (obj instanceof AmbientLight) {
    if (entity.light?.color) obj.color = hexToColor(entity.light.color)
    if (entity.light?.intensity !== undefined) obj.intensity = entity.light.intensity
  }

  // Update light helper position
  const helper = lightHelpers.get(id)
  if (helper instanceof DirectionalLightHelper) {
    helper.update()
  }
  if (helper instanceof CameraHelper) {
    if (entity.transform?.position) {
      helper.setPosition(entity.transform.position[0], entity.transform.position[1], entity.transform.position[2])
    }
    if (entity.transform?.rotation) {
      helper.setRotation(entity.transform.rotation[0], entity.transform.rotation[1], entity.transform.rotation[2])
    }
  }
}
