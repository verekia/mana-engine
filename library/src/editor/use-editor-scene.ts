import { useCallback, useEffect, useRef } from 'react'

import { createScene, type CreateSceneOptions, type EditorCameraState, type ManaScene } from '../scene.ts'

import type { SceneData } from '../scene-data.ts'
import type { ManaScript } from '../script.ts'

/** Encapsulates the Three.js scene lifecycle for the editor, including creation, disposal, and recreation. */
export function useEditorScene({
  canvasRef,
  sceneData,
  scripts,
  showGizmos,
  transformMode,
  onTransformStart,
  onTransformChange,
  onTransformEnd,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  sceneData: SceneData | null
  scripts: Record<string, ManaScript>
  showGizmos: boolean
  transformMode: string
  onTransformStart: (id: string) => void
  onTransformChange: (id: string, transform: import('../scene-data.ts').Transform) => void
  onTransformEnd: (id: string, transform: import('../scene-data.ts').Transform) => void
}) {
  const sceneRef = useRef<ManaScene | null>(null)
  // Use refs for values accessed inside callbacks/async functions to avoid stale closures
  const showGizmosRef = useRef(showGizmos)
  showGizmosRef.current = showGizmos
  const transformModeRef = useRef(transformMode)
  transformModeRef.current = transformMode

  // Track whether the initial scene has been created (prevents re-creation on re-renders)
  const initializedRef = useRef(false)

  // Create initial Three.js scene when sceneData first becomes available
  useEffect(() => {
    if (!sceneData || initializedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    initializedRef.current = true
    let disposed = false

    createScene(canvas, sceneData, {
      debugPhysics: showGizmosRef.current,
      orbitControls: true,
      onTransformStart,
      onTransformChange,
      onTransformEnd,
    }).then(s => {
      if (disposed) {
        s.dispose()
        return
      }
      sceneRef.current = s
      s.setTransformMode(transformModeRef.current as 'translate' | 'rotate' | 'scale')
    })

    return () => {
      disposed = true
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
      initializedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only create on first sceneData availability
  }, [sceneData, onTransformStart, onTransformChange, onTransformEnd])

  // Recreate the scene (for play/stop, scene switch, etc.)
  const recreateScene = useCallback(
    async (data: SceneData, isPlaying: boolean, editorCamera?: EditorCameraState) => {
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
      const canvas = canvasRef.current
      if (!canvas) return
      const opts: CreateSceneOptions = {
        scripts: isPlaying ? scripts : undefined,
        debugPhysics: !isPlaying && showGizmosRef.current,
        orbitControls: !isPlaying,
        editorCamera: !isPlaying ? editorCamera : undefined,
        onTransformStart: !isPlaying ? onTransformStart : undefined,
        onTransformChange: !isPlaying ? onTransformChange : undefined,
        onTransformEnd: !isPlaying ? onTransformEnd : undefined,
      }
      sceneRef.current = await createScene(canvas, data, opts)
      if (!isPlaying) {
        sceneRef.current?.setTransformMode(transformModeRef.current as 'translate' | 'rotate' | 'scale')
      }
    },
    [scripts, canvasRef, onTransformStart, onTransformChange, onTransformEnd],
  )

  // Sync transform mode to Three.js scene
  useEffect(() => {
    sceneRef.current?.setTransformMode(transformMode as 'translate' | 'rotate' | 'scale')
  }, [transformMode])

  return { sceneRef, recreateScene }
}
