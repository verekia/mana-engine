import './setup-dom.ts'
import { describe, expect, test } from 'bun:test'

import { Input } from './input.ts'

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
  }
}

describe('Input - arrow key axes', () => {
  test('arrow keys work for horizontal axis', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }))
    expect(input.getAxis('horizontal')).toBe(1)

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }))
    expect(input.getAxis('horizontal')).toBe(-1)

    input.dispose()
  })

  test('arrow keys work for vertical axis', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }))
    expect(input.getAxis('vertical')).toBe(1)

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }))
    expect(input.getAxis('vertical')).toBe(-1)

    input.dispose()
  })

  test('WASD and arrows combine', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    // Both D and ArrowRight pressed = still 1 (not 2)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }))
    expect(input.getAxis('horizontal')).toBe(1)

    // A and ArrowRight cancel
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }))
    expect(input.getAxis('horizontal')).toBe(0)

    input.dispose()
  })
})

describe('Input - repeated keydown', () => {
  test('repeated keydown does not re-trigger isKeyPressed', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(input.isKeyPressed('Space')).toBe(true)

    input.endFrame()

    // Simulating auto-repeat: keydown fires again without keyup
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(input.isKeyPressed('Space')).toBe(false) // should not re-trigger
    expect(input.isKeyDown('Space')).toBe(true) // still held

    input.dispose()
  })
})

describe('Input - multiple mouse buttons', () => {
  test('tracks right and middle mouse buttons independently', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    el.dispatch('mousedown', { button: 0 }) // left
    el.dispatch('mousedown', { button: 2 }) // right
    expect(input.isMouseDown(0)).toBe(true)
    expect(input.isMouseDown(2)).toBe(true)
    expect(input.isMouseDown(1)).toBe(false)

    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    expect(input.isMouseDown(0)).toBe(false)
    expect(input.isMouseDown(2)).toBe(true) // right still held

    input.dispose()
  })
})

describe('Input - mouse deltas reset between frames', () => {
  test('deltas are zero when mouse has not moved', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    el.dispatch('mousemove', { clientX: 50, clientY: 50 })
    input.beginFrame()
    input.endFrame()

    // No movement between frames
    input.beginFrame()
    expect(input.mouseDeltaX).toBe(0)
    expect(input.mouseDeltaY).toBe(0)

    input.dispose()
  })
})

describe('Input - scroll delta', () => {
  test('negative scroll delta (scroll up)', () => {
    const el = createMockElement()
    const input = new Input(el as any)

    el.dispatch('wheel', { deltaY: -100 })
    expect(input.scrollDelta).toBe(-100)

    input.endFrame()
    expect(input.scrollDelta).toBe(0)

    input.dispose()
  })
})
