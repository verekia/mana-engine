// Lightweight animation system for nanothree
//
// Provides Three.js-compatible API for GLTF animation playback:
// - AnimationClip: named collection of keyframe tracks with a duration
// - KeyframeTrack: interpolated keyframe data for a single property (position/rotation/scale)
// - AnimationMixer: drives playback of clips on an Object3D target
// - AnimationAction: controls a single clip's playback state (play, stop, fade, loop)
//
// Supports: translation, rotation (quaternion→euler), scale tracks
// Skeletal animation works via Bone nodes (Object3D subclass) driven by these tracks
// Does not support: morph targets, cubic interpolation

import type { Object3D } from './core'

// ── Interpolation helpers ────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Spherical linear interpolation for quaternions. */
function slerp(
  out: [number, number, number, number],
  a: Float32Array,
  aOff: number,
  b: Float32Array,
  bOff: number,
  t: number,
): void {
  let ax = a[aOff],
    ay = a[aOff + 1],
    az = a[aOff + 2],
    aw = a[aOff + 3]
  let bx = b[bOff],
    by = b[bOff + 1],
    bz = b[bOff + 2],
    bw = b[bOff + 3]

  let dot = ax * bx + ay * by + az * bz + aw * bw
  if (dot < 0) {
    dot = -dot
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }

  if (dot > 0.9999) {
    // Very close — linear interpolation
    out[0] = lerp(ax, bx, t)
    out[1] = lerp(ay, by, t)
    out[2] = lerp(az, bz, t)
    out[3] = lerp(aw, bw, t)
  } else {
    const theta = Math.acos(dot)
    const sinTheta = Math.sin(theta)
    const wa = Math.sin((1 - t) * theta) / sinTheta
    const wb = Math.sin(t * theta) / sinTheta
    out[0] = ax * wa + bx * wb
    out[1] = ay * wa + by * wb
    out[2] = az * wa + bz * wb
    out[3] = aw * wa + bw * wb
  }

  // Normalize
  const len = Math.sqrt(out[0] ** 2 + out[1] ** 2 + out[2] ** 2 + out[3] ** 2) || 1
  out[0] /= len
  out[1] /= len
  out[2] /= len
  out[3] /= len
}

/** Convert quaternion to XYZ Euler angles (radians). */
function quatToEulerXYZ(qx: number, qy: number, qz: number, qw: number): [number, number, number] {
  const sinr = 2 * (qw * qx + qy * qz)
  const cosr = 1 - 2 * (qx * qx + qy * qy)
  const rx = Math.atan2(sinr, cosr)
  const sinp = 2 * (qw * qy - qz * qx)
  const ry = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)
  const siny = 2 * (qw * qz + qx * qy)
  const cosy = 1 - 2 * (qy * qy + qz * qz)
  const rz = Math.atan2(siny, cosy)
  return [rx, ry, rz]
}

// ── KeyframeTrack ────────────────────────────────────────────────────

export type TrackPath = 'translation' | 'rotation' | 'scale'

export class KeyframeTrack {
  /** Index of the target node in the GLTF node array. */
  readonly nodeIndex: number
  /** Which property this track animates. */
  readonly path: TrackPath
  /** Sorted array of keyframe times in seconds. */
  readonly times: Float32Array
  /** Flat array of keyframe values (3 or 4 components per keyframe). */
  readonly values: Float32Array
  /** Number of components per keyframe (3 for translation/scale, 4 for rotation). */
  readonly stride: number

  constructor(nodeIndex: number, path: TrackPath, times: Float32Array, values: Float32Array) {
    this.nodeIndex = nodeIndex
    this.path = path
    this.times = times
    this.values = values
    this.stride = path === 'rotation' ? 4 : 3
  }
}

// ── AnimationClip ────────────────────────────────────────────────────

export class AnimationClip {
  readonly name: string
  readonly duration: number
  readonly tracks: KeyframeTrack[]

  constructor(name: string, duration: number, tracks: KeyframeTrack[]) {
    this.name = name
    this.duration = duration
    this.tracks = tracks
  }

  static findByName(clips: AnimationClip[], name: string): AnimationClip | undefined {
    return clips.find(c => c.name === name)
  }
}

// ── AnimationAction ──────────────────────────────────────────────────

export class AnimationAction {
  readonly clip: AnimationClip
  private _isRunning = false
  private _time = 0
  private _loop = true
  private _clampWhenFinished = false
  private _weight = 1
  private _fadeIn = 0
  private _fadeOut = 0
  private _fadeDuration = 0
  private _fadeElapsed = 0
  private _fadeDirection: 'in' | 'out' | null = null

  constructor(clip: AnimationClip) {
    this.clip = clip
  }

  get time(): number {
    return this._time
  }
  get weight(): number {
    return this._weight
  }
  get isRunning(): boolean {
    return this._isRunning
  }

  play(): AnimationAction {
    this._isRunning = true
    return this
  }

  stop(): AnimationAction {
    this._isRunning = false
    this._time = 0
    this._weight = 0
    return this
  }

  reset(): AnimationAction {
    this._time = 0
    this._weight = 1
    this._fadeDirection = null
    this._fadeElapsed = 0
    return this
  }

  setLoop(loop: boolean): AnimationAction {
    this._loop = loop
    return this
  }

  set clampWhenFinished(v: boolean) {
    this._clampWhenFinished = v
  }

  fadeIn(duration: number): AnimationAction {
    this._fadeDirection = 'in'
    this._fadeDuration = duration
    this._fadeElapsed = 0
    this._weight = 0
    return this
  }

  fadeOut(duration: number): AnimationAction {
    this._fadeDirection = 'out'
    this._fadeDuration = duration
    this._fadeElapsed = 0
    return this
  }

  /** Advance time and update fade weight. Returns false if the action finished. */
  _advance(dt: number): boolean {
    if (!this._isRunning) return false

    this._time += dt

    // Handle fade
    if (this._fadeDirection && this._fadeDuration > 0) {
      this._fadeElapsed += dt
      const t = Math.min(this._fadeElapsed / this._fadeDuration, 1)
      if (this._fadeDirection === 'in') {
        this._weight = t
      } else {
        this._weight = 1 - t
      }
      if (t >= 1) {
        this._fadeDirection = null
        if (this._weight <= 0) {
          this._isRunning = false
          return false
        }
      }
    }

    // Handle looping / clamping
    if (this._time >= this.clip.duration) {
      if (this._loop) {
        this._time = this._time % this.clip.duration
      } else {
        if (this._clampWhenFinished) {
          this._time = this.clip.duration - 0.0001
        }
        this._isRunning = false
        return false
      }
    }

    return true
  }
}

// ── AnimationMixer ───────────────────────────────────────────────────

// Temp quaternion for slerp
const _tempQuat: [number, number, number, number] = [0, 0, 0, 1]

export class AnimationMixer {
  readonly root: Object3D
  readonly actions: AnimationAction[] = []
  /** Map from GLTF node index to Object3D resolved at first update. */
  private nodeMap: Map<number, Object3D> | null = null

  constructor(root: Object3D) {
    this.root = root
  }

  clipAction(clip: AnimationClip): AnimationAction {
    // Reuse existing action for the same clip
    const existing = this.actions.find(a => a.clip === clip)
    if (existing) return existing
    const action = new AnimationAction(clip)
    this.actions.push(action)
    return action
  }

  stopAllAction(): void {
    for (const action of this.actions) {
      action.stop()
    }
  }

  update(dt: number): void {
    if (!this.nodeMap) {
      this.nodeMap = this._buildNodeMap()
    }

    for (const action of this.actions) {
      if (!action._advance(dt)) continue
      this._applyAction(action)
    }
  }

  /** Build a GLTF-node-index → Object3D map by traversing the tree and reading `_gltfNodeIndex`. */
  private _buildNodeMap(): Map<number, Object3D> {
    const map = new Map<number, Object3D>()
    const walk = (obj: Object3D) => {
      const idx = (obj as any)._gltfNodeIndex
      if (idx !== undefined) {
        map.set(idx as number, obj)
      }
      for (const child of obj.children) {
        walk(child)
      }
    }
    for (const child of this.root.children) {
      walk(child)
    }
    return map
  }

  private _applyAction(action: AnimationAction): void {
    const t = action.time
    const w = action.weight

    for (const track of action.clip.tracks) {
      const node = this.nodeMap!.get(track.nodeIndex)
      if (!node) continue

      const times = track.times
      const values = track.values
      const stride = track.stride

      // Find the two keyframes to interpolate between
      let i1 = 0
      for (let i = 0; i < times.length - 1; i++) {
        if (t >= times[i] && t < times[i + 1]) {
          i1 = i
          break
        }
        if (i === times.length - 2) {
          i1 = i // clamp to last segment
        }
      }
      const i2 = Math.min(i1 + 1, times.length - 1)

      const t1 = times[i1]
      const t2 = times[i2]
      const alpha = t2 > t1 ? (t - t1) / (t2 - t1) : 0

      const off1 = i1 * stride
      const off2 = i2 * stride

      switch (track.path) {
        case 'translation': {
          const x = lerp(values[off1], values[off2], alpha)
          const y = lerp(values[off1 + 1], values[off2 + 1], alpha)
          const z = lerp(values[off1 + 2], values[off2 + 2], alpha)
          if (w >= 1) {
            node.position.set(x, y, z)
          } else {
            node.position.set(lerp(node.position.x, x, w), lerp(node.position.y, y, w), lerp(node.position.z, z, w))
          }
          break
        }
        case 'rotation': {
          slerp(_tempQuat, values, off1, values, off2, alpha)
          if (w >= 1) {
            node._quaternion = [_tempQuat[0], _tempQuat[1], _tempQuat[2], _tempQuat[3]]
          } else {
            // Weight blending: slerp from current quaternion toward target
            const cur = node._quaternion ?? [0, 0, 0, 1]
            const blended: [number, number, number, number] = [0, 0, 0, 1]
            // Use slerp for weight blending
            let dot = cur[0] * _tempQuat[0] + cur[1] * _tempQuat[1] + cur[2] * _tempQuat[2] + cur[3] * _tempQuat[3]
            const sign = dot < 0 ? -1 : 1
            dot = Math.abs(dot)
            if (dot > 0.9999) {
              blended[0] = lerp(cur[0], _tempQuat[0] * sign, w)
              blended[1] = lerp(cur[1], _tempQuat[1] * sign, w)
              blended[2] = lerp(cur[2], _tempQuat[2] * sign, w)
              blended[3] = lerp(cur[3], _tempQuat[3] * sign, w)
            } else {
              const theta = Math.acos(dot)
              const sinTheta = Math.sin(theta)
              const wa = Math.sin((1 - w) * theta) / sinTheta
              const wb = Math.sin(w * theta) / sinTheta
              blended[0] = cur[0] * wa + _tempQuat[0] * sign * wb
              blended[1] = cur[1] * wa + _tempQuat[1] * sign * wb
              blended[2] = cur[2] * wa + _tempQuat[2] * sign * wb
              blended[3] = cur[3] * wa + _tempQuat[3] * sign * wb
            }
            // Normalize
            const len = Math.sqrt(blended[0] ** 2 + blended[1] ** 2 + blended[2] ** 2 + blended[3] ** 2) || 1
            node._quaternion = [blended[0] / len, blended[1] / len, blended[2] / len, blended[3] / len]
          }
          break
        }
        case 'scale': {
          const x = lerp(values[off1], values[off2], alpha)
          const y = lerp(values[off1 + 1], values[off2 + 1], alpha)
          const z = lerp(values[off1 + 2], values[off2 + 2], alpha)
          if (w >= 1) {
            node.scale.set(x, y, z)
          } else {
            node.scale.set(lerp(node.scale.x, x, w), lerp(node.scale.y, y, w), lerp(node.scale.z, z, w))
          }
          break
        }
      }
    }
  }
}
