import { dump } from 'js-yaml'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface ManaConfig {
  gameDir: string
  outDir: string
  startScene?: string
  coordinateSystem?: 'y-up' | 'z-up'
  renderer?: 'three' | 'voidcore' | 'nanothree'
  physics?: 'rapier' | 'crashcat' | 'none'
}

const defaults: ManaConfig = {
  gameDir: '.',
  outDir: '.mana/build',
}

export async function loadConfig(): Promise<ManaConfig> {
  const cwd = process.cwd()

  // mana.json takes priority
  const manaJsonPath = resolve(cwd, 'mana.json')
  if (existsSync(manaJsonPath)) {
    const json = JSON.parse(readFileSync(manaJsonPath, 'utf-8'))
    return { ...defaults, ...json }
  }

  // Legacy: mana.config.js / mana.config.mjs
  for (const filename of ['mana.config.js', 'mana.config.mjs']) {
    const configPath = resolve(cwd, filename)
    if (existsSync(configPath)) {
      const mod = await import(configPath)
      return { ...defaults, ...mod.default }
    }
  }

  return defaults
}

/** Scaffold a new project if mana.json doesn't exist. */
export function scaffoldProject(): void {
  const cwd = process.cwd()
  const manaJsonPath = resolve(cwd, 'mana.json')

  if (existsSync(manaJsonPath)) return

  // Also skip if legacy config exists
  for (const filename of ['mana.config.js', 'mana.config.mjs']) {
    if (existsSync(resolve(cwd, filename))) return
  }

  // Create directories
  for (const dir of [
    'scenes',
    'scripts',
    'ui',
    'assets',
    'assets/models',
    'assets/textures',
    'assets/audio',
    'prefabs',
  ]) {
    mkdirSync(resolve(cwd, dir), { recursive: true })
  }

  // Create mana.json
  writeFileSync(manaJsonPath, JSON.stringify({ startScene: 'default' }, null, 2) + '\n')

  // Create default scene with a cube
  const defaultScene = {
    background: '#1a1a2e',
    entities: [
      {
        id: 'camera',
        name: 'Camera',
        type: 'camera',
        transform: { position: [0, 2, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        camera: { fov: 60, near: 0.1, far: 1000 },
      },
      {
        id: 'ambient-light',
        name: 'Ambient Light',
        type: 'ambient-light',
        light: { color: '#ffffff', intensity: 0.5 },
      },
      {
        id: 'directional-light',
        name: 'Directional Light',
        type: 'directional-light',
        transform: { position: [5, 5, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        light: { color: '#ffffff', intensity: 1, castShadow: true },
      },
      {
        id: 'cube',
        name: 'Cube',
        type: 'mesh',
        transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        mesh: { geometry: 'box', material: { color: '#4a9eff' } },
        castShadow: true,
        receiveShadow: true,
      },
      {
        id: 'ground',
        name: 'Ground',
        type: 'mesh',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [10, 0.1, 10] },
        mesh: { geometry: 'box', material: { color: '#333333' } },
        receiveShadow: true,
      },
    ],
  }
  writeFileSync(
    resolve(cwd, 'scenes/default.yaml'),
    dump(defaultScene, { lineWidth: -1, quotingType: '"', flowLevel: 3 }),
  )

  // Create game.css for Tailwind
  writeFileSync(resolve(cwd, 'game.css'), "@import 'tailwindcss';\n@source './';\n")

  console.log('Created new Mana project with default scene.')
}
