import type { SceneData, SceneEntity } from '../../scene-data.ts'
import type { RendererAdapter, RendererAdapterOptions, EditorCameraState, TransformMode } from '../renderer-adapter.ts'

/**
 * Minimal renderer adapter — a lightweight alternative to Three.js.
 *
 * This is an early-stage implementation. Features are added incrementally:
 * - Lambert shading only (no PBR)
 * - Basic geometry: box, sphere, plane, capsule
 * - Lights: directional, ambient, point
 * - No shadow maps yet
 * - No post-processing (outline) yet
 * - Y-up and Z-up coordinate systems
 *
 * @see https://github.com/verekia/voidcore for the underlying renderer
 */
export class VoidRendererAdapter implements RendererAdapter {
  async init(_canvas: HTMLCanvasElement, _options: RendererAdapterOptions): Promise<void> {
    console.warn('[mana] VoidRendererAdapter is not yet implemented.')
  }

  dispose(): void {}

  async loadScene(_sceneData: SceneData): Promise<void> {}

  async addEntity(_entity: SceneEntity): Promise<void> {}

  removeEntity(_id: string): void {}

  updateEntity(_id: string, _entity: SceneEntity): void {}

  setEntityVisible(_id: string, _visible: boolean): void {}

  setEntityPhysicsTransform(
    _id: string,
    _position: [number, number, number],
    _quaternion: [number, number, number, number],
  ): void {}

  getEntityNativeObject(_id: string): unknown {
    return null
  }

  getNativeScene(): unknown {
    return null
  }

  setGizmos(_enabled: boolean): void {}

  setSelectedEntities(_ids: string[]): void {}

  raycast(_ndcX: number, _ndcY: number): string | null {
    return null
  }

  setTransformTarget(_id: string | null): void {}

  setTransformMode(_mode: TransformMode): void {}

  getEditorCamera(): EditorCameraState | null {
    return null
  }

  setEditorCamera(_state: EditorCameraState): void {}

  updateControls(): void {}

  render(): void {}
}
