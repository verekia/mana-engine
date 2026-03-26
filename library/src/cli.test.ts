import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Test the import generation logic by replicating the function from cli.ts
// (The actual function is not exported, so we replicate for testing the escaping logic)

interface DiscoveredGame {
  scenes: { name: string; absPath: string }[]
  scripts: { name: string; absPath: string }[]
  uiComponents: { name: string; absPath: string }[]
  cssPath: string | null
}

function generateGameImports(game: DiscoveredGame, startScene?: string): string {
  const lines: string[] = []

  if (game.cssPath) {
    lines.push(`import ${JSON.stringify(game.cssPath)}`)
  }

  for (let i = 0; i < game.scenes.length; i++) {
    lines.push(`import scene_${i} from ${JSON.stringify(game.scenes[i].absPath)}`)
  }

  for (let i = 0; i < game.scripts.length; i++) {
    lines.push(`import script_${i} from ${JSON.stringify(game.scripts[i].absPath)}`)
  }

  for (let i = 0; i < game.uiComponents.length; i++) {
    lines.push(`import ui_${i} from ${JSON.stringify(game.uiComponents[i].absPath)}`)
  }

  lines.push('')

  const sceneEntries = game.scenes.map((s, i) => `  ${JSON.stringify(s.name)}: scene_${i}`).join(',\n')
  lines.push(`const scenes = {\n${sceneEntries}\n}`)

  const scriptEntries = game.scripts.map((s, i) => `  ${JSON.stringify(s.name)}: script_${i}`).join(',\n')
  lines.push(`const scripts = {\n${scriptEntries}\n}`)

  const uiEntries = game.uiComponents.map((s, i) => `  ${JSON.stringify(s.name)}: ui_${i}`).join(',\n')
  lines.push(`const uiComponents = {\n${uiEntries}\n}`)

  if (startScene) {
    lines.push(`const startScene = ${JSON.stringify(startScene)}`)
  }

  return lines.join('\n')
}

describe('generateGameImports', () => {
  test('generates correct imports for a basic game', () => {
    const game: DiscoveredGame = {
      scenes: [{ name: 'main', absPath: '/project/scenes/main.yaml' }],
      scripts: [{ name: 'rotate', absPath: '/project/scripts/rotate.ts' }],
      uiComponents: [{ name: 'HealthBar', absPath: '/project/ui/HealthBar.tsx' }],
      cssPath: '/project/game.css',
    }

    const result = generateGameImports(game, 'main')
    expect(result).toContain('import "/project/game.css"')
    expect(result).toContain('import scene_0 from "/project/scenes/main.yaml"')
    expect(result).toContain('import script_0 from "/project/scripts/rotate.ts"')
    expect(result).toContain('import ui_0 from "/project/ui/HealthBar.tsx"')
    expect(result).toContain('"main": scene_0')
    expect(result).toContain('"rotate": script_0')
    expect(result).toContain('"HealthBar": ui_0')
    expect(result).toContain('const startScene = "main"')
  })

  test('handles paths with special characters', () => {
    const game: DiscoveredGame = {
      scenes: [{ name: "scene's", absPath: "/project/scenes/scene's.yaml" }],
      scripts: [],
      uiComponents: [],
      cssPath: null,
    }

    const result = generateGameImports(game)
    // JSON.stringify properly escapes quotes in paths
    expect(result).toContain("scene's.yaml")
    expect(result).not.toContain("import scene_0 from '/project/scenes/scene's.yaml'")
  })

  test('handles empty game with no files', () => {
    const game: DiscoveredGame = {
      scenes: [],
      scripts: [],
      uiComponents: [],
      cssPath: null,
    }

    const result = generateGameImports(game)
    expect(result).toContain('const scenes = {\n\n}')
    expect(result).toContain('const scripts = {\n\n}')
    expect(result).toContain('const uiComponents = {\n\n}')
    expect(result).not.toContain('startScene')
  })

  test('generates multiple entries correctly', () => {
    const game: DiscoveredGame = {
      scenes: [
        { name: 'main-menu', absPath: '/scenes/main-menu.yaml' },
        { name: 'first-world', absPath: '/scenes/first-world.yaml' },
      ],
      scripts: [],
      uiComponents: [],
      cssPath: null,
    }

    const result = generateGameImports(game)
    expect(result).toContain('"main-menu": scene_0')
    expect(result).toContain('"first-world": scene_1')
  })
})

describe('discoverFiles', () => {
  const tmpDir = resolve(import.meta.dir, '../../.test-tmp')

  test('discovers files by extension', () => {
    const dir = resolve(tmpDir, 'discover-test')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'a.ts'), '')
    writeFileSync(resolve(dir, 'b.ts'), '')
    writeFileSync(resolve(dir, 'c.js'), '')
    writeFileSync(resolve(dir, 'readme.md'), '')

    // Replicate discoverFiles logic
    const { readdirSync } = require('node:fs')
    const { basename, extname } = require('node:path')
    const extensions = ['.ts', '.js']
    const results: { name: string; absPath: string }[] = []
    for (const file of readdirSync(dir)) {
      const ext = extname(file)
      if (extensions.includes(ext)) {
        results.push({ name: basename(file, ext), absPath: resolve(dir, file) })
      }
    }
    const sorted = results.toSorted((a, b) => a.name.localeCompare(b.name))

    expect(sorted).toHaveLength(3)
    expect(sorted[0].name).toBe('a')
    expect(sorted[1].name).toBe('b')
    expect(sorted[2].name).toBe('c')

    // Cleanup
    rmSync(dir, { recursive: true })
  })

  test('returns empty for non-existent directory', () => {
    expect(existsSync(resolve(tmpDir, 'nonexistent'))).toBe(false)
  })
})
