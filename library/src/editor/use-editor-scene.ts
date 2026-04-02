import { useCallback, useEffect, useRef } from 'react'

import { ThreeRendererAdapter, RapierPhysicsAdapter } from '../adapters/three/index.ts'
import { createScene, type CreateSceneOptions, type EditorCameraState, type ManaScene } from '../scene.ts'

import type { PhysicsAdapter } from '../adapters/physics-adapter.ts'
import type { RendererAdapter } from '../adapters/renderer-adapter.ts'
import type { SceneData } from '../scene-data.ts'
import type { ManaScript } from '../script.ts'

const defaultCreateRenderer = () => new ThreeRendererAdapter() as RendererAdapter
const defaultCreatePhysics = () => new RapierPhysicsAdapter() as PhysicsAdapter

/** Encapsulates the renderer scene lifecycle for the editor, including creation, disposal, and recreation. */
export function useEditorScene({
  canvasRef,
  sceneData,
  scripts,
  showGizmos,
  transformMode,
  createRenderer = defaultCreateRenderer,
  createPhysics = defaultCreatePhysics,
  coordinateSystem,
  onTransformStart,
  onTransformChange,
  onTransformEnd,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  sceneData: SceneData | null
  scripts: Record<string, ManaScript>
  showGizmos: boolean
  transformMode: string
  createRenderer?: () => RendererAdapter
  createPhysics?: () => PhysicsAdapter
  coordinateSystem?: 'y-up' | 'z-up'
  onTransformStart: (id: string) => void
  onTransformChange: (id: string, transform: import('../scene-data.ts').Transform) => void
  onTransformEnd: (id: string, transform: import('../scene-data.ts').Transform) => void
}) {
  const sceneRef = useRef<ManaScene | null>(null)
  const showGizmosRef = useRef(showGizmos)
  showGizmosRef.current = showGizmos
  const transformModeRef = useRef(transformMode)
  transformModeRef.current = transformMode
  const sceneDataRef = useRef(sceneData)
  sceneDataRef.current = sceneData

  const initializedRef = useRef(false)

  // Create initial scene when sceneData first becomes available
  useEffect(() => {
    const data = sceneDataRef.current
    if (!data || initializedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    initializedRef.current = true

    const renderer = createRenderer()
    const sceneWithCoords = coordinateSystem ? { ...data, coordinateSystem } : data
    createScene(canvas, sceneWithCoords, {
      renderer,
      orbitControls: true,
      onTransformStart,
      onTransformChange,
      onTransformEnd,
    }).then(s => {
      if (!initializedRef.current) {
        s.dispose()
        return
      }
      sceneRef.current = s
      s.setTransformMode(transformModeRef.current as 'translate' | 'rotate' | 'scale')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only create on first sceneData availability; sceneData read via ref
  }, [sceneData, onTransformStart, onTransformChange, onTransformEnd])

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      initializedRef.current = false
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
    }
  }, [])

  // Recreate the scene (for play/stop, scene switch, etc.)
  const recreateScene = useCallback(
    async (data: SceneData, isPlaying: boolean, editorCamera?: EditorCameraState) => {
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
      const canvas = canvasRef.current
      if (!canvas) return

      const renderer = createRenderer()
      const sceneWithCoords = coordinateSystem ? { ...data, coordinateSystem } : data
      const opts: CreateSceneOptions = {
        renderer,
        physics: isPlaying ? createPhysics() : undefined,
        scripts: isPlaying ? scripts : undefined,
        orbitControls: !isPlaying,
        editorCamera: !isPlaying ? editorCamera : undefined,
        onTransformStart: !isPlaying ? onTransformStart : undefined,
        onTransformChange: !isPlaying ? onTransformChange : undefined,
        onTransformEnd: !isPlaying ? onTransformEnd : undefined,
      }
      sceneRef.current = await createScene(canvas, sceneWithCoords, opts)
      if (!isPlaying) {
        sceneRef.current?.setTransformMode(transformModeRef.current as 'translate' | 'rotate' | 'scale')
      }
    },
    [
      scripts,
      canvasRef,
      createRenderer,
      createPhysics,
      coordinateSystem,
      onTransformStart,
      onTransformChange,
      onTransformEnd,
    ],
  )

  // Sync transform mode to the active scene
  useEffect(() => {
    sceneRef.current?.setTransformMode(transformMode as 'translate' | 'rotate' | 'scale')
  }, [transformMode])

  return { sceneRef, recreateScene }
}
