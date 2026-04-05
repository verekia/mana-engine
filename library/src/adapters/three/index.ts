import {
  AmbientLight,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  GridHelper,
  Group,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PointLight,
  RenderPipeline,
  Scene,
  type Texture,
  WebGPURenderer,
} from 'three/webgpu'

import { resolveAsset } from '../../assets.ts'
import { ThreeAnimationHelper } from './three-animation.ts'
import { ThreeEditorHelper } from './three-editor.ts'
import {
  applyMaterialData,
  applyModelMaterialOverride,
  applyShadowProps,
  applyTransform,
  createColliderWireframe,
  createThreeEntityObject,
  disposeEntityObject,
  type ThreeEntityMaps,
} from './three-entity.ts'
import { ThreeParticleHelper } from './three-particles.ts'
import { ThreeRaycastHelper } from './three-raycast.ts'

import type { PostProcessingData, SceneData, SceneEntity, SkyboxData } from '../../scene-data.ts'
import type {
  RaycastHit,
  RendererAdapter,
  RendererAdapterOptions,
  EditorCameraState,
  TransformMode,
} from '../renderer-adapter.ts'

const rendererCache = new WeakMap<HTMLCanvasElement, WebGPURenderer>()

async function getOrCreateRenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  let renderer = rendererCache.get(canvas)
  if (!renderer) {
    renderer = new WebGPURenderer({ canvas, antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    await renderer.init()
    rendererCache.set(canvas, renderer)
  }
  return renderer
}

/**
 * RendererAdapter implementation backed by Three.js (WebGPU renderer).
 *
 * Supports Lambert shading, directional/point/ambient lights, GLTF models,
 * editor orbit controls, transform gizmos, and outline post-processing.
 */
export class ThreeRendererAdapter implements RendererAdapter {
  private renderer!: WebGPURenderer
  private threeScene!: Scene
  private camera!: PerspectiveCamera
  private gameCam: PerspectiveCamera | null = null
  private maps: ThreeEntityMaps = {
    entityObjects: new Map(),
    debugWireframes: new Map(),
    gizmoHelpers: new Map(),
  }
  private sceneRoot!: Group
  private observer: ResizeObserver | null = null
  private enableOrbitControls = false
  private showGizmos = false
  private isYUp = true

  // Skybox / environment map
  private envTexture: Texture | null = null

  // Post-processing (play mode bloom)
  private bloomPass: any = null
  private postProcessingPipeline: any = null
  private postProcessingSettings: PostProcessingData | undefined = undefined

  // Composed helpers
  private animation!: ThreeAnimationHelper
  private particles!: ThreeParticleHelper
  private editor: ThreeEditorHelper | null = null
  private raycastHelper!: ThreeRaycastHelper

  async init(canvas: HTMLCanvasElement, options: RendererAdapterOptions): Promise<void> {
    this.enableOrbitControls = options.orbitControls ?? false
    this.showGizmos = options.showGizmos ?? false

    this.renderer = await getOrCreateRenderer(canvas)
    this.threeScene = new Scene()
    this.threeScene.background = new Color('#111111')
    this.sceneRoot = new Group()
    this.threeScene.add(this.sceneRoot)

    this.animation = new ThreeAnimationHelper(this.maps)
    this.particles = new ThreeParticleHelper()

    // Set up camera
    if (this.enableOrbitControls) {
      this.camera = new PerspectiveCamera(50, 1, 0.1, 1000)
      const camState = options.editorCamera
      if (camState) {
        this.camera.position.set(...camState.position)
      } else {
        this.camera.position.set(5, 5, 10)
      }
      this.camera.lookAt(0, 0, 0)
      this.editor = new ThreeEditorHelper(this.maps, this.camera, this.threeScene, this.renderer, options)
      await this.editor.setupEditorControls(canvas)
    }

    this.raycastHelper = new ThreeRaycastHelper(
      this.maps,
      () => this.camera,
      () => this.sceneRoot,
      () => this.editor?.transformControlsRoot ?? null,
    )

    // Resize observer
    this.observer = new ResizeObserver(() => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w || canvas.height !== h) {
        this.renderer.setSize(w, h, false)
        if (this.camera) {
          this.camera.aspect = w / h
          this.camera.updateProjectionMatrix()
        }
        this.render()
      }
    })
    this.observer.observe(canvas)

    const initW = canvas.clientWidth
    const initH = canvas.clientHeight
    if (initW > 0 && initH > 0) {
      this.renderer.setSize(initW, initH, false)
      if (this.camera) {
        this.camera.aspect = initW / initH
        this.camera.updateProjectionMatrix()
      }
    }
  }

  render(): void {
    if (this.editor) {
      this.editor.render()
    } else if (this.postProcessingPipeline) {
      this.postProcessingPipeline.render()
    } else {
      this.renderer.render(this.threeScene, this.camera)
    }
  }

  updateControls(): void {
    this.editor?.updateControls()
  }

  dispose(): void {
    this.observer?.disconnect()
    this.editor?.dispose()
    // Remove from cache so the next init() on this canvas creates a fresh renderer
    rendererCache.delete(this.renderer.domElement)

    // Clean up skybox / environment texture
    if (this.envTexture) {
      this.envTexture.dispose()
      this.envTexture = null
    }
    // Clean up post-processing pipeline
    if (this.postProcessingPipeline) {
      this.postProcessingPipeline.dispose()
      this.postProcessingPipeline = null
      this.bloomPass = null
    }

    for (const wireframe of this.maps.debugWireframes.values()) {
      wireframe.geometry.dispose()
      ;(wireframe.material as LineBasicMaterial).dispose()
      wireframe.parent?.remove(wireframe)
    }
    for (const helper of this.maps.gizmoHelpers.values()) {
      helper.parent?.remove(helper)
      helper.traverse(child => {
        if ('geometry' in child) (child as Mesh).geometry?.dispose()
        if ('material' in child) {
          const mat = (child as Mesh).material
          if (mat instanceof LineBasicMaterial || mat instanceof MeshStandardMaterial) mat.dispose()
        }
      })
    }
    for (const obj of this.maps.entityObjects.values()) {
      disposeEntityObject(obj)
    }
    this.maps.entityObjects.clear()
    this.maps.debugWireframes.clear()
    this.maps.gizmoHelpers.clear()
  }

  async loadScene(sceneData: SceneData): Promise<void> {
    this.threeScene.background = new Color(sceneData.background ?? '#111111')
    const isZUp = sceneData.coordinateSystem === 'z-up'
    this.isYUp = !isZUp
    this.sceneRoot.rotation.x = isZUp ? -Math.PI / 2 : 0
    if (isZUp && this.editor) {
      this.editor.defaultTransformSpace = 'local'
      this.editor.transformControls?.setSpace('local')
    }
    this.gameCam = null

    // Grid helper (editor only) — added to sceneRoot so it respects coordinate system rotation
    if (this.editor?.gridHelper) {
      this.editor.gridHelper.removeFromParent()
      this.editor.gridHelper.dispose()
    }
    if (this.enableOrbitControls && this.editor) {
      this.editor.gridHelper = new GridHelper(100, 100, 0x444444, 0x222222)
      this.editor.gridHelper.visible = this.showGizmos
      this.sceneRoot.add(this.editor.gridHelper)
    }

    // Skybox / environment map
    this.applySkybox(sceneData.skybox)

    // Post-processing (play mode only — editor uses its own outline pipeline)
    this.postProcessingSettings = sceneData.postProcessing
    if (!this.editor) {
      this.setupPostProcessing(sceneData.postProcessing)
    }

    const addEntities = (entities: SceneEntity[], parent: Object3D) => {
      for (const entity of entities) {
        const obj = createThreeEntityObject(entity, parent, this.maps, {
          enableOrbitControls: this.enableOrbitControls,
          showGizmos: this.showGizmos,
          renderer: this.renderer,
          isYUp: this.isYUp,
          onAnimationClips: this.animation.onAnimationClips,
        })
        if (entity.type === 'camera' && obj instanceof PerspectiveCamera) {
          this.gameCam = obj
        }
        if (entity.type === 'particles' && obj) {
          this.particles.addEmitter(entity.id, entity.particles, obj)
        }
        if (entity.children?.length && obj) {
          addEntities(entity.children, obj)
        }
      }
    }
    addEntities(sceneData.entities, this.sceneRoot)

    // In play mode the game camera drives rendering
    if (!this.enableOrbitControls) {
      if (!this.gameCam) {
        this.gameCam = new PerspectiveCamera(50, 1, 0.1, 100)
        this.gameCam.position.set(0, 1, 3)
        this.gameCam.lookAt(0, 0, 0)
      }
      this.camera = this.gameCam
      const w = this.renderer.domElement.clientWidth
      const h = this.renderer.domElement.clientHeight
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
      }
    }
  }

  // ── Skybox / Environment Map ───��──────────────────────────────────────────

  private applySkybox(skybox?: SkyboxData): void {
    // Clean up previous env texture
    if (this.envTexture) {
      this.envTexture.dispose()
      this.envTexture = null
      this.threeScene.environment = null
    }

    if (!skybox?.source) return

    const url = resolveAsset(skybox.source)
    import('three/examples/jsm/loaders/RGBELoader.js')
      .then(({ RGBELoader }) => {
        const loader = new RGBELoader()
        loader.load(
          url,
          texture => {
            texture.mapping = EquirectangularReflectionMapping
            this.envTexture = texture
            this.threeScene.environment = texture
            this.threeScene.environmentIntensity = skybox.intensity ?? 1
            if (skybox.showBackground !== false) {
              this.threeScene.background = texture
              this.threeScene.backgroundBlurriness = skybox.backgroundBlur ?? 0
            }
          },
          undefined,
          err => console.warn(`[mana] Failed to load skybox HDR "${skybox.source}":`, err),
        )
      })
      .catch(err => console.warn('[mana] Failed to load RGBELoader:', err))
  }

  updateBackground(color: string): void {
    // Only update if no skybox is showing as background
    if (!this.envTexture || !this.threeScene.background || this.threeScene.background instanceof Color) {
      this.threeScene.background = new Color(color)
    }
  }

  updateSkybox(skybox: SkyboxData | undefined): void {
    this.applySkybox(skybox)
  }

  // ── Post-processing (bloom) ─────────────────────���────────────────────────���

  private setupPostProcessing(settings?: PostProcessingData): void {
    // Dispose previous pipeline
    if (this.postProcessingPipeline) {
      this.postProcessingPipeline.dispose()
      this.postProcessingPipeline = null
      this.bloomPass = null
    }

    if (!settings?.bloom) return

    // Three.js WebGPU TSL-based bloom post-processing
    Promise.all([import('three/tsl'), import('three/examples/jsm/tsl/display/BloomNode.js')])
      .then(([{ pass }, { bloom }]) => {
        const scenePass = pass(this.threeScene, this.camera)
        const scenePassColor = scenePass.getTextureNode('output')
        const bloomResult = bloom(
          scenePassColor,
          settings.bloomIntensity ?? 0.5,
          settings.bloomRadius ?? 0.4,
          settings.bloomThreshold ?? 0.8,
        )
        const pipeline = new RenderPipeline(this.renderer)
        pipeline.outputNode = scenePassColor.add(bloomResult)
        this.postProcessingPipeline = pipeline
        this.bloomPass = bloomResult
      })
      .catch(err => console.warn('[mana] Failed to setup bloom post-processing:', err))
  }

  updatePostProcessing(settings: PostProcessingData | undefined): void {
    this.postProcessingSettings = settings
    if (!this.editor) {
      this.setupPostProcessing(settings)
    }
  }

  async addEntity(entity: SceneEntity, parentId?: string): Promise<void> {
    const parent = parentId ? (this.maps.entityObjects.get(parentId) ?? this.sceneRoot) : this.sceneRoot
    const obj = createThreeEntityObject(entity, parent, this.maps, {
      enableOrbitControls: this.enableOrbitControls,
      showGizmos: this.showGizmos,
      renderer: this.renderer,
      isYUp: this.isYUp,
      onAnimationClips: this.animation.onAnimationClips,
    })
    if (entity.type === 'particles' && obj) {
      this.particles.addEmitter(entity.id, entity.particles, obj)
    }
    if (entity.children?.length && obj) {
      for (const child of entity.children) {
        await this.addEntity(child, entity.id)
      }
    }
  }

  removeEntity(id: string): void {
    if (
      this.editor?.transformControls?.object &&
      this.maps.entityObjects.get(id) === this.editor.transformControls.object
    ) {
      this.editor.transformControls.detach()
    }
    const obj = this.maps.entityObjects.get(id)
    if (obj) {
      obj.parent?.remove(obj)
      disposeEntityObject(obj)
      this.maps.entityObjects.delete(id)
    }
    const wireframe = this.maps.debugWireframes.get(id)
    if (wireframe) {
      wireframe.parent?.remove(wireframe)
      wireframe.geometry.dispose()
      ;(wireframe.material as LineBasicMaterial).dispose()
      this.maps.debugWireframes.delete(id)
    }
    const helper = this.maps.gizmoHelpers.get(id)
    if (helper) {
      helper.parent?.remove(helper)
      this.maps.gizmoHelpers.delete(id)
    }
    this.animation.removeEntity(id)
    this.particles.removeEmitter(id)
  }

  updateEntity(id: string, entity: SceneEntity): void {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return
    applyTransform(obj, entity.transform)

    const oldWireframe = this.maps.debugWireframes.get(id)
    if (entity.collider && this.showGizmos) {
      if (oldWireframe) {
        oldWireframe.parent?.remove(oldWireframe)
        oldWireframe.geometry.dispose()
        ;(oldWireframe.material as LineBasicMaterial).dispose()
      }
      const newWireframe = createColliderWireframe(entity.collider)
      newWireframe.position.copy(obj.position)
      newWireframe.rotation.copy(obj.rotation)
      this.sceneRoot.add(newWireframe)
      this.maps.debugWireframes.set(id, newWireframe)
    } else if (oldWireframe) {
      oldWireframe.position.copy(obj.position)
      oldWireframe.rotation.copy(obj.rotation)
      oldWireframe.scale.copy(obj.scale)
    }

    if (entity.type === 'mesh' && obj instanceof Mesh) {
      applyMaterialData(obj.material as MeshStandardMaterial, entity.mesh?.material, this.renderer)
      applyShadowProps(obj, entity)
    }
    if (
      (entity.type === 'directional-light' || entity.type === 'ambient-light' || entity.type === 'point-light') &&
      (obj instanceof DirectionalLight || obj instanceof AmbientLight || obj instanceof PointLight)
    ) {
      if (entity.light?.color) obj.color.set(entity.light.color)
      if (entity.light?.intensity !== undefined) obj.intensity = entity.light.intensity * Math.PI
      if (entity.light?.castShadow !== undefined && (obj instanceof DirectionalLight || obj instanceof PointLight)) {
        obj.castShadow = entity.light.castShadow
      }
    }
    if (entity.type === 'model' && obj instanceof Group) {
      if (entity.model?.material) {
        applyModelMaterialOverride(obj, entity.model.material, this.renderer)
      }
      applyShadowProps(obj, entity)
    }
    // Sync audio helper transform
    if (entity.type === 'audio') {
      const helper = this.maps.gizmoHelpers.get(id)
      if (helper) applyTransform(helper, entity.transform)
    }
  }

  setEntityVisible(id: string, visible: boolean): void {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return
    const isHelperOnly = obj instanceof DirectionalLight || obj instanceof AmbientLight || obj instanceof PointLight
    if (isHelperOnly) {
      const helper = this.maps.gizmoHelpers.get(id)
      if (helper) helper.visible = visible
    } else {
      obj.visible = visible
    }
    if (!isHelperOnly) {
      const wireframe = this.maps.debugWireframes.get(id)
      if (wireframe) wireframe.visible = visible
      const helper = this.maps.gizmoHelpers.get(id)
      if (helper) helper.visible = visible
    }
  }

  setEntityPhysicsTransform(
    id: string,
    position: [number, number, number],
    quaternion: [number, number, number, number],
  ): void {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return
    obj.position.set(...position)
    obj.quaternion.set(...quaternion)
  }

  getEntityNativeObject(id: string): unknown {
    return this.maps.entityObjects.get(id) ?? null
  }

  getNativeScene(): unknown {
    return this.threeScene
  }

  // ── Editor delegation ──────────────────────────────────────────────────────

  setGizmos(enabled: boolean): void {
    this.editor?.setGizmos(enabled)
  }

  setSelectedEntities(ids: string[]): void {
    this.editor?.setSelectedEntities(ids)
  }

  setTransformTarget(id: string | null): void {
    this.editor?.setTransformTarget(id)
  }

  setTransformMode(mode: TransformMode): void {
    this.editor?.setTransformMode(mode)
  }

  setTransformSnap(translate: number | null, rotate: number | null, scale: number | null): void {
    this.editor?.setTransformSnap(translate, rotate, scale)
  }

  setTransformSpace(space: 'local' | 'world'): void {
    this.editor?.setTransformSpace(space)
  }

  getEditorCamera(): EditorCameraState | null {
    return this.editor?.getEditorCamera() ?? null
  }

  setEditorCamera(state: EditorCameraState): void {
    this.editor?.setEditorCamera(state)
  }

  frameEntity(id: string): void {
    this.editor?.frameEntity(id)
  }

  setOrthographicView(view: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' | 'perspective'): void {
    this.editor?.setOrthographicView(view)
  }

  // ── Raycast delegation ─────────────────────────────────────────────────────

  raycast(ndcX: number, ndcY: number): string | null {
    return this.raycastHelper.raycast(ndcX, ndcY)
  }

  raycastWorld(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance?: number,
  ): RaycastHit | null {
    return this.raycastHelper.raycastWorld(origin, direction, maxDistance)
  }

  // ── Animation delegation ───────────────────────────────────────────────────

  playAnimation(entityId: string, name: string, options?: { loop?: boolean; crossFadeDuration?: number }): void {
    this.animation.playAnimation(entityId, name, options)
  }

  stopAnimation(entityId: string): void {
    this.animation.stopAnimation(entityId)
  }

  getAnimationNames(entityId: string): string[] {
    return this.animation.getAnimationNames(entityId)
  }

  updateAnimations(dt: number): void {
    this.animation.updateAnimations(dt)
  }

  // ── Particle delegation ───────────────────────────────────────────────────

  updateParticles(dt: number): void {
    this.particles.update(dt)
  }

  emitParticleBurst(entityId: string, count?: number): void {
    this.particles.emitParticleBurst(entityId, count)
  }

  resetParticles(entityId: string): void {
    this.particles.resetParticles(entityId)
  }

  // ── Entity transform helpers ───────────────────────────────────────────────

  /** Get the initial transform of an entity for physics seeding (position + quaternion). */
  getEntityInitialPhysicsTransform(id: string): import('../physics-adapter.ts').PhysicsTransform | null {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return null
    return {
      position: [obj.position.x, obj.position.y, obj.position.z],
      quaternion: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
    }
  }

  getEntityPosition(id: string): [number, number, number] | null {
    const obj = this.maps.entityObjects.get(id)
    if (!obj) return null
    return [obj.position.x, obj.position.y, obj.position.z]
  }

  setEntityPosition(id: string, x: number, y: number, z: number): void {
    const obj = this.maps.entityObjects.get(id)
    if (obj) obj.position.set(x, y, z)
  }

  setEntityEulerRotation(id: string, x: number, y: number, z: number): void {
    const obj = this.maps.entityObjects.get(id)
    if (obj) obj.rotation.set(x, y, z)
  }

  setEntityScale(id: string, x: number, y: number, z: number): void {
    const obj = this.maps.entityObjects.get(id)
    if (obj) obj.scale.set(x, y, z)
  }
}
