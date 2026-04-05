import { resolveAsset } from '../../assets.ts'
import {
  AmbientLight,
  BoxGeometry,
  CameraHelper,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DirectionalLightHelper,
  GLTFLoader,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  loadTexture,
} from '../../nanothree/index.ts'
import { applyTransform, createColliderWireframe, hexToColor } from './nanothree-utils.ts'

import type { AnimationClip } from '../../nanothree/animation.ts'
import type { SceneEntity } from '../../scene-data.ts'
import type { NanothreeParticleHelper } from './nanothree-particles.ts'

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
  particleHelper: NanothreeParticleHelper
  onAnimationClips?: (entityId: string, clips: AnimationClip[]) => void
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
        case 'cone':
          geometry = new ConeGeometry()
          break
        case 'cylinder':
          geometry = new CylinderGeometry()
          break
        case 'torus':
          geometry = new TorusGeometry()
          break
        case 'tetrahedron':
          geometry = new TetrahedronGeometry()
          break
        default:
          geometry = new BoxGeometry()
          break
      }
      const color = entity.mesh?.material?.color ? hexToColor(entity.mesh.material.color) : new Color(0x4a9eff)
      const material = new MeshLambertMaterial({ color })
      // Load albedo texture if specified
      if (entity.mesh?.material?.map) {
        const texUrl = resolveAsset(entity.mesh.material.map)
        loadTexture(texUrl, tex => {
          material.map = tex
          material._textureDirty = true
        })
      }
      const mesh = new Mesh(geometry, material)
      mesh.castShadow = entity.castShadow ?? false
      mesh.receiveShadow = entity.receiveShadow ?? false
      obj = mesh
      break
    }

    case 'model': {
      const group = new Group()
      const modelSrc = entity.model?.src
      if (modelSrc) {
        const loader = new GLTFLoader()
        loader.load(
          resolveAsset(modelSrc),
          gltf => {
            if (!group.parent) return // Entity was removed during load
            group.add(gltf.scene)
            // Apply shadow properties to all loaded meshes
            applyShadowToGroup(group, entity.castShadow ?? true, entity.receiveShadow ?? true)
            // Apply material color override if specified
            if (entity.model?.material?.color) {
              applyColorOverride(group, hexToColor(entity.model.material.color))
            }
            // Pass animation clips to the helper
            if (gltf.animations && gltf.animations.length > 0) {
              state.onAnimationClips?.(entity.id, gltf.animations)
            }
          },
          undefined,
          err => console.warn(`[nanothree] Failed to load model "${modelSrc}":`, err),
        )
      }
      obj = group
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

    case 'point-light': {
      // Not supported — empty Group placeholder
      obj = new Group()
      break
    }

    case 'particles': {
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

  // Particle emitter
  if (entity.type === 'particles') {
    state.particleHelper.addEmitter(entity.id, entity.particles, obj)
  }

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

/** Apply shadow properties recursively to all meshes in a group. */
function applyShadowToGroup(group: Group, cast: boolean, receive: boolean): void {
  for (const child of group.children) {
    if (child instanceof Mesh) {
      child.castShadow = cast
      child.receiveShadow = receive
    }
    if ('children' in child && (child as Group).children.length > 0) {
      applyShadowToGroup(child as Group, cast, receive)
    }
  }
}

/** Apply a color override to all MeshLambertMaterial meshes in a group. */
function applyColorOverride(group: Group, color: Color): void {
  for (const child of group.children) {
    if (child instanceof Mesh && child.material instanceof MeshLambertMaterial) {
      child.material.color = color
    }
    if ('children' in child && (child as Group).children.length > 0) {
      applyColorOverride(child as Group, color)
    }
  }
}
