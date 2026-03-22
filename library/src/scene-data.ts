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
  geometry?: 'box' | 'sphere' | 'plane' | 'cylinder'
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

export interface SceneEntity {
  id: string
  name: string
  type: 'camera' | 'mesh' | 'directional-light' | 'ambient-light' | 'ui'
  transform?: Transform
  camera?: CameraData
  mesh?: MeshData
  light?: LightData
  ui?: UiData
  scripts?: string[]
}

export interface SceneData {
  background?: string
  entities: SceneEntity[]
}
