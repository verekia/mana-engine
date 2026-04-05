import { flattenEntities } from '../scene-data.ts'

import type { SceneData, SceneEntity } from '../scene-data.ts'

export const SCENE_ENTITY_ID = '__scene'

export interface CompatWarning {
  entityId: string
  entityName: string
  feature: string
  message: string
}

type RendererName = 'three' | 'voidcore' | 'nanothree'
type PhysicsName = 'rapier' | 'crashcat' | 'none'

/**
 * Checks a scene for features that are not supported by the current adapter configuration.
 * Returns a list of warnings for entities using unsupported features.
 */
export function checkCompatibility(
  sceneData: SceneData | null,
  renderer: RendererName | string,
  physics: PhysicsName | string,
): CompatWarning[] {
  if (!sceneData) return []
  const warnings: CompatWarning[] = []

  // Entity-level checks (single pass)
  for (const entity of flattenEntities(sceneData.entities)) {
    if (renderer !== 'three') {
      checkRendererCompat(entity, renderer, warnings)
    }
    if (physics === 'none') {
      if (entity.rigidBody) {
        warnings.push({
          entityId: entity.id,
          entityName: entity.name,
          feature: 'Rigid Body',
          message: `"${entity.name}" has a rigid body but physics is disabled (set to "none")`,
        })
      }
      if (entity.collider) {
        warnings.push({
          entityId: entity.id,
          entityName: entity.name,
          feature: 'Collider',
          message: `"${entity.name}" has a collider but physics is disabled (set to "none")`,
        })
      }
    }
    if (physics === 'crashcat' && entity.collider?.sensor) {
      warnings.push({
        entityId: entity.id,
        entityName: entity.name,
        feature: 'Sensor',
        message: `"${entity.name}" uses sensor collider — Crashcat has no native sensor support (body will still collide physically)`,
      })
    }
  }

  // Scene-level checks
  if (renderer !== 'three') {
    if (sceneData.skybox?.source) {
      warnings.push({
        entityId: SCENE_ENTITY_ID,
        entityName: 'Scene',
        feature: 'Skybox',
        message: 'Skybox / environment maps are only supported with Three.js renderer',
      })
    }
    if (sceneData.postProcessing?.bloom) {
      warnings.push({
        entityId: SCENE_ENTITY_ID,
        entityName: 'Scene',
        feature: 'Post-Processing',
        message: 'Bloom post-processing is only supported with Three.js renderer',
      })
    }
  }

  return warnings
}

function checkRendererCompat(entity: SceneEntity, renderer: RendererName | string, warnings: CompatWarning[]): void {
  const mat = entity.mesh?.material ?? entity.model?.material
  if (mat) {
    const hasPBR =
      (mat.metalness !== undefined && mat.metalness !== 0) ||
      (mat.roughness !== undefined && mat.roughness !== 0.5) ||
      mat.normalMap ||
      mat.roughnessMap ||
      mat.metalnessMap
    if (hasPBR) {
      warnings.push({
        entityId: entity.id,
        entityName: entity.name,
        feature: 'PBR Material',
        message: `"${entity.name}" uses PBR material properties — only supported with Three.js renderer`,
      })
    }
    // Nanothree has no texture support
    if (
      renderer === 'nanothree' &&
      (mat.map || mat.emissiveMap || mat.normalMap || mat.roughnessMap || mat.metalnessMap)
    ) {
      warnings.push({
        entityId: entity.id,
        entityName: entity.name,
        feature: 'Texture Maps',
        message: `"${entity.name}" uses texture maps — not supported in nanothree renderer`,
      })
    }
  }

  if (entity.type === 'point-light') {
    warnings.push({
      entityId: entity.id,
      entityName: entity.name,
      feature: 'Point Light',
      message: `"${entity.name}" is a point light — not supported in ${renderer === 'nanothree' ? 'nanothree' : 'VoidCore'} renderer`,
    })
  }

  // Nanothree-specific warnings
  if (renderer === 'nanothree') {
    if (entity.type === 'model') {
      warnings.push({
        entityId: entity.id,
        entityName: entity.name,
        feature: 'GLTF Model',
        message: `"${entity.name}" is a GLTF model — not supported in nanothree renderer`,
      })
    }
    if (entity.type === 'particles') {
      warnings.push({
        entityId: entity.id,
        entityName: entity.name,
        feature: 'Particles',
        message: `"${entity.name}" uses particles — not supported in nanothree renderer`,
      })
    }
  }
}
