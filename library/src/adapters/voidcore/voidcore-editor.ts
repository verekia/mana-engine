import { Mesh, type Node, type OrbitControls, type PerspectiveCamera, vec3Set } from 'voidcore'

import { yUpToZUp, zUpToYUp } from './voidcore-utils.ts'

import type { EditorCameraState, TransformMode } from '../renderer-adapter.ts'
import type { TransformGizmo } from './transform-gizmo.ts'

/** Internal OrbitControls properties needed to kill inertia on ortho view snap. */
interface OrbitControlsInternals {
  _velocityAz: number
  _velocityEl: number
  _velocityDist: number
  _velocityPanX: number
  _velocityPanY: number
}

/** Outline thickness for selected entities. */
const SELECTION_OUTLINE_THICKNESS = 0.1
const SELECTION_OUTLINE_COLOR: [number, number, number] = [0.27, 0.53, 1]

export function applyOutline(node: Node): void {
  if (node instanceof Mesh) {
    node.outline = {
      thickness: SELECTION_OUTLINE_THICKNESS,
      color: SELECTION_OUTLINE_COLOR,
    }
  }
  // For groups (e.g. capsule wrappers, model groups), apply to child meshes
  for (const child of node.children) {
    applyOutline(child)
  }
}

export function clearOutline(node: Node): void {
  if (node instanceof Mesh) {
    node.outline = undefined
  }
  for (const child of node.children) {
    clearOutline(child)
  }
}

export function setGizmos(
  enabled: boolean,
  gridGroup: import('voidcore').Group | null,
  debugWireframes: Map<string, Node>,
): void {
  if (gridGroup) gridGroup.visible = enabled
  for (const wireframe of debugWireframes.values()) {
    wireframe.visible = enabled
  }
}

export function setSelectedEntities(
  ids: string[],
  selectedIds: Set<string>,
  entityNodes: Map<string, Node>,
): Set<string> {
  // Remove outline from previously selected entities
  for (const prevId of selectedIds) {
    if (!ids.includes(prevId)) {
      const node = entityNodes.get(prevId)
      if (node) clearOutline(node)
    }
  }

  const newSelectedIds = new Set(ids)

  // Apply outline to newly selected entities
  for (const id of ids) {
    const node = entityNodes.get(id)
    if (node) applyOutline(node)
  }

  return newSelectedIds
}

export function setTransformTarget(
  transformGizmo: TransformGizmo | null,
  id: string | null,
  entityNodes: Map<string, Node>,
): void {
  if (!transformGizmo) return
  if (id) {
    const node = entityNodes.get(id)
    if (node) transformGizmo.attach(node, id)
  } else {
    transformGizmo.detach()
  }
}

export function setTransformMode(transformGizmo: TransformGizmo | null, mode: TransformMode): void {
  transformGizmo?.setMode(mode)
}

export function setTransformSnap(
  transformGizmo: TransformGizmo | null,
  translate: number | null,
  rotate: number | null,
  scale: number | null,
): void {
  transformGizmo?.setSnap(translate, rotate, scale)
}

export function getEditorCamera(
  controls: OrbitControls | null,
  camera: PerspectiveCamera,
  isYUp: boolean,
): EditorCameraState | null {
  if (!controls) return null
  const p = camera.position
  const t = controls.target
  // Convert from VoidCore Z-up back to scene coordinates
  if (isYUp) {
    return {
      position: zUpToYUp(p[0], p[1], p[2]),
      target: zUpToYUp(t[0], t[1], t[2]),
    }
  }
  return {
    position: [p[0], p[1], p[2]],
    target: [t[0], t[1], t[2]],
  }
}

export function setEditorCamera(controls: OrbitControls | null, state: EditorCameraState, isYUp: boolean): void {
  if (!controls) return
  let cx: number, cy: number, cz: number, tx: number, ty: number, tz: number
  if (isYUp) {
    ;[cx, cy, cz] = yUpToZUp(state.position[0], state.position[1], state.position[2])
    ;[tx, ty, tz] = yUpToZUp(state.target[0], state.target[1], state.target[2])
  } else {
    ;[cx, cy, cz] = state.position
    ;[tx, ty, tz] = state.target
  }
  vec3Set(controls.target, tx, ty, tz)
  const dx = cx - tx,
    dy = cy - ty,
    dz = cz - tz
  controls.distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  controls.elevation = Math.asin(Math.max(-1, Math.min(1, dz / controls.distance)))
  controls.azimuth = Math.atan2(dy, dx)
  controls.update(0)
}

export function frameEntity(
  controls: OrbitControls | null,
  camera: PerspectiveCamera,
  entityNodes: Map<string, Node>,
  id: string,
  isYUp: boolean,
): void {
  if (!controls) return
  const node = entityNodes.get(id)
  if (!node) return
  const p = node.position
  // Target the entity's position; set camera distance to at least 5 units
  const t = controls.target
  const dx = camera.position[0] - t[0]
  const dy = camera.position[1] - t[1]
  const dz = camera.position[2] - t[2]
  const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const dist = Math.max(currentDist, 5)

  // Convert entity position to VoidCore Z-up if needed
  let tx: number, ty: number, tz: number
  if (isYUp) {
    ;[tx, ty, tz] = yUpToZUp(p[0], p[1], p[2])
  } else {
    ;[tx, ty, tz] = [p[0], p[1], p[2]]
  }

  vec3Set(controls.target, tx, ty, tz)
  const camDx = camera.position[0] - tx
  const camDy = camera.position[1] - ty
  const camDz = camera.position[2] - tz
  controls.distance = dist
  controls.elevation = Math.asin(
    Math.max(-1, Math.min(1, camDz / (Math.sqrt(camDx * camDx + camDy * camDy + camDz * camDz) || 1))),
  )
  controls.azimuth = Math.atan2(camDy, camDx)
  controls.update(0)
}

export function setOrthographicView(
  controls: OrbitControls | null,
  camera: PerspectiveCamera,
  isYUp: boolean,
  view: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' | 'perspective',
): boolean {
  if (!controls) return false

  if (view === 'perspective') {
    camera._projectionDirty = true
    return false
  }

  const t = controls.target
  const dist = controls.distance

  // View directions in scene coordinates (y-up), converted if needed
  const sceneOffsets: Record<string, [number, number, number]> = {
    front: [0, 0, 1],
    back: [0, 0, -1],
    right: [1, 0, 0],
    left: [-1, 0, 0],
    top: [0, 1, 0],
    bottom: [0, -1, 0],
  }
  let [ox, oy, oz] = sceneOffsets[view]
  if (isYUp) {
    ;[ox, oy, oz] = yUpToZUp(ox, oy, oz)
  }

  const cz = t[2] + oz * dist
  const dz = cz - t[2]
  controls.distance = dist
  controls.elevation = Math.asin(Math.max(-1, Math.min(1, dz / dist)))
  controls.azimuth = Math.atan2(t[1] + oy * dist - t[1], t[0] + ox * dist - t[0])
  // Kill any inertia so the view snaps cleanly
  const internals = controls as unknown as OrbitControlsInternals
  internals._velocityAz = 0
  internals._velocityEl = 0
  internals._velocityDist = 0
  internals._velocityPanX = 0
  internals._velocityPanY = 0
  controls.update(0)
  return true
}
