import type { ManaRigidBody } from './adapters/physics-adapter.ts'
import type { Input } from './input.ts'

export interface ScriptParamDef {
  type: 'number' | 'string' | 'boolean'
  default: number | string | boolean
}

export interface ScriptContext {
  /**
   * The native object this script is attached to.
   * The concrete type depends on the renderer adapter in use —
   * e.g. `Object3D` for Three.js, a VoidCore node for the void adapter.
   * Cast to the appropriate type inside adapter-specific scripts.
   */
  entity: unknown
  /**
   * The native scene object.
   * The concrete type depends on the renderer adapter in use.
   */
  scene: unknown
  /** Delta time in seconds since last frame */
  dt: number
  /** Total elapsed time in seconds since scene started */
  time: number
  /** The physics body for this entity, if it has a rigid body component. */
  rigidBody?: ManaRigidBody
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
