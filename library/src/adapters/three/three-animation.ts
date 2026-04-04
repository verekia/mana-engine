import { AnimationClip, AnimationMixer, LoopOnce, LoopRepeat } from 'three/webgpu'

import type { ThreeEntityMaps } from './three-entity.ts'

/**
 * Manages GLTF animation clip playback (mixers, crossfade) for the Three.js adapter.
 * Receives shared entity maps so it can look up objects by entity ID.
 */
export class ThreeAnimationHelper {
  /** Animation clips stored per entity from GLTF loading. */
  readonly entityClips = new Map<string, AnimationClip[]>()
  /** Active AnimationMixers per entity. */
  private entityMixers = new Map<string, AnimationMixer>()
  private maps: ThreeEntityMaps

  constructor(maps: ThreeEntityMaps) {
    this.maps = maps
  }

  /** Callback suitable for passing to createThreeEntityObject's onAnimationClips option. */
  onAnimationClips = (id: string, clips: AnimationClip[]): void => {
    this.entityClips.set(id, clips)
  }

  playAnimation(entityId: string, name: string, options?: { loop?: boolean; crossFadeDuration?: number }): void {
    const clips = this.entityClips.get(entityId)
    const obj = this.maps.entityObjects.get(entityId)
    if (!clips || !obj) return
    const clip = AnimationClip.findByName(clips, name)
    if (!clip) {
      console.warn(`[mana] Animation "${name}" not found on entity "${entityId}"`)
      return
    }
    let mixer = this.entityMixers.get(entityId)
    if (!mixer) {
      mixer = new AnimationMixer(obj)
      this.entityMixers.set(entityId, mixer)
    }
    const fadeDuration = options?.crossFadeDuration ?? 0.3
    const prevActions = [...(mixer as any)._actions] as any[]

    const action = mixer.clipAction(clip)
    action.setLoop(options?.loop === false ? LoopOnce : LoopRepeat, Infinity)
    if (options?.loop === false) action.clampWhenFinished = true

    // Crossfade from any currently playing action
    if (fadeDuration > 0 && prevActions.length > 0) {
      for (const prev of prevActions) {
        if (prev !== action && prev.isRunning()) {
          prev.fadeOut(fadeDuration)
        }
      }
      action.reset().fadeIn(fadeDuration).play()
    } else {
      action.reset().play()
    }
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
  }
}
