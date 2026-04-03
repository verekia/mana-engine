import React from 'react'

import { describe, expect, test, mock } from 'bun:test'
import { renderToString } from 'react-dom/server'

import { Toolbar } from './editor/Toolbar.tsx'

import type { TransformMode } from './scene.ts'

function defaultProps(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  return {
    playing: false,
    onPlay: mock(() => {}),
    onStop: mock(() => {}),
    dirty: false,
    transformMode: 'translate' as TransformMode,
    onTransformModeChange: mock((_mode: TransformMode) => {}),
    canUndo: false,
    canRedo: false,
    onUndo: mock(() => {}),
    onRedo: mock(() => {}),
    showUI: true,
    onToggleUI: mock(() => {}),
    showGizmos: true,
    onToggleGizmos: mock(() => {}),
    ...overrides,
  }
}

function render(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  return renderToString(React.createElement(Toolbar, defaultProps(overrides)))
}

describe('Toolbar rendering', () => {
  test('renders play button in edit mode', () => {
    const html = render({ playing: false })
    expect(html).toContain('title="Play"')
    expect(html).not.toContain('title="Stop"')
  })

  test('renders stop button in play mode', () => {
    const html = render({ playing: true })
    expect(html).toContain('title="Stop"')
    expect(html).not.toContain('title="Play"')
  })

  test('renders transform mode buttons', () => {
    const html = render()
    expect(html).toContain('Translate (W)')
    expect(html).toContain('Rotate (E)')
    expect(html).toContain('Scale (R)')
  })

  test('transform buttons are disabled during play mode', () => {
    const html = render({ playing: true })
    // Disabled buttons have disabled attribute
    // Check that translate, rotate, scale buttons have disabled
    const translateMatch = html.match(/title="Translate \(W\)"[^>]*disabled/)
    const rotateMatch = html.match(/title="Rotate \(E\)"[^>]*disabled/)
    const scaleMatch = html.match(/title="Scale \(R\)"[^>]*disabled/)
    expect(translateMatch).not.toBeNull()
    expect(rotateMatch).not.toBeNull()
    expect(scaleMatch).not.toBeNull()
  })

  test('undo button is disabled when canUndo is false', () => {
    const html = render({ canUndo: false })
    const undoMatch = html.match(/title="Undo \(Ctrl\+Z\)"[^>]*disabled/)
    expect(undoMatch).not.toBeNull()
  })

  test('undo button is enabled when canUndo is true', () => {
    const html = render({ canUndo: true })
    // Extract the undo button tag and check it does NOT have disabled
    const undoMatch = html.match(/<button[^>]*title="Undo \(Ctrl\+Z\)"[^>]*>/)
    expect(undoMatch).not.toBeNull()
    expect(undoMatch?.[0]).not.toContain('disabled')
  })

  test('redo button disabled when canRedo is false', () => {
    const html = render({ canRedo: false })
    const redoMatch = html.match(/title="Redo \(Ctrl\+Shift\+Z\)"[^>]*disabled/)
    expect(redoMatch).not.toBeNull()
  })

  test('redo button enabled when canRedo is true', () => {
    const html = render({ canRedo: true })
    const redoMatch = html.match(/<button[^>]*title="Redo \(Ctrl\+Shift\+Z\)"[^>]*>/)
    expect(redoMatch).not.toBeNull()
    expect(redoMatch?.[0]).not.toContain('disabled')
  })

  test('undo/redo disabled during play mode even when available', () => {
    const html = render({ playing: true, canUndo: true, canRedo: true })
    const undoMatch = html.match(/title="Undo \(Ctrl\+Z\)"[^>]*disabled/)
    const redoMatch = html.match(/title="Redo \(Ctrl\+Shift\+Z\)"[^>]*disabled/)
    expect(undoMatch).not.toBeNull()
    expect(redoMatch).not.toBeNull()
  })

  test('shows "Saved" when not dirty', () => {
    const html = render({ dirty: false })
    expect(html).toContain('Saved')
  })

  test('shows "Unsaved" when dirty', () => {
    const html = render({ dirty: true })
    expect(html).toContain('Unsaved')
  })

  test('UI and Gizmos toggles are hidden during play mode', () => {
    const html = render({ playing: true })
    expect(html).not.toContain('>UI<')
    expect(html).not.toContain('>Gizmos<')
  })

  test('UI and Gizmos toggles are visible in edit mode', () => {
    const html = render({ playing: false })
    expect(html).toContain('UI')
    expect(html).toContain('Gizmos')
  })

  test('prefab editing mode shows Back button and prefab name', () => {
    const html = render({ editingPrefab: 'enemy' })
    expect(html).toContain('Back')
    expect(html).toContain('PREFAB:')
    expect(html).toContain('enemy')
  })

  test('prefab editing mode is not shown when editingPrefab is null', () => {
    const html = render({ editingPrefab: null })
    expect(html).not.toContain('PREFAB:')
    expect(html).not.toContain('Back')
  })

  test('dirty indicator dot uses correct color', () => {
    const savedHtml = render({ dirty: false })
    const unsavedHtml = render({ dirty: true })
    // Saved = green (#22c55e), Unsaved = amber (#f59e0b)
    expect(savedHtml).toContain('#22c55e')
    expect(unsavedHtml).toContain('#f59e0b')
  })

  test('prefab editing mode changes toolbar background', () => {
    const normalHtml = render({ editingPrefab: null })
    const prefabHtml = render({ editingPrefab: 'test' })
    // Prefab mode has green-tinted background (#0a1f0a)
    expect(prefabHtml).toContain('#0a1f0a')
    expect(normalHtml).not.toContain('#0a1f0a')
  })

  test('play mode changes toolbar background', () => {
    const editHtml = render({ playing: false })
    const playHtml = render({ playing: true })
    // Play mode has blue-tinted background (#0f1a2e)
    expect(playHtml).toContain('#0f1a2e')
    expect(editHtml).not.toContain('#0f1a2e')
  })
})
