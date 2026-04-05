import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  DirectionalLight,
  Group,
  LambertMaterial,
  Mesh,
  type Node,
  PerspectiveCamera,
  PlaneGeometry,
  SphereGeometry,
  loadGLTF,
} from 'voidcore'

import { resolveAsset } from '../../assets.ts'
import { applyTransform, createColliderWireframe, eulerToQuat, hexToRgb } from './voidcore-utils.ts'

import type { AnimationClip, Skeleton } from 'voidcore'

import type { SceneEntity } from '../../scene-data.ts'

/** Shared state passed from the adapter to entity creation functions. */
export interface VoidcoreEntityState {
  entityNodes: Map<string, Node>
  sceneRoot: Group
  isYUp: boolean
  enableOrbitControls: boolean
  showGizmos: boolean
  gameCam: PerspectiveCamera | null
  setGameCam: (cam: PerspectiveCamera) => void
  entityClips: Map<string, AnimationClip[]>
  entitySkeletons: Map<string, Skeleton>
  debugWireframes: Map<string, Node>
}

/** Create a geometry node from a type string. */
export function createGeometry(type?: string) {
  switch (type) {
    case 'sphere':
      return new SphereGeometry()
    case 'plane':
      return new PlaneGeometry()
    case 'capsule':
      // VoidCore height = total height. radius 0.5 + height 2 -> cylinder section = 1.
      return new CapsuleGeometry({ radius: 0.5, height: 2 })
    case 'cone':
      return new ConeGeometry()
    case 'tetrahedron':
      return new ConeGeometry({ radialSegments: 3 })
    default:
      return new BoxGeometry()
  }
}

/**
 * Create a VoidCore entity node from a SceneEntity definition and add it to the parent.
 * Returns the created node, or null for entity types that are skipped (ui, audio).
 */
export function createVoidcoreEntity(entity: SceneEntity, parent: Node, state: VoidcoreEntityState): void {
  let node: Node | null = null

  switch (entity.type) {
    case 'camera': {
      const cam = new PerspectiveCamera({
        fov: entity.camera?.fov ?? 50,
        near: entity.camera?.near ?? 0.1,
        far: entity.camera?.far ?? 100,
      })
      applyTransform(cam, entity.transform)
      // Only apply default lookAt when no rotation was authored in the scene data
      if (!entity.transform?.rotation) cam.lookAt([0, 0, 0])
      cam.name = entity.name
      parent.add(cam)
      state.entityNodes.set(entity.id, cam)
      if (!state.gameCam) state.setGameCam(cam)
      return
    }

    case 'mesh': {
      const geomType = entity.mesh?.geometry
      if (!geomType) {
        // No mesh data -- empty container (Group) that can hold children
        node = new Group()
        break
      }
      const geometry = createGeometry(geomType)
      const color = entity.mesh?.material?.color
        ? hexToRgb(entity.mesh.material.color)
        : ([0.27, 0.53, 1] as [number, number, number])
      const material = new LambertMaterial({
        color,
        receiveShadow: entity.receiveShadow ?? false,
      })
      const mesh = new Mesh(geometry, material)
      mesh.castShadow = entity.castShadow ?? false

      // VoidCore creates capsules along Z and planes in XY (facing +Z). In Y-up
      // scene space, capsules should extend along Y and planes should lie in XZ
      // (facing +Y), so pre-rotate -90 deg around X.
      if ((geomType === 'capsule' || geomType === 'plane') && state.isYUp) {
        const [qx, qy, qz, qw] = eulerToQuat(-Math.PI / 2, 0, 0)
        mesh.setRotation(qx, qy, qz, qw)
        const wrapper = new Group()
        wrapper.add(mesh)
        node = wrapper
      } else {
        node = mesh
      }
      break
    }

    case 'model': {
      const group = new Group()
      node = group
      const modelSrc = entity.model?.src
      if (modelSrc) {
        const entityId = entity.id
        const url = resolveAsset(modelSrc)
        loadGLTF(url).then(gltf => {
          // Check entity hasn't been removed while loading
          if (!state.entityNodes.has(entityId)) return
          group.add(gltf.scene)
          // Apply shadow props recursively
          const applyShadow = (n: Node) => {
            if (n instanceof Mesh) {
              n.castShadow = entity.castShadow ?? false
              ;(n.material as LambertMaterial).receiveShadow = entity.receiveShadow ?? false
            }
            for (const child of n.children) applyShadow(child)
          }
          applyShadow(gltf.scene)
          // Store animation data
          if (gltf.animations.length > 0) {
            state.entityClips.set(entityId, gltf.animations)
            if (gltf.skeletons.length > 0) {
              state.entitySkeletons.set(entityId, gltf.skeletons[0])
            }
          }
        })
      }
      break
    }

    case 'directional-light': {
      const color = entity.light?.color ? hexToRgb(entity.light.color) : ([1, 1, 1] as [number, number, number])
      const light = new DirectionalLight({
        color,
        intensity: entity.light?.intensity ?? 1,
        castShadow: entity.light?.castShadow ?? false,
      })
      node = light
      break
    }

    case 'ambient-light': {
      const color = entity.light?.color ? hexToRgb(entity.light.color) : ([1, 1, 1] as [number, number, number])
      const light = new AmbientLight({
        color,
        intensity: entity.light?.intensity ?? 0.3,
      })
      node = light
      break
    }

    case 'point-light': {
      node = new Group()
      break
    }

    case 'particles': {
      node = new Group()
      break
    }

    case 'ui':
    case 'ui-group':
    case 'audio': {
      return
    }
  }

  if (!node) return

  node.name = entity.name
  applyTransform(node, entity.transform)
  parent.add(node)
  state.entityNodes.set(entity.id, node)

  // Collider wireframe (editor mode only)
  // Apply only position and rotation — the wireframe geometry is already sized
  // from the collider dimensions, so entity scale must NOT be applied.
  if (entity.collider && state.enableOrbitControls) {
    const wireframe = createColliderWireframe(entity.collider, state.isYUp)
    wireframe.visible = state.showGizmos
    applyTransform(
      wireframe,
      entity.transform && { position: entity.transform.position, rotation: entity.transform.rotation },
    )
    wireframe.setScale(1.005, 1.005, 1.005)
    parent.add(wireframe)
    state.debugWireframes.set(entity.id, wireframe)
  }
}

/** Update an existing entity's transform and visual properties. */
export function updateVoidcoreEntity(
  id: string,
  entity: SceneEntity,
  entityNodes: Map<string, Node>,
  debugWireframes: Map<string, Node>,
): void {
  const node = entityNodes.get(id)
  if (!node) return
  applyTransform(node, entity.transform)
  const wireframe = debugWireframes.get(id)
  if (wireframe) applyTransform(wireframe, entity.transform)

  if (entity.type === 'mesh' && node instanceof Mesh && entity.mesh?.material?.color) {
    ;(node.material as LambertMaterial).color = hexToRgb(entity.mesh.material.color)
    ;(node.material as LambertMaterial).needsUpdate = true
  }

  if (node instanceof DirectionalLight || node instanceof AmbientLight) {
    if (entity.light?.color) node.color = hexToRgb(entity.light.color)
    if (entity.light?.intensity !== undefined) node.intensity = entity.light.intensity
  }
}
