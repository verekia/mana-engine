// 3D Transform Gizmo for nanothree
//
// Visual-only gizmo (no mouse interaction/raycasting).
// Renders translation arrows, rotation circles, or scale handles
// depending on the active mode.

import { BufferGeometry, Float32BufferAttribute } from './geometry'
import { Line } from './line'
import { LineBasicMaterial } from './material'

import type { Object3D } from './core'
import type { Scene } from './scene'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

const RED = 0xff4444
const GREEN = 0x44ff44
const BLUE = 0x4488ff

// Build an arrow: shaft from origin along +axis, with a small chevron tip
function buildArrow(
  axis: 'x' | 'y' | 'z',
  length: number,
  tipSize: number,
): { positions: number[]; indices: number[] } {
  const l = length
  const t = tipSize
  const positions: number[] = []
  const indices: number[] = []

  // Shaft: vertex 0 -> 1
  const end = [0, 0, 0]
  const tip1 = [0, 0, 0]
  const tip2 = [0, 0, 0]
  const ai = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const perp1 = (ai + 1) % 3
  const perp2 = (ai + 2) % 3

  end[ai] = l
  tip1[ai] = l - t
  tip1[perp1] = t * 0.4
  tip2[ai] = l - t
  tip2[perp1] = -t * 0.4

  // Also add a perpendicular pair for the other axis
  const tip3 = [0, 0, 0]
  const tip4 = [0, 0, 0]
  tip3[ai] = l - t
  tip3[perp2] = t * 0.4
  tip4[ai] = l - t
  tip4[perp2] = -t * 0.4

  positions.push(
    0,
    0,
    0, // 0: origin
    end[0],
    end[1],
    end[2], // 1: tip
    tip1[0],
    tip1[1],
    tip1[2], // 2
    tip2[0],
    tip2[1],
    tip2[2], // 3
    tip3[0],
    tip3[1],
    tip3[2], // 4
    tip4[0],
    tip4[1],
    tip4[2], // 5
  )

  indices.push(
    0,
    1, // shaft
    1,
    2, // arrowhead prong 1
    1,
    3, // arrowhead prong 2
    1,
    4, // arrowhead prong 3
    1,
    5, // arrowhead prong 4
  )

  return { positions, indices }
}

// Build a circle of line segments around an axis
function buildCircle(
  axis: 'x' | 'y' | 'z',
  radius: number,
  segments: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const c = Math.cos(angle) * radius
    const s = Math.sin(angle) * radius

    if (axis === 'x') positions.push(0, c, s)
    else if (axis === 'y') positions.push(c, 0, s)
    else positions.push(c, s, 0)

    if (i > 0) indices.push(i - 1, i)
  }

  return { positions, indices }
}

// Build a scale handle: line with a small box at the end
function buildScaleHandle(
  axis: 'x' | 'y' | 'z',
  length: number,
  boxSize: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = []
  const indices: number[] = []
  const ai = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const perp1 = (ai + 1) % 3
  const perp2 = (ai + 2) % 3

  // Shaft
  const end = [0, 0, 0]
  end[ai] = length
  positions.push(0, 0, 0) // 0
  positions.push(end[0], end[1], end[2]) // 1
  indices.push(0, 1)

  // Box at end (8 vertices, 12 line-pair edges)
  const bs = boxSize / 2
  const cx = end[0],
    cy = end[1],
    cz = end[2]
  const offsets = [
    [-bs, -bs, -bs],
    [bs, -bs, -bs],
    [bs, bs, -bs],
    [-bs, bs, -bs],
    [-bs, -bs, bs],
    [bs, -bs, bs],
    [bs, bs, bs],
    [-bs, bs, bs],
  ]

  const base = 2
  for (const off of offsets) {
    const v = [cx, cy, cz]
    v[perp1] += off[0]
    v[perp2] += off[1]
    v[ai] += off[2]
    positions.push(v[0], v[1], v[2])
  }

  // 12 edges of the cube
  const boxEdges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ]
  for (const [a, b] of boxEdges) {
    indices.push(base + a, base + b)
  }

  return { positions, indices }
}

function createLineFromData(data: { positions: number[]; indices: number[] }, color: number): Line {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(data.positions, 3))
  geo.setIndex(data.indices)
  return new Line(geo, new LineBasicMaterial({ color }))
}

export class TransformGizmo {
  private translateLines: Line[] = []
  private rotateLines: Line[] = []
  private scaleLines: Line[] = []
  private allLines: Line[] = []

  private scene: Scene | null = null
  private _mode: GizmoMode = 'translate'
  private _target: Object3D | null = null

  size: number

  constructor(size = 3) {
    this.size = size
    this.buildTranslate()
    this.buildRotate()
    this.buildScale()

    this.allLines = [...this.translateLines, ...this.rotateLines, ...this.scaleLines]
    this.applyMode()
  }

  private buildTranslate() {
    const s = this.size
    const tip = s * 0.2
    this.translateLines = [
      createLineFromData(buildArrow('x', s, tip), RED),
      createLineFromData(buildArrow('y', s, tip), GREEN),
      createLineFromData(buildArrow('z', s, tip), BLUE),
    ]
  }

  private buildRotate() {
    const r = this.size * 0.8
    const segs = 48
    this.rotateLines = [
      createLineFromData(buildCircle('x', r, segs), RED),
      createLineFromData(buildCircle('y', r, segs), GREEN),
      createLineFromData(buildCircle('z', r, segs), BLUE),
    ]
  }

  private buildScale() {
    const s = this.size
    const box = s * 0.12
    this.scaleLines = [
      createLineFromData(buildScaleHandle('x', s, box), RED),
      createLineFromData(buildScaleHandle('y', s, box), GREEN),
      createLineFromData(buildScaleHandle('z', s, box), BLUE),
    ]
  }

  private applyMode() {
    for (const l of this.translateLines) l.visible = this._mode === 'translate'
    for (const l of this.rotateLines) l.visible = this._mode === 'rotate'
    for (const l of this.scaleLines) l.visible = this._mode === 'scale'
  }

  get mode() {
    return this._mode
  }

  setMode(mode: GizmoMode) {
    this._mode = mode
    this.applyMode()
  }

  get target() {
    return this._target
  }

  attach(obj: Object3D) {
    this._target = obj
    this.update()
  }

  detach() {
    this._target = null
  }

  update() {
    if (!this._target) return
    const t = this._target
    for (const line of this.allLines) {
      line.position.set(t.position.x, t.position.y, t.position.z)
    }
  }

  addToScene(scene: Scene) {
    this.scene = scene
    for (const line of this.allLines) scene.add(line)
  }

  removeFromScene(scene: Scene) {
    for (const line of this.allLines) scene.remove(line)
    this.scene = null
  }

  set visible(v: boolean) {
    for (const line of this.allLines) {
      // Only show lines for the active mode
      if (v) this.applyMode()
      else line.visible = false
    }
  }

  dispose() {
    if (this.scene) this.removeFromScene(this.scene)
    for (const line of this.allLines) {
      line.geometry.dispose()
      line.material.dispose()
    }
    this.translateLines = []
    this.rotateLines = []
    this.scaleLines = []
    this.allLines = []
  }
}
