import { describe, expect, test } from 'bun:test'

import { UndoHistory } from './editor/history.ts'

describe('UndoHistory', () => {
  test('starts empty with no undo/redo', () => {
    const h = new UndoHistory()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })

  test('undo returns false when empty', () => {
    const h = new UndoHistory()
    expect(h.undo()).toBe(false)
  })

  test('redo returns false when empty', () => {
    const h = new UndoHistory()
    expect(h.redo()).toBe(false)
  })

  test('push enables undo', () => {
    const h = new UndoHistory()
    h.push({ description: 'test', undo: () => {}, redo: () => {} })
    expect(h.canUndo).toBe(true)
    expect(h.canRedo).toBe(false)
  })

  test('undo calls the undo function and enables redo', () => {
    const h = new UndoHistory()
    let value = 1
    h.push({
      description: 'set to 1',
      undo: () => {
        value = 0
      },
      redo: () => {
        value = 1
      },
    })
    expect(h.undo()).toBe(true)
    expect(value).toBe(0)
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(true)
  })

  test('redo calls the redo function', () => {
    const h = new UndoHistory()
    let value = 0
    h.push({
      description: 'set to 1',
      undo: () => {
        value = 0
      },
      redo: () => {
        value = 1
      },
    })
    h.undo()
    expect(value).toBe(0)
    expect(h.redo()).toBe(true)
    expect(value).toBe(1)
    expect(h.canRedo).toBe(false)
  })

  test('multiple undo/redo operations', () => {
    const h = new UndoHistory()
    const values: number[] = []
    h.push({
      description: 'push 1',
      undo: () => values.pop(),
      redo: () => values.push(1),
    })
    values.push(1)
    h.push({
      description: 'push 2',
      undo: () => values.pop(),
      redo: () => values.push(2),
    })
    values.push(2)
    h.push({
      description: 'push 3',
      undo: () => values.pop(),
      redo: () => values.push(3),
    })
    values.push(3)

    expect(values).toEqual([1, 2, 3])

    h.undo() // removes 3
    expect(values).toEqual([1, 2])

    h.undo() // removes 2
    expect(values).toEqual([1])

    h.redo() // adds 2
    expect(values).toEqual([1, 2])
  })

  test('push after undo discards redo history', () => {
    const h = new UndoHistory()
    h.push({ description: 'a', undo: () => {}, redo: () => {} })
    h.push({ description: 'b', undo: () => {}, redo: () => {} })
    h.undo()
    expect(h.canRedo).toBe(true)

    h.push({ description: 'c', undo: () => {}, redo: () => {} })
    expect(h.canRedo).toBe(false)
  })

  test('clear resets everything', () => {
    const h = new UndoHistory()
    h.push({ description: 'a', undo: () => {}, redo: () => {} })
    h.push({ description: 'b', undo: () => {}, redo: () => {} })
    h.clear()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBe(false)
    expect(h.redo()).toBe(false)
  })
})
