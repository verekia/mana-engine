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
