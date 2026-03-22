import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface ManaConfig {
  gameDir: string
  outDir: string
}

const defaults: ManaConfig = {
  gameDir: './game',
  outDir: '.mana/build',
}

export async function loadConfig(): Promise<ManaConfig> {
  const cwd = process.cwd()

  for (const filename of ['mana.config.js', 'mana.config.mjs']) {
    const configPath = resolve(cwd, filename)
    if (existsSync(configPath)) {
      const mod = await import(configPath)
      return { ...defaults, ...mod.default }
    }
  }

  return defaults
}
