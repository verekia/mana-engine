import { flattenEntities } from '../scene-data.ts'

import type { SceneData, SceneEntity } from '../scene-data.ts'

export interface CompatWarning {
  entityId: string
  entityName: string
  feature: string
  message: string
}

/**
 * Checks a scene for features that are not supported by the current adapter configuration.
 * Returns a list of warnings for entities using unsupported features.
 */
export function checkCompatibility(sceneData: SceneData | null, renderer: string, physics: string): CompatWarning[] {
  if (!sceneData) return []
  const warnings: CompatWarning[] = []
  const entities = flattenEntities(sceneData.entities)

  for (const entity of entities) {
    checkEntityCompat(entity, renderer, physics, warnings)
  }

  // Scene-level checks
  if (renderer !== 'three') {
    if (sceneData.skybox?.source) {
      warnings.push({
        entityId: '__scene',
        entityName: 'Scene',
        feature: 'Skybox',
        message: 'Skybox / environment maps are only supported with Three.js renderer',
      })
    }
    if (sceneData.postProcessing?.bloom) {
      warnings.push({
        entityId: '__scene',
        entityName: 'Scene',
        feature: 'Post-Processing',
        message: 'Bloom post-processing is only supported with Three.js renderer',
      })
    }
  }

  // Physics-level checks
  if (physics === 'none') {
    for (const entity of entities) {
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
  }

  if (physics === 'crashcat') {
    for (const entity of entities) {
      if (entity.collider?.sensor) {
        warnings.push({
          entityId: entity.id,
          entityName: entity.name,
          feature: 'Sensor',
          message: `"${entity.name}" uses sensor collider — Crashcat has no native sensor support (body will still collide physically)`,
        })
      }
    }
  }

  return warnings
}

function checkEntityCompat(entity: SceneEntity, renderer: string, _physics: string, warnings: CompatWarning[]): void {
  if (renderer !== 'three') {
    // PBR material properties (VoidCore only supports Lambert)
    const mat = entity.mesh?.material ?? entity.model?.material
    if (mat) {
      if (mat.metalness !== undefined && mat.metalness !== 0) {
        warnings.push({
          entityId: entity.id,
          entityName: entity.name,
          feature: 'PBR Material',
          message: `"${entity.name}" uses metalness — PBR materials are only supported with Three.js renderer`,
        })
      } else if (mat.roughness !== undefined && mat.roughness !== 0.5) {
        warnings.push({
          entityId: entity.id,
          entityName: entity.name,
          feature: 'PBR Material',
          message: `"${entity.name}" uses custom roughness — PBR materials are only supported with Three.js renderer`,
        })
      } else if (mat.normalMap || mat.roughnessMap || mat.metalnessMap) {
        warnings.push({
          entityId: entity.id,
          entityName: entity.name,
          feature: 'PBR Material',
          message: `"${entity.name}" uses PBR texture maps — only supported with Three.js renderer`,
        })
      }
    }

    // Point lights (VoidCore has no point light)
    if (entity.type === 'point-light') {
      warnings.push({
        entityId: entity.id,
        entityName: entity.name,
        feature: 'Point Light',
        message: `"${entity.name}" is a point light — not supported in VoidCore renderer`,
      })
    }
  }
}
