import { useCallback, useEffect, useRef } from 'react'

import { createScene, type CreateSceneOptions, type EditorCameraState, type ManaScene } from '../scene.ts'

import type { PhysicsAdapter } from '../adapters/physics-adapter.ts'
import type { RendererAdapter } from '../adapters/renderer-adapter.ts'
import type { PrefabData, SceneData } from '../scene-data.ts'
import type { ManaScript } from '../script.ts'

/** Encapsulates the renderer scene lifecycle for the editor, including creation, disposal, and recreation. */
export function useEditorScene({
  canvasRef,
  sceneData,
  scripts,
  prefabs,
  showGizmos,
  transformMode,
  snapEnabled,
  transformSpace,
  createRenderer,
  createPhysics,
  coordinateSystem,
  onTransformStart,
  onTransformChange,
  onTransformEnd,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  sceneData: SceneData | null
  scripts: Record<string, ManaScript>
  prefabs?: Record<string, PrefabData>
  showGizmos: boolean
  transformMode: string
  snapEnabled: boolean
  transformSpace: 'local' | 'world'
  createRenderer: () => RendererAdapter
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
  const snapEnabledRef = useRef(snapEnabled)
  snapEnabledRef.current = snapEnabled
  const transformSpaceRef = useRef(transformSpace)
  transformSpaceRef.current = transformSpace
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
      if (snapEnabledRef.current) s.setTransformSnap(1, 15, 0.25)
      s.setTransformSpace(transformSpaceRef.current)
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
        physics: isPlaying ? createPhysics?.() : undefined,
        scripts: isPlaying ? scripts : undefined,
        prefabs: isPlaying ? prefabs : undefined,
        orbitControls: !isPlaying,
        editorCamera: !isPlaying ? editorCamera : undefined,
        onTransformStart: !isPlaying ? onTransformStart : undefined,
        onTransformChange: !isPlaying ? onTransformChange : undefined,
        onTransformEnd: !isPlaying ? onTransformEnd : undefined,
      }
      sceneRef.current = await createScene(canvas, sceneWithCoords, opts)
      if (!isPlaying) {
        sceneRef.current?.setTransformMode(transformModeRef.current as 'translate' | 'rotate' | 'scale')
        if (snapEnabledRef.current) sceneRef.current?.setTransformSnap(1, 15, 0.25)
        sceneRef.current?.setTransformSpace(transformSpaceRef.current)
      }
    },
    [
      scripts,
      prefabs,
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

  // Sync snap to the active scene
  const prevSnapRef = useRef(snapEnabled)
  if (prevSnapRef.current !== snapEnabled) {
    prevSnapRef.current = snapEnabled
    if (snapEnabled) {
      sceneRef.current?.setTransformSnap(1, 15, 0.25)
    } else {
      sceneRef.current?.setTransformSnap(null, null, null)
    }
  }

  // Sync transform space to the active scene
  const prevSpaceRef = useRef(transformSpace)
  if (prevSpaceRef.current !== transformSpace) {
    prevSpaceRef.current = transformSpace
    sceneRef.current?.setTransformSpace(transformSpace)
  }

  return { sceneRef, recreateScene }
}
