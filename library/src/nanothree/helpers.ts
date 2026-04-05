// Debug helpers for nanothree

import { BufferGeometry, Float32BufferAttribute } from './geometry'
import { Line } from './line'
import { LineBasicMaterial } from './material'

import type { PerspectiveCamera } from './core'
import type { DirectionalLight } from './light'
import type { Scene } from './scene'

// Creates a line-list geometry from an array of vertex pairs
function createLineGeometry(positions: number[], indices: number[]): BufferGeometry {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  return geo
}

/**
 * Visualizes a PerspectiveCamera's frustum as wireframe lines.
 * Call update() after camera parameters change to rebuild the geometry.
 */
export class CameraHelper {
  readonly lines: Line[] = []
  private scene: Scene | null = null
  private line!: Line

  constructor(private camera: PerspectiveCamera) {
    this.line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xffaa00 }))
    this.lines.push(this.line)
    this.update()
  }

  update() {
    const cam = this.camera
    const fovRad = cam.fov * (Math.PI / 180)
    const near = cam.near
    const far = cam.far
    const aspect = cam.aspect

    const nearH = Math.tan(fovRad / 2) * near
    const nearW = nearH * aspect
    const farH = Math.tan(fovRad / 2) * far
    const farW = farH * aspect

    // 8 frustum corners (in camera local space, looking down -Z)
    // Near plane: 0-3, Far plane: 4-7
    const positions = new Float32Array([
      -nearW,
      nearH,
      -near, // 0: near top-left
      nearW,
      nearH,
      -near, // 1: near top-right
      nearW,
      -nearH,
      -near, // 2: near bottom-right
      -nearW,
      -nearH,
      -near, // 3: near bottom-left
      -farW,
      farH,
      -far, // 4: far top-left
      farW,
      farH,
      -far, // 5: far top-right
      farW,
      -farH,
      -far, // 6: far bottom-right
      -farW,
      -farH,
      -far, // 7: far bottom-left
      0,
      0,
      0, // 8: camera origin (for cross)
    ])

    // Line pairs: near edges, far edges, connecting edges, center cross
    const indices = new Uint16Array([
      // Near plane
      0, 1, 1, 2, 2, 3, 3, 0,
      // Far plane
      4, 5, 5, 6, 6, 7, 7, 4,
      // Connecting edges
      0, 4, 1, 5, 2, 6, 3, 7,
      // Cross on near plane
      0, 2, 1, 3,
    ])

    const geo = this.line.geometry
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geo.setIndex(Array.from(indices))
  }

  addToScene(scene: Scene) {
    this.scene = scene
    for (const line of this.lines) scene.add(line)
  }

  removeFromScene(scene: Scene) {
    for (const line of this.lines) scene.remove(line)
    this.scene = null
  }

  setPosition(x: number, y: number, z: number) {
    for (const line of this.lines) line.position.set(x, y, z)
  }

  setRotation(x: number, y: number, z: number) {
    for (const line of this.lines) line.rotation.set(x, y, z)
  }

  set visible(v: boolean) {
    for (const line of this.lines) line.visible = v
  }

  dispose() {
    if (this.scene) this.removeFromScene(this.scene)
    for (const line of this.lines) {
      line.geometry.dispose()
      line.material.dispose()
    }
  }
}

/**
 * Visualizes a DirectionalLight as a plane with a direction line.
 * The helper is positioned at the light's position.
 */
export class DirectionalLightHelper {
  readonly lines: Line[] = []
  private scene: Scene | null = null
  private planeLine!: Line
  private dirLine!: Line

  constructor(
    private light: DirectionalLight,
    private size = 5,
  ) {
    // Square plane
    const s = size / 2
    this.planeLine = new Line(
      createLineGeometry(
        [-s, s, 0, s, s, 0, s, -s, 0, -s, -s, 0, 0, 0, 0, 0, 0, -size * 2],
        [
          0,
          1,
          1,
          2,
          2,
          3,
          3,
          0, // Square
          0,
          2,
          1,
          3, // Cross
          4,
          5, // Direction line
        ],
      ),
      new LineBasicMaterial({ color: 0xffff00 }),
    )
    this.lines.push(this.planeLine)

    this.update()
  }

  update() {
    for (const line of this.lines) {
      line.position.set(this.light.position.x, this.light.position.y, this.light.position.z)
    }
    // Point the direction line toward origin
    const lx = this.light.position.x,
      ly = this.light.position.y,
      lz = this.light.position.z
    const len = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1
    // Compute rotation to face the light direction toward origin
    // Using atan2 for yaw (Y) and pitch (X)
    const yaw = Math.atan2(-lx, -lz)
    const pitch = Math.asin(ly / len)
    for (const line of this.lines) {
      line.rotation.set(-pitch, yaw, 0)
    }
  }

  addToScene(scene: Scene) {
    this.scene = scene
    for (const line of this.lines) scene.add(line)
  }

  removeFromScene(scene: Scene) {
    for (const line of this.lines) scene.remove(line)
    this.scene = null
  }

  set visible(v: boolean) {
    for (const line of this.lines) line.visible = v
  }

  dispose() {
    if (this.scene) this.removeFromScene(this.scene)
    for (const line of this.lines) {
      line.geometry.dispose()
      line.material.dispose()
    }
  }
}
