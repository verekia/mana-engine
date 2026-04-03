import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadConfig, scaffoldProject } from './config.ts'

const tmpDir = resolve(import.meta.dir, '../../.test-tmp-config')

describe('loadConfig', () => {
  const origCwd = process.cwd

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
    process.cwd = () => tmpDir
  })

  afterEach(() => {
    process.cwd = origCwd
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  test('returns defaults when no config files exist', async () => {
    const config = await loadConfig()
    expect(config.gameDir).toBe('.')
    expect(config.outDir).toBe('.mana/build')
    expect(config.startScene).toBeUndefined()
    expect(config.renderer).toBeUndefined()
    expect(config.physics).toBeUndefined()
  })

  test('loads mana.json and merges with defaults', async () => {
    writeFileSync(
      resolve(tmpDir, 'mana.json'),
      JSON.stringify({ startScene: 'main', renderer: 'voidcore', physics: 'crashcat' }),
    )

    const config = await loadConfig()
    expect(config.gameDir).toBe('.') // default
    expect(config.outDir).toBe('.mana/build') // default
    expect(config.startScene).toBe('main')
    expect(config.renderer).toBe('voidcore')
    expect(config.physics).toBe('crashcat')
  })

  test('mana.json overrides gameDir and outDir', async () => {
    writeFileSync(resolve(tmpDir, 'mana.json'), JSON.stringify({ gameDir: 'game', outDir: 'dist' }))

    const config = await loadConfig()
    expect(config.gameDir).toBe('game')
    expect(config.outDir).toBe('dist')
  })

  test('mana.json takes priority over legacy config', async () => {
    writeFileSync(resolve(tmpDir, 'mana.json'), JSON.stringify({ startScene: 'from-json' }))
    writeFileSync(resolve(tmpDir, 'mana.config.js'), 'module.exports = { startScene: "from-legacy" }')

    const config = await loadConfig()
    expect(config.startScene).toBe('from-json')
  })
})

describe('scaffoldProject', () => {
  const origCwd = process.cwd

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
    process.cwd = () => tmpDir
  })

  afterEach(() => {
    process.cwd = origCwd
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  test('creates project structure when no config exists', () => {
    scaffoldProject()

    // mana.json should exist
    expect(existsSync(resolve(tmpDir, 'mana.json'))).toBe(true)
    const config = JSON.parse(readFileSync(resolve(tmpDir, 'mana.json'), 'utf-8'))
    expect(config.startScene).toBe('default')

    // Directories should exist
    for (const dir of ['scenes', 'scripts', 'ui', 'assets', 'prefabs']) {
      expect(existsSync(resolve(tmpDir, dir))).toBe(true)
    }

    // Asset subdirectories should exist
    for (const dir of ['assets/models', 'assets/textures', 'assets/audio']) {
      expect(existsSync(resolve(tmpDir, dir))).toBe(true)
    }

    // Default scene should exist
    expect(existsSync(resolve(tmpDir, 'scenes/default.yaml'))).toBe(true)

    // game.css should exist
    expect(existsSync(resolve(tmpDir, 'game.css'))).toBe(true)
    const css = readFileSync(resolve(tmpDir, 'game.css'), 'utf-8')
    expect(css).toContain("@import 'tailwindcss'")
  })

  test('does nothing when mana.json already exists', () => {
    writeFileSync(resolve(tmpDir, 'mana.json'), '{}')
    scaffoldProject()

    // Should not create scenes directory since project already exists
    // mana.json should still be the empty object
    const config = JSON.parse(readFileSync(resolve(tmpDir, 'mana.json'), 'utf-8'))
    expect(config).toEqual({})
  })

  test('does nothing when legacy config exists', () => {
    writeFileSync(resolve(tmpDir, 'mana.config.js'), 'export default {}')
    scaffoldProject()

    // Should not create mana.json
    expect(existsSync(resolve(tmpDir, 'mana.json'))).toBe(false)
  })

  test('default scene YAML contains expected entities', () => {
    scaffoldProject()

    const yaml = readFileSync(resolve(tmpDir, 'scenes/default.yaml'), 'utf-8')
    expect(yaml).toContain('camera')
    expect(yaml).toContain('Ambient Light')
    expect(yaml).toContain('Directional Light')
    expect(yaml).toContain('Cube')
    expect(yaml).toContain('Ground')
  })
})
