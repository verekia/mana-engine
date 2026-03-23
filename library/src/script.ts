import type { Object3D, Scene } from 'three'

import type { Input } from './input.ts'
import type { RapierRigidBody } from './scene.ts'

export interface ScriptParamDef {
  type: 'number' | 'string' | 'boolean'
  default: number | string | boolean
}

export interface ScriptContext {
  /** The Three.js object this script is attached to */
  entity: Object3D
  /** The Three.js scene */
  scene: Scene
  /** Delta time in seconds since last frame */
  dt: number
  /** Total elapsed time in seconds since scene started */
  time: number
  /** The Rapier rigid body for this entity (if it has one) */
  rigidBody?: RapierRigidBody
  /** Input state for keyboard, mouse, and axes */
  input: Input
  /** Script parameters configured in the editor */
  params: Record<string, number | string | boolean>
}

export interface ManaScript {
  params?: Record<string, ScriptParamDef>
  init?(ctx: ScriptContext): void
  update?(ctx: ScriptContext): void
  fixedUpdate?(ctx: ScriptContext): void
  dispose?(): void
}
