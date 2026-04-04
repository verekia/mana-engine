import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js'
import { pass, uniform } from 'three/tsl'
import {
  Box3,
  CameraHelper,
  Color,
  DirectionalLight,
  DirectionalLightHelper,
  GridHelper,
  type Object3D,
  type PerspectiveCamera,
  PointLight,
  PointLightHelper,
  RenderPipeline,
  type Scene,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu'

import { snapshotTransform, type ThreeEntityMaps } from './three-entity.ts'

import type { EditorCameraState, RendererAdapterOptions, TransformMode } from '../renderer-adapter.ts'

// Scratch vectors to avoid allocations in hot paths
const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()

export interface ThreeEditorControls {
  update(): void
  dispose(): void
  target: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  enabled?: boolean
}

export interface ThreeTransformControls {
  attach(obj: Object3D): void
  detach(): void
  setMode(mode: TransformMode): void
  setSnap(translate: number | null, rotate: number | null, scale: number | null): void
  setSpace(space: 'local' | 'world'): void
  dispose(): void
  object?: Object3D
}

/**
 * Manages all editor-specific functionality for the Three.js adapter:
 * orbit controls, transform controls, outline post-processing, grid, orthographic views.
 */
export class ThreeEditorHelper {
  controls: ThreeEditorControls | null = null
  transformControls: ThreeTransformControls | null = null
  transformControlsRoot: Object3D | null = null
  renderPipeline: RenderPipeline | null = null
  selectedObjects: Object3D[] = []
  outlinePass: any = null
  selectionColor = new Color(0x4488ff)
  isOrtho = false
  orthoAzimuth = 0
  orthoPolar = 0
  gridHelper: GridHelper | null = null
  defaultTransformSpace: 'local' | 'world' = 'world'

  private maps: ThreeEntityMaps
  private camera: PerspectiveCamera
  private threeScene: Scene
  private renderer: WebGPURenderer
  private options: RendererAdapterOptions

  constructor(
    maps: ThreeEntityMaps,
    camera: PerspectiveCamera,
    threeScene: Scene,
    renderer: WebGPURenderer,
    options: RendererAdapterOptions,
  ) {
    this.maps = maps
    this.camera = camera
    this.threeScene = threeScene
    this.renderer = renderer
    this.options = options
  }

  async setupEditorControls(canvas: HTMLCanvasElement): Promise<void> {
    const options = this.options
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
    const orbitControls = new OrbitControls(this.camera, canvas)
    const camState = options.editorCamera
    if (camState) {
      orbitControls.target.set(...camState.target)
      orbitControls.update()
    }
    this.controls = orbitControls

    const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')
    const tc = new TransformControls(this.camera, canvas)
    this.threeScene.add(tc.getHelper())
    this.transformControlsRoot = tc.getHelper()

    tc.addEventListener('dragging-changed', event => {
      orbitControls.enabled = !event.value
    })

    let attachedEntityId: string | null = null

    tc.addEventListener('mouseDown', () => {
      if (attachedEntityId) options.onTransformStart?.(attachedEntityId)
    })

    tc.addEventListener('mouseUp', () => {
      if (attachedEntityId && tc.object) {
        options.onTransformEnd?.(attachedEntityId, snapshotTransform(tc.object))
      }
    })

    tc.addEventListener('objectChange', () => {
      if (attachedEntityId && tc.object) {
        const wf = this.maps.debugWireframes.get(attachedEntityId)
        if (wf) {
          wf.position.copy(tc.object.position)
          wf.rotation.copy(tc.object.rotation)
          wf.scale.copy(tc.object.scale)
        }
        options.onTransformChange?.(attachedEntityId, snapshotTransform(tc.object))
      }
    })

    this.transformControls = {
      attach: (obj: Object3D) => {
        tc.attach(obj)
        for (const [id, entityObj] of this.maps.entityObjects) {
          if (entityObj === obj) {
            attachedEntityId = id
            break
          }
        }
      },
      detach: () => {
        tc.detach()
        attachedEntityId = null
      },
      setMode: (mode: TransformMode) => tc.setMode(mode),
      setSnap: (translate: number | null, rotate: number | null, scale: number | null) => {
        tc.translationSnap = translate
        tc.rotationSnap = rotate != null ? (rotate * Math.PI) / 180 : null
        tc.scaleSnap = scale
      },
      setSpace: (space: 'local' | 'world') => {
        tc.space = space
      },
      dispose: () => {
        tc.detach()
        tc.dispose()
        this.threeScene.remove(tc.getHelper())
      },
      get object() {
        return tc.object
      },
    }

    // Outline post-processing
    const edgeThickness = uniform(1.0)
    const edgeGlow = uniform(0.0)
    this.outlinePass = outline(this.threeScene, this.camera, {
      selectedObjects: this.selectedObjects,
      edgeThickness,
      edgeGlow,
    })
    const visibleEdgeColor = uniform(new Color(0x4488ff))
    const outlineColor = this.outlinePass.visibleEdge.mul(visibleEdgeColor).mul(uniform(3.0))
    const scenePass = pass(this.threeScene, this.camera)
    this.renderPipeline = new RenderPipeline(this.renderer)
    this.renderPipeline.outputNode = outlineColor.add(scenePass)
  }

  setGizmos(enabled: boolean): void {
    for (const wireframe of this.maps.debugWireframes.values()) {
      wireframe.visible = enabled
    }
    for (const helper of this.maps.gizmoHelpers.values()) {
      helper.visible = enabled
    }
    if (this.gridHelper) this.gridHelper.visible = enabled
  }

  setSelectedEntities(ids: string[]): void {
    this.selectedObjects.length = 0
    for (const id of ids) {
      const obj = this.maps.entityObjects.get(id)
      if (obj) this.selectedObjects.push(obj)
    }
    if (this.outlinePass) {
      this.outlinePass.selectedObjects = this.selectedObjects
    }
    const selectedSet = new Set(ids)
    for (const [id, helper] of this.maps.gizmoHelpers) {
      const isSelected = selectedSet.has(id)
      helper.traverse(child => {
        if ('material' in child) {
          const mat = child.material as import('three/webgpu').LineBasicMaterial
          if (isSelected) {
            mat.color.copy(this.selectionColor)
          } else if (helper instanceof CameraHelper) {
            mat.color.set(0xffffff)
          } else if (helper instanceof DirectionalLightHelper) {
            const entity = this.maps.entityObjects.get(id) as DirectionalLight
            mat.color.copy(entity.color)
          } else if (helper instanceof PointLightHelper) {
            const entity = this.maps.entityObjects.get(id) as PointLight
            mat.color.copy(entity.color)
          } else {
            mat.color.set(0xe99444) // Audio / default helper color
          }
        }
      })
    }
  }

  setTransformTarget(id: string | null): void {
    if (!this.transformControls) return
    if (id) {
      const obj = this.maps.entityObjects.get(id)
      if (obj) this.transformControls.attach(obj)
    } else {
      this.transformControls.detach()
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.transformControls?.setMode(mode)
  }

  setTransformSnap(translate: number | null, rotate: number | null, scale: number | null): void {
    this.transformControls?.setSnap(translate, rotate, scale)
  }

  setTransformSpace(space: 'local' | 'world'): void {
    this.transformControls?.setSpace(space)
  }

  getEditorCamera(): EditorCameraState | null {
    if (!this.controls) return null
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    }
  }

  setEditorCamera(state: EditorCameraState): void {
    if (!this.controls) return
    this.camera.position.set(...state.position)
    this.controls.target.set(...state.target)
    this.controls.update()
  }

  frameEntity(id: string): void {
    if (!this.controls) return
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return
    const box = new Box3().setFromObject(obj)
    if (box.isEmpty()) return
    const center = box.getCenter(_v1)
    const size = box.getSize(_v2)
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = this.camera.fov * (Math.PI / 180)
    const dist = Math.max(maxDim / (2 * Math.tan(fov / 2)), 2)
    const dir = _v3.subVectors(this.camera.position, this.controls.target as unknown as Vector3).normalize()
    this.camera.position.copy(center).addScaledVector(dir, dist)
    ;(this.controls.target as unknown as Vector3).copy(center)
    this.controls.update()
  }

  setOrthographicView(view: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' | 'perspective'): void {
    if (!this.controls) return

    if (view === 'perspective') {
      this.isOrtho = false
      this.camera.updateProjectionMatrix()
      return
    }

    const t = this.controls.target
    const target = _v1.set(t.x, t.y, t.z)
    const dist = this.camera.position.distanceTo(target)

    // Position camera along the view axis at the current distance
    const offsets: Record<string, [number, number, number]> = {
      front: [0, 0, 1],
      back: [0, 0, -1],
      right: [1, 0, 0],
      left: [-1, 0, 0],
      top: [0, 1, 0],
      bottom: [0, -1, 0],
    }
    const dir = offsets[view]
    this.camera.position.set(target.x + dir[0] * dist, target.y + dir[1] * dist, target.z + dir[2] * dist)
    this.camera.lookAt(target)
    this.controls.update()
    // Store spherical coords to detect user rotation later
    const offset = _v2.subVectors(this.camera.position, target)
    this.orthoAzimuth = Math.atan2(offset.x, offset.z)
    this.orthoPolar = Math.acos(Math.max(-1, Math.min(1, offset.y / offset.length())))
    this.isOrtho = true
  }

  render(): void {
    if (this.isOrtho) {
      // Override projection to orthographic based on distance to target
      const dist = this.camera.position.distanceTo(
        this.controls
          ? _v1.set(this.controls.target.x, this.controls.target.y, this.controls.target.z)
          : _v1.set(0, 0, 0),
      )
      const halfH = dist * Math.tan(((this.camera.fov / 2) * Math.PI) / 180)
      const halfW = halfH * this.camera.aspect
      this.camera.projectionMatrix.makeOrthographic(
        -halfW,
        halfW,
        halfH,
        -halfH,
        this.camera.near,
        this.camera.far,
        this.renderer.coordinateSystem,
      )
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
    }
    if (this.renderPipeline) {
      this.renderPipeline.render()
    } else {
      this.renderer.render(this.threeScene, this.camera)
    }
  }

  updateControls(): void {
    if (!this.controls) return
    this.controls.update()

    // Detect orbit rotation while in ortho mode — return to perspective
    if (this.isOrtho) {
      const t = this.controls.target
      const offset = _v1.subVectors(this.camera.position, _v2.set(t.x, t.y, t.z))
      const az = Math.atan2(offset.x, offset.z)
      const polar = Math.acos(Math.max(-1, Math.min(1, offset.y / offset.length())))
      if (Math.abs(az - this.orthoAzimuth) > 0.01 || Math.abs(polar - this.orthoPolar) > 0.01) {
        this.isOrtho = false
        this.camera.updateProjectionMatrix()
      }
    }
  }

  dispose(): void {
    this.transformControls?.dispose()
    this.controls?.dispose()
    this.renderPipeline?.dispose()
    if (this.gridHelper) {
      this.gridHelper.removeFromParent()
      this.gridHelper.dispose()
    }
  }
}
