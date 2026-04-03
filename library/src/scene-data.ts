export interface Transform {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

export interface CameraData {
  fov?: number
  near?: number
  far?: number
}

/**
 * Lambert material — diffuse color only, no PBR.
 * Additional material types (Standard/PBR, Unlit, etc.) will be added incrementally.
 */
export interface MaterialData {
  color?: string
  /** Albedo texture map path */
  map?: string
  /** Emissive texture map path */
  emissiveMap?: string
}

export interface MeshData {
  /** Supported geometries: box, sphere, plane, capsule.
   *  Additional types (cylinder, torus, etc.) will be added incrementally. */
  geometry?: 'box' | 'sphere' | 'plane' | 'capsule'
  material?: MaterialData
}

export interface ModelData {
  src: string
  material?: MaterialData
}

export interface LightData {
  color?: string
  intensity?: number
  castShadow?: boolean
}

export interface UiData {
  component: string
}

export interface RigidBodyData {
  type: 'dynamic' | 'fixed' | 'kinematic'
  lockRotation?: [boolean, boolean, boolean]
}

export interface ColliderData {
  /** Supported shapes: box, sphere, capsule.
   *  Additional shapes (cylinder, convex hull, trimesh, etc.) will be added incrementally. */
  shape: 'box' | 'sphere' | 'capsule'
  /** Half-extents for box colliders: [x, y, z] */
  halfExtents?: [number, number, number]
  /** Radius for sphere and capsule colliders */
  radius?: number
  /** Half-height of the cylindrical part for capsule colliders */
  halfHeight?: number
  /**
   * If true, this collider is a sensor (trigger volume).
   * Sensors detect overlaps without producing physical contact forces.
   * Collision events (onCollisionEnter/onCollisionExit) are still fired.
   */
  sensor?: boolean
  /** Friction coefficient (0 = frictionless, 1 = high friction). Default: 0.5 */
  friction?: number
  /** Restitution / bounciness (0 = no bounce, 1 = perfectly elastic). Default: 0 */
  restitution?: number
}

export interface ScriptEntry {
  name: string
  params?: Record<string, number | string | boolean>
}

export interface SceneEntity {
  id: string
  name: string
  type: 'camera' | 'mesh' | 'directional-light' | 'ambient-light' | 'point-light' | 'ui' | 'model'
  transform?: Transform
  camera?: CameraData
  mesh?: MeshData
  model?: ModelData
  light?: LightData
  ui?: UiData
  scripts?: ScriptEntry[]
  rigidBody?: RigidBodyData
  collider?: ColliderData
  /** Tags for grouping and querying entities (e.g. 'enemy', 'collectible'). */
  tags?: string[]
  castShadow?: boolean
  receiveShadow?: boolean
  /** Child entities forming a hierarchy. */
  children?: SceneEntity[]
  /** Reference to a prefab by name. The entity's properties are merged on top of the prefab defaults. */
  prefab?: string
}

/**
 * A prefab is a reusable entity template stored as a YAML file in `prefabs/`.
 * It contains a root entity with optional `children` for multi-entity hierarchies.
 * Prefabs can be instantiated at runtime via `ctx.instantiatePrefab()` in scripts,
 * or placed in scenes via the `prefab` field on a SceneEntity.
 */
export interface PrefabData {
  /** The root entity definition for this prefab. */
  entity: SceneEntity
}

/** Flatten a tree of entities (with children) into a flat array. */
export function flattenEntities(entities: SceneEntity[]): SceneEntity[] {
  const result: SceneEntity[] = []
  for (const entity of entities) {
    result.push(entity)
    if (entity.children?.length) {
      result.push(...flattenEntities(entity.children))
    }
  }
  return result
}

export interface SceneData {
  background?: string
  /**
   * Coordinate system convention for this scene.
   * - 'y-up'  (default) — Y axis points up, used by Three.js, glTF, WebGL conventions
   * - 'z-up'  — Z axis points up, used by Blender, CAD, and some game engines
   *
   * The editor and renderer adapters must respect this setting when orienting the
   * default camera, grid, and transform gizmos.
   */
  coordinateSystem?: 'y-up' | 'z-up'
  entities: SceneEntity[]
}

// ── Entity tree helpers ──────────────────────────────────────────────────────

/** Find an entity by ID anywhere in the tree, returning it and its parent array. */
export function findEntityInTree(
  entities: SceneEntity[],
  id: string,
): { entity: SceneEntity; parent: SceneEntity[]; index: number } | null {
  for (let i = 0; i < entities.length; i++) {
    if (entities[i].id === id) return { entity: entities[i], parent: entities, index: i }
    const children = entities[i].children
    if (children?.length) {
      const found = findEntityInTree(children, id)
      if (found) return found
    }
  }
  return null
}

/** Remove an entity by ID from anywhere in the tree. Returns the removed entity or null. */
export function removeEntityFromTree(entities: SceneEntity[], id: string): SceneEntity | null {
  for (let i = 0; i < entities.length; i++) {
    if (entities[i].id === id) {
      return entities.splice(i, 1)[0]
    }
    const children = entities[i].children
    if (children?.length) {
      const removed = removeEntityFromTree(children, id)
      if (removed) {
        if (children.length === 0) entities[i].children = undefined
        return removed
      }
    }
  }
  return null
}

function assignFreshIds(e: SceneEntity) {
  e.id = Math.random().toString(36).slice(2, 10)
  e.children?.forEach(child => assignFreshIds(child))
}

/** Deep-clone an entity tree, assigning fresh IDs to all nodes. */
export function cloneEntity(entity: SceneEntity): SceneEntity {
  const cloned = structuredClone(entity)
  assignFreshIds(cloned)
  return cloned
}

/** Map over all entities in a tree (root + nested children), preserving structure. */
export function mapEntityTree(entities: SceneEntity[], fn: (entity: SceneEntity) => SceneEntity): SceneEntity[] {
  return entities.map(entity => {
    const mapped = fn(entity)
    if (mapped.children?.length) {
      return { ...mapped, children: mapEntityTree(mapped.children, fn) }
    }
    return mapped
  })
}
