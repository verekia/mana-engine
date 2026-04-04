import { useEffect } from 'react'

import { savePrefabData, saveSceneData } from './scene-api.ts'

import type { PrefabData, SceneData } from '../scene-data.ts'
import type { ManaScene, TransformMode } from '../scene.ts'
import type { UndoHistory } from './history.ts'

export interface EditorShortcutsConfig {
  sceneDataRef: React.RefObject<SceneData | null>
  activeSceneRef: React.RefObject<string>
  selectedIdsRef: React.RefObject<string[]>
  editingPrefabRef: React.RefObject<string | null>
  prefabEntityIdRef: React.RefObject<string | null>
  sceneRef: React.RefObject<ManaScene | null>
  historyRef: React.RefObject<UndoHistory>
  log: (msg: string) => void
  setSavedSceneJson: (json: string) => void
  setTransformMode: (mode: TransformMode | ((prev: TransformMode) => TransformMode)) => void
  setSnapEnabled: (fn: (prev: boolean) => boolean) => void
  forceUpdate: () => void
  handleCopyEntity: (id: string) => void
  handlePasteEntity: (parentId: string | null) => void
  handleDuplicateEntity: (id: string) => void
  handleDeleteEntity: (id: string) => void
}

/**
 * Hook that registers all editor keyboard shortcuts.
 * Extracted from Editor.tsx to reduce component size.
 */
export function useEditorShortcuts(config: EditorShortcutsConfig) {
  const {
    sceneDataRef,
    activeSceneRef,
    selectedIdsRef,
    editingPrefabRef,
    prefabEntityIdRef,
    sceneRef,
    historyRef,
    log,
    setSavedSceneJson,
    setTransformMode,
    setSnapEnabled,
    forceUpdate,
    handleCopyEntity,
    handlePasteEntity,
    handleDuplicateEntity,
    handleDeleteEntity,
  } = config

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 's') {
        e.preventDefault()
        const data = sceneDataRef.current
        if (!data) return

        const prefabName = editingPrefabRef.current
        if (prefabName) {
          const prefabEntity = data.entities.find(ent => ent.id === prefabEntityIdRef.current)
          if (prefabEntity) {
            const prefabData: PrefabData = { entity: prefabEntity }
            savePrefabData(prefabName, prefabData)
              .then(() => {
                setSavedSceneJson(JSON.stringify(data))
                log(`Prefab saved: ${prefabName}`)
              })
              .catch(err => log(`Error saving prefab: ${err.message}`))
          }
          return
        }

        const name = activeSceneRef.current
        if (!name) return
        saveSceneData(name, data)
          .then(() => {
            setSavedSceneJson(JSON.stringify(data))
            log(`Scene saved: ${name}`)
          })
          .catch(err => log(`Error saving: ${err.message}`))
        return
      }

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (historyRef.current.undo()) forceUpdate()
        return
      }

      if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        if (historyRef.current.redo()) forceUpdate()
        return
      }

      if (mod && e.key === 'c') {
        e.preventDefault()
        const ids = selectedIdsRef.current
        const id = ids.length > 0 ? ids[ids.length - 1] : null
        if (id) handleCopyEntity(id)
        return
      }

      if (mod && e.key === 'v') {
        e.preventDefault()
        const ids = selectedIdsRef.current
        handlePasteEntity(ids.length > 0 ? ids[ids.length - 1] : null)
        return
      }

      if (mod && e.key === 'd') {
        e.preventDefault()
        const ids = selectedIdsRef.current
        const id = ids.length > 0 ? ids[ids.length - 1] : null
        if (id) handleDuplicateEntity(id)
        return
      }

      // Transform mode shortcuts (only when not typing in an input)
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.length > 0) {
        const ids = [...selectedIdsRef.current]
        for (const id of ids) handleDeleteEntity(id)
        return
      }

      if (e.key === 'f' && !mod) {
        const ids = selectedIdsRef.current
        const id = ids.length > 0 ? ids[ids.length - 1] : null
        if (id) sceneRef.current?.frameEntity?.(id)
        return
      }

      if (e.key === 'w' && !mod) setTransformMode('translate')
      if (e.key === 'e' && !mod) setTransformMode('rotate')
      if (e.key === 'r' && !mod) setTransformMode('scale')
      if (e.key === 'x' && !mod) {
        setSnapEnabled(s => {
          const next = !s
          localStorage.setItem('mana:snapEnabled', String(next))
          return next
        })
      }

      // Orthographic view shortcuts (Blender-style numpad)
      if (e.key === '1') {
        sceneRef.current?.setOrthographicView?.(mod ? 'back' : 'front')
        return
      }
      if (e.key === '3') {
        sceneRef.current?.setOrthographicView?.(mod ? 'left' : 'right')
        return
      }
      if (e.key === '7') {
        sceneRef.current?.setOrthographicView?.(mod ? 'bottom' : 'top')
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    log,
    handleCopyEntity,
    handlePasteEntity,
    handleDuplicateEntity,
    handleDeleteEntity,
    sceneRef,
    sceneDataRef,
    activeSceneRef,
    selectedIdsRef,
    editingPrefabRef,
    prefabEntityIdRef,
    historyRef,
    setSavedSceneJson,
    setTransformMode,
    setSnapEnabled,
    forceUpdate,
  ])
}
