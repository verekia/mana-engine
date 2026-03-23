import { describe, expect, test } from 'bun:test'

// Replicates the regex from sceneApiPlugin
const isValidSceneName = (name: string) => /^[a-zA-Z0-9_-]+$/.test(name)

describe('Scene name validation', () => {
  test('accepts valid scene names', () => {
    expect(isValidSceneName('main-menu')).toBe(true)
    expect(isValidSceneName('first_world')).toBe(true)
    expect(isValidSceneName('Level01')).toBe(true)
    expect(isValidSceneName('a')).toBe(true)
    expect(isValidSceneName('scene-with-dashes')).toBe(true)
    expect(isValidSceneName('scene_with_underscores')).toBe(true)
  })

  test('rejects path traversal attempts', () => {
    expect(isValidSceneName('..')).toBe(false)
    expect(isValidSceneName('../etc/passwd')).toBe(false)
    expect(isValidSceneName('..%2F..%2Fetc')).toBe(false)
  })

  test('rejects names with special characters', () => {
    expect(isValidSceneName('scene.json')).toBe(false)
    expect(isValidSceneName('scene/nested')).toBe(false)
    expect(isValidSceneName('scene name')).toBe(false)
    expect(isValidSceneName('')).toBe(false)
  })
})
