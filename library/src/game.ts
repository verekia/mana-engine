export { resolveAsset, setAssetManifest } from './assets.ts'
export { Game } from './GameComponent.tsx'
export { createScene } from './scene.ts'
export type { CreateSceneOptions, EditorCameraState, ManaScene, TransformMode } from './scene.ts'
export type {
  ColliderData,
  MaterialData,
  MeshData,
  ModelData,
  PrefabData,
  RigidBodyData,
  SceneData,
  SceneEntity,
  ScriptEntry,
  Transform,
  UiData,
} from './scene-data.ts'
export { ManaContext, useMana } from './scene-context.ts'
export type { ManaContextValue } from './scene-context.ts'
export { Input } from './input.ts'
export type { ManaScript, ScriptContext, ScriptParamDef } from './script.ts'

// Adapter exports — choose the adapter that matches your renderer/physics stack
export { ThreeRendererAdapter } from './adapters/three/index.ts'
export { RapierPhysicsAdapter } from './adapters/rapier/index.ts'
export type { RapierModule, RapierRigidBody } from './adapters/rapier/index.ts'
export { VoidcoreRendererAdapter } from './adapters/voidcore/index.ts'
export { CrashcatPhysicsAdapter } from './adapters/crashcat/index.ts'
export type { CrashcatRigidBody, CrashcatWorld } from './adapters/crashcat/index.ts'
export type { RendererAdapter, RendererAdapterOptions } from './adapters/renderer-adapter.ts'
export type { PhysicsAdapter, PhysicsTransform, ManaRigidBody } from './adapters/physics-adapter.ts'
