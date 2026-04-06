import { AnimationClip, AnimationMixer } from '../../nanothree/animation.ts'

import type { Object3D } from '../../nanothree/core.ts'

/**
 * Manages GLTF animation clip playback for the nanothree adapter.
 * Mirrors the ThreeAnimationHelper API.
 */
export class NanothreeAnimationHelper {
  /** Animation clips stored per entity from GLTF loading. */
  readonly entityClips = new Map<string, AnimationClip[]>()
  /** Active AnimationMixers per entity. */
  private entityMixers = new Map<string, AnimationMixer>()
  /** Pending playAnimation calls queued before clips were loaded. */
  private pendingPlay = new Map<string, { name: string; options?: { loop?: boolean; crossFadeDuration?: number } }>()
  private entityObjects: Map<string, Object3D>

  constructor(entityObjects: Map<string, Object3D>) {
    this.entityObjects = entityObjects
  }

  /** Callback for passing to createNanothreeEntity's onAnimationClips option. */
  onAnimationClips = (id: string, clips: AnimationClip[]): void => {
    this.entityClips.set(id, clips)
    const pending = this.pendingPlay.get(id)
    if (pending) {
      this.pendingPlay.delete(id)
      this.playAnimation(id, pending.name, pending.options)
    }
  }

  playAnimation(entityId: string, name: string, options?: { loop?: boolean; crossFadeDuration?: number }): void {
    const clips = this.entityClips.get(entityId)
    const obj = this.entityObjects.get(entityId)
    if (!clips || !obj) {
      this.pendingPlay.set(entityId, { name, options })
      return
    }

    const clip = AnimationClip.findByName(clips, name)
    if (!clip) {
      console.warn(`[nanothree] Animation "${name}" not found on entity "${entityId}"`)
      return
    }

    let mixer = this.entityMixers.get(entityId)
    if (!mixer) {
      mixer = new AnimationMixer(obj)
      this.entityMixers.set(entityId, mixer)
    }

    const fadeDuration = options?.crossFadeDuration ?? 0.3

    // Crossfade: fade out currently running actions
    if (fadeDuration > 0) {
      for (const prev of mixer.actions) {
        if (prev.clip !== clip && prev.isRunning) {
          prev.fadeOut(fadeDuration)
        }
      }
    }

    const action = mixer.clipAction(clip)
    action.setLoop(options?.loop !== false)
    if (options?.loop === false) action.clampWhenFinished = true
    action.reset().fadeIn(fadeDuration).play()
  }

  stopAnimation(entityId: string): void {
    const mixer = this.entityMixers.get(entityId)
    if (mixer) {
      mixer.stopAllAction()
    }
  }

  getAnimationNames(entityId: string): string[] {
    const clips = this.entityClips.get(entityId)
    return clips ? clips.map(c => c.name) : []
  }

  updateAnimations(dt: number): void {
    for (const mixer of this.entityMixers.values()) {
      mixer.update(dt)
    }
  }

  /** Clean up mixer and clips for a removed entity. */
  removeEntity(entityId: string): void {
    const mixer = this.entityMixers.get(entityId)
    if (mixer) {
      mixer.stopAllAction()
      this.entityMixers.delete(entityId)
    }
    this.entityClips.delete(entityId)
    this.pendingPlay.delete(entityId)
  }
}
