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

export interface MeshData {
  geometry?: 'box' | 'sphere' | 'plane' | 'cylinder' | 'capsule'
  material?: {
    color?: string
  }
}

export interface LightData {
  color?: string
  intensity?: number
}

export interface UiData {
  component: string
}

export interface RigidBodyData {
  type: 'dynamic' | 'fixed' | 'kinematic'
}

export interface ColliderData {
  shape: 'box' | 'sphere' | 'capsule' | 'cylinder'
  halfExtents?: [number, number, number]
  radius?: number
  halfHeight?: number
}

export interface SceneEntity {
  id: string
  name: string
  type: 'camera' | 'mesh' | 'directional-light' | 'ambient-light' | 'point-light' | 'ui'
  transform?: Transform
  camera?: CameraData
  mesh?: MeshData
  light?: LightData
  ui?: UiData
  scripts?: string[]
  rigidBody?: RigidBodyData
  collider?: ColliderData
}

export interface SceneData {
  background?: string
  entities: SceneEntity[]
}
