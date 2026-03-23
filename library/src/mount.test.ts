import './setup-dom.ts'
import { describe, expect, test } from 'bun:test'

import { mountGame, type GameBundle } from './mount.ts'

describe('mountGame', () => {
  test('creates shadow DOM and calls mount/unmount', () => {
    const element = document.createElement('div')
    let mountedContainer: HTMLElement | null = null
    let unmounted = false

    const bundle: GameBundle = {
      css: '.test { color: red; }',
      mount(container) {
        mountedContainer = container
      },
      unmount() {
        unmounted = true
      },
    }

    const cleanup = mountGame(element, bundle)

    // Shadow root should be created
    expect(element.shadowRoot).not.toBeNull()

    // mount should have been called with a container div
    expect(mountedContainer).not.toBeNull()
    expect(mountedContainer?.tagName).toBe('DIV')
    expect(mountedContainer?.style.width).toBe('100%')
    expect(mountedContainer?.style.height).toBe('100%')

    // Cleanup should call unmount
    expect(unmounted).toBe(false)
    cleanup()
    expect(unmounted).toBe(true)
  })

  test('returns a cleanup function', () => {
    const element = document.createElement('div')
    const bundle: GameBundle = {
      css: '',
      mount() {},
      unmount() {},
    }

    const cleanup = mountGame(element, bundle)
    expect(typeof cleanup).toBe('function')
  })
})
