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

export interface MaterialData {
  color?: string
  roughness?: number
  metalness?: number
  emissive?: string
  map?: string
  normalMap?: string
  roughnessMap?: string
  metalnessMap?: string
  emissiveMap?: string
}

export interface MeshData {
  geometry?: 'box' | 'sphere' | 'plane' | 'cylinder' | 'capsule'
  material?: MaterialData
}

export interface ModelData {
  src: string
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
}

export interface ColliderData {
  shape: 'box' | 'sphere' | 'capsule' | 'cylinder' | 'plane'
  halfExtents?: [number, number, number]
  radius?: number
  halfHeight?: number
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
}

export interface SceneData {
  background?: string
  entities: SceneEntity[]
}
