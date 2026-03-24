import './setup-dom.ts'
import { describe, expect, test } from 'bun:test'

import { Input } from './input.ts'

// Minimal mock element that supports addEventListener/removeEventListener
function createMockElement() {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {}
  return {
    addEventListener(type: string, handler: (...args: any[]) => void) {
      ;(listeners[type] ??= []).push(handler)
    },
    removeEventListener(type: string, handler: (...args: any[]) => void) {
      const arr = listeners[type]
      if (arr) {
        const idx = arr.indexOf(handler)
        if (idx >= 0) arr.splice(idx, 1)
      }
    },
    dispatch(type: string, event: Record<string, any>) {
      for (const handler of listeners[type] ?? []) handler(event)
    },
    getListeners(type: string) {
      return listeners[type] ?? []
    },
  }
}

describe('Input', () => {
  test('keyboard: isKeyDown/isKeyPressed/isKeyReleased', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    // Press W
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    expect(input.isKeyDown('KeyW')).toBe(true)
    expect(input.isKeyPressed('KeyW')).toBe(true)

    // After endFrame, pressed is cleared but down persists
    input.endFrame()
    expect(input.isKeyDown('KeyW')).toBe(true)
    expect(input.isKeyPressed('KeyW')).toBe(false)

    // Release W
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
    expect(input.isKeyDown('KeyW')).toBe(false)
    expect(input.isKeyReleased('KeyW')).toBe(true)

    input.endFrame()
    expect(input.isKeyReleased('KeyW')).toBe(false)

    input.dispose()
  })

  test('mouse buttons: isMouseDown/isMousePressed/isMouseReleased', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    // Press left button
    el.dispatch('mousedown', { button: 0 })
    expect(input.isMouseDown(0)).toBe(true)
    expect(input.isMousePressed(0)).toBe(true)

    input.endFrame()
    expect(input.isMousePressed(0)).toBe(false)
    expect(input.isMouseDown(0)).toBe(true)

    // Release (mouseup is on window)
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    expect(input.isMouseDown(0)).toBe(false)
    expect(input.isMouseReleased(0)).toBe(true)

    input.endFrame()
    expect(input.isMouseReleased(0)).toBe(false)

    input.dispose()
  })

  test('mouse position and deltas', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    el.dispatch('mousemove', { clientX: 100, clientY: 200 })
    input.beginFrame()
    expect(input.mouseX).toBe(100)
    expect(input.mouseY).toBe(200)
    // First frame delta is from 0,0
    expect(input.mouseDeltaX).toBe(100)
    expect(input.mouseDeltaY).toBe(200)

    input.endFrame()

    el.dispatch('mousemove', { clientX: 110, clientY: 205 })
    input.beginFrame()
    expect(input.mouseDeltaX).toBe(10)
    expect(input.mouseDeltaY).toBe(5)

    input.dispose()
  })

  test('scroll delta accumulates and resets', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    el.dispatch('wheel', { deltaY: 50 })
    el.dispatch('wheel', { deltaY: 30 })
    expect(input.scrollDelta).toBe(80)

    input.endFrame()
    expect(input.scrollDelta).toBe(0)

    input.dispose()
  })

  test('getAxis returns correct values', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    expect(input.getAxis('horizontal')).toBe(0)
    expect(input.getAxis('vertical')).toBe(0)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }))
    expect(input.getAxis('horizontal')).toBe(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }))
    expect(input.getAxis('horizontal')).toBe(0) // both pressed = cancel out

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }))
    expect(input.getAxis('horizontal')).toBe(-1)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    expect(input.getAxis('vertical')).toBe(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }))
    expect(input.getAxis('vertical')).toBe(0)

    input.dispose()
  })

  test('blur clears all held keys and buttons', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    el.dispatch('mousedown', { button: 0 })
    expect(input.isKeyDown('KeyW')).toBe(true)
    expect(input.isMouseDown(0)).toBe(true)

    window.dispatchEvent(new Event('blur'))
    expect(input.isKeyDown('KeyW')).toBe(false)
    expect(input.isMouseDown(0)).toBe(false)

    input.dispose()
  })

  test('dispose removes all event listeners', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    // Should have listeners registered
    expect(el.getListeners('mousemove').length).toBe(1)
    expect(el.getListeners('mousedown').length).toBe(1)
    expect(el.getListeners('wheel').length).toBe(1)

    input.dispose()

    expect(el.getListeners('mousemove').length).toBe(0)
    expect(el.getListeners('mousedown').length).toBe(0)
    expect(el.getListeners('wheel').length).toBe(0)
  })
})
