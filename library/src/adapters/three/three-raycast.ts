import { Group, Matrix4, Mesh, type Object3D, Raycaster, Vector2, Vector3 } from 'three/webgpu'

import type { RaycastHit } from '../renderer-adapter.ts'
import type { ThreeEntityMaps } from './three-entity.ts'

// Scratch vectors/matrices to avoid allocations in hot paths
const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()
const _mat4 = new Matrix4()

/**
 * Handles editor NDC raycasting and world-space script raycasting for the Three.js adapter.
 */
export class ThreeRaycastHelper {
  private raycaster = new Raycaster()
  private ndcVec = new Vector2()
  private raycastTargets: Object3D[] = []
  private raycastObjectToEntity = new Map<Object3D, string>()

  private maps: ThreeEntityMaps
  private getCamera: () => import('three/webgpu').PerspectiveCamera
  private getSceneRoot: () => Group
  private getTransformControlsRoot: () => Object3D | null

  constructor(
    maps: ThreeEntityMaps,
    getCamera: () => import('three/webgpu').PerspectiveCamera,
    getSceneRoot: () => Group,
    getTransformControlsRoot: () => Object3D | null,
  ) {
    this.maps = maps
    this.getCamera = getCamera
    this.getSceneRoot = getSceneRoot
    this.getTransformControlsRoot = getTransformControlsRoot
  }

  /** Build entity object → entity ID mapping into the provided map. */
  private buildEntityMapping(map: Map<Object3D, string>, targets: Object3D[]): void {
    for (const [id, obj] of this.maps.entityObjects) {
      if (obj instanceof Mesh) {
        targets.push(obj)
        map.set(obj, id)
      } else if (obj instanceof Group) {
        targets.push(obj)
        obj.traverse(child => map.set(child, id))
      }
    }
  }

  raycast(ndcX: number, ndcY: number): string | null {
    this.raycaster.setFromCamera(this.ndcVec.set(ndcX, ndcY), this.getCamera())
    this.raycaster.params.Line.threshold = 0.15

    this.raycastTargets.length = 0
    this.raycastObjectToEntity.clear()
    const tcRoot = this.getTransformControlsRoot()

    this.buildEntityMapping(this.raycastObjectToEntity, this.raycastTargets)
    for (const [id, helper] of this.maps.gizmoHelpers) {
      this.raycastTargets.push(helper)
      helper.traverse(child => this.raycastObjectToEntity.set(child, id))
    }
    for (const [id, wireframe] of this.maps.debugWireframes) {
      this.raycastTargets.push(wireframe)
      this.raycastObjectToEntity.set(wireframe, id)
    }

    const hits = this.raycaster.intersectObjects(this.raycastTargets, true)
    if (hits.length === 0) return null
    for (const hit of hits) {
      if (tcRoot) {
        let isGizmo = false
        let parent = hit.object.parent
        while (parent) {
          if (parent === tcRoot) {
            isGizmo = true
            break
          }
          parent = parent.parent
        }
        if (isGizmo) continue
      }
      return this.raycastObjectToEntity.get(hit.object) ?? null
    }
    return null
  }

  raycastWorld(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance = 1000,
  ): RaycastHit | null {
    const originVec = _v1.set(origin.x, origin.y, origin.z)
    const dirVec = _v2.set(direction.x, direction.y, direction.z).normalize()

    const sceneRoot = this.getSceneRoot()
    if (sceneRoot) {
      originVec.applyMatrix4(sceneRoot.matrixWorld)
      dirVec.transformDirection(sceneRoot.matrixWorld)
    }

    this.raycaster.set(originVec, dirVec)
    const prevFar = this.raycaster.far
    this.raycaster.far = maxDistance

    // Build targets from entity objects only (no gizmos/helpers)
    const targets: Object3D[] = []
    const objToEntity = new Map<Object3D, string>()
    this.buildEntityMapping(objToEntity, targets)

    const hits = this.raycaster.intersectObjects(targets, true)
    this.raycaster.far = prevFar

    for (const hit of hits) {
      const entityId = objToEntity.get(hit.object)
      if (entityId) {
        const worldPoint = _v3.copy(hit.point)
        if (sceneRoot) {
          worldPoint.applyMatrix4(_mat4.copy(sceneRoot.matrixWorld).invert())
        }
        return {
          entityId,
          distance: hit.distance,
          point: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
        }
      }
    }
    return null
  }
}
