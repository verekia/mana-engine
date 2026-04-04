import { AnimationMixer } from 'voidcore'

import type { AnimationClip, Skeleton } from 'voidcore'

/** State for the animation system, stored on the adapter and shared with animation functions. */
export interface VoidcoreAnimationState {
  /** Animation clips stored per entity from GLTF loading. */
  entityClips: Map<string, AnimationClip[]>
  /** Skeletons stored per entity from GLTF loading. */
  entitySkeletons: Map<string, Skeleton>
  /** Active AnimationMixers per entity. */
  entityMixers: Map<string, AnimationMixer>
}

export function createAnimationState(): VoidcoreAnimationState {
  return {
    entityClips: new Map(),
    entitySkeletons: new Map(),
    entityMixers: new Map(),
  }
}

export function playAnimation(
  state: VoidcoreAnimationState,
  entityId: string,
  name: string,
  options?: { loop?: boolean; crossFadeDuration?: number },
): void {
  const clips = state.entityClips.get(entityId)
  const skeleton = state.entitySkeletons.get(entityId)
  if (!clips || !skeleton) return

  const clip = clips.find(c => c.name === name)
  if (!clip) return

  let mixer = state.entityMixers.get(entityId)
  if (!mixer) {
    mixer = new AnimationMixer(skeleton)
    state.entityMixers.set(entityId, mixer)
  }

  const crossFade = options?.crossFadeDuration ?? 0.3

  // Stop current animations with crossfade
  for (const c of clips) {
    const existing = mixer.clipAction(c)
    if (existing !== mixer.clipAction(clip)) {
      existing.fadeOut(crossFade)
    }
  }

  const action = mixer.clipAction(clip)
  action.fadeIn(crossFade)
  action.play()
}

export function stopAnimation(state: VoidcoreAnimationState, entityId: string): void {
  const mixer = state.entityMixers.get(entityId)
  const clips = state.entityClips.get(entityId)
  if (!mixer || !clips) return
  for (const clip of clips) {
    mixer.clipAction(clip).stop()
  }
}

export function getAnimationNames(state: VoidcoreAnimationState, entityId: string): string[] {
  const clips = state.entityClips.get(entityId)
  return clips ? clips.map(c => c.name) : []
}

export function updateAnimations(state: VoidcoreAnimationState, dt: number): void {
  for (const mixer of state.entityMixers.values()) {
    mixer.update(dt)
  }
}
