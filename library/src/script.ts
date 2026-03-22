import type { Object3D, Scene } from 'three'

export interface ScriptContext {
  /** The Three.js object this script is attached to */
  entity: Object3D
  /** The Three.js scene */
  scene: Scene
  /** Delta time in seconds since last frame */
  dt: number
  /** Total elapsed time in seconds since scene started */
  time: number
}

export interface ManaScript {
  init?(ctx: ScriptContext): void
  update?(ctx: ScriptContext): void
  fixedUpdate?(ctx: ScriptContext): void
  dispose?(): void
}
