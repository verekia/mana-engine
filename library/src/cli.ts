import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, extname, resolve } from 'node:path'

import { loadConfig, scaffoldProject } from './config.ts'

const command = process.argv[2]

switch (command) {
  case 'build':
    await runBuild()
    break
  case 'dev':
    await runDev()
    break
  case 'editor':
    await runEditor()
    break
  default:
    console.log('Usage: mana <command>')
    console.log('')
    console.log('Commands:')
    console.log('  build    Build the game for production')
    console.log('  dev      Start development server')
    console.log('  editor   Open the Mana Engine editor')
    process.exit(command ? 1 : 0)
}

function resolvePackagePath(name: string): string {
  const req = createRequire(import.meta.url)
  // Try package.json first, fall back to resolving the main entry and walking up
  try {
    return dirname(req.resolve(`${name}/package.json`))
  } catch {
    const resolved = req.resolve(name)
    let dir = dirname(resolved)
    while (dir !== dirname(dir)) {
      if (existsSync(resolve(dir, 'package.json'))) return dir
      dir = dirname(dir)
    }
    return dirname(resolved)
  }
}

function getManaAliases(): { aliases: Record<string, string>; threePath: string } {
  const threePath = resolvePackagePath('three')
  return {
    aliases: {
      react: resolvePackagePath('react'),
      'react-dom': resolvePackagePath('react-dom'),
      'three/webgpu': resolve(threePath, 'build/three.webgpu.js'),
      'three/tsl': resolve(threePath, 'build/three.tsl.js'),
      three: threePath,
    },
    threePath,
  }
}

/** Discover files in a directory by extension, returning { name, absPath } pairs. */
function discoverFiles(dir: string, extensions: string[]): { name: string; absPath: string }[] {
  if (!existsSync(dir)) return []
  const results: { name: string; absPath: string }[] = []
  for (const file of readdirSync(dir)) {
    const ext = extname(file)
    if (extensions.includes(ext)) {
      results.push({ name: basename(file, ext), absPath: resolve(dir, file) })
    }
  }
  return results.toSorted((a, b) => a.name.localeCompare(b.name))
}

interface DiscoveredGame {
  scenes: { name: string; absPath: string }[]
  scripts: { name: string; absPath: string }[]
  uiComponents: { name: string; absPath: string }[]
  cssPath: string | null
}

function discoverGame(gameDir: string): DiscoveredGame {
  return {
    scenes: discoverFiles(resolve(gameDir, 'scenes'), ['.yaml']),
    scripts: discoverFiles(resolve(gameDir, 'scripts'), ['.ts', '.js']),
    uiComponents: discoverFiles(resolve(gameDir, 'ui'), ['.tsx', '.jsx', '.ts', '.js']),
    cssPath: existsSync(resolve(gameDir, 'game.css')) ? resolve(gameDir, 'game.css') : null,
  }
}

/** Generate import lines and maps for discovered scenes/scripts/ui. */
function generateGameImports(game: DiscoveredGame, startScene?: string): string {
  const lines: string[] = []

  // CSS
  if (game.cssPath) {
    lines.push(`import '${game.cssPath}'`)
  }

  // Scenes
  for (let i = 0; i < game.scenes.length; i++) {
    lines.push(`import scene_${i} from '${game.scenes[i].absPath}'`)
  }

  // Scripts
  for (let i = 0; i < game.scripts.length; i++) {
    lines.push(`import script_${i} from '${game.scripts[i].absPath}'`)
  }

  // UI components
  for (let i = 0; i < game.uiComponents.length; i++) {
    lines.push(`import ui_${i} from '${game.uiComponents[i].absPath}'`)
  }

  lines.push('')

  // Scene map
  const sceneEntries = game.scenes.map((s, i) => `  '${s.name}': scene_${i}`).join(',\n')
  lines.push(`const scenes = {\n${sceneEntries}\n}`)

  // Script map
  const scriptEntries = game.scripts.map((s, i) => `  '${s.name}': script_${i}`).join(',\n')
  lines.push(`const scripts = {\n${scriptEntries}\n}`)

  // UI component map
  const uiEntries = game.uiComponents.map((s, i) => `  '${s.name}': ui_${i}`).join(',\n')
  lines.push(`const uiComponents = {\n${uiEntries}\n}`)

  if (startScene) {
    lines.push(`const startScene = '${startScene}'`)
  }

  return lines.join('\n')
}

async function runBuild() {
  scaffoldProject()
  const { build } = await import('vite')
  const { createBuildConfig } = await import('./create-vite-config.ts')
  const config = await loadConfig()
  const gameDir = resolve(process.cwd(), config.gameDir)
  const outDir = resolve(process.cwd(), config.outDir)
  const manaDir = resolve(process.cwd(), '.mana')
  mkdirSync(manaDir, { recursive: true })

  const game = discoverGame(gameDir)

  const entryFile = resolve(manaDir, 'build-entry.tsx')
  writeFileSync(
    entryFile,
    [
      `import { createRoot } from 'react-dom/client'`,
      `import { createElement } from 'react'`,
      `import { setAssetManifest, Game } from 'mana-engine/game'`,
      `export { css } from 'virtual:mana-css'`,
      `export { assetManifest } from 'virtual:mana-asset-manifest'`,
      ``,
      generateGameImports(game, config.startScene),
      ``,
      `let root`,
      `export function mount(container, options) {`,
      `  if (options?.assetManifest) setAssetManifest(options.assetManifest)`,
      `  root = createRoot(container)`,
      `  root.render(createElement(Game, { scenes, scripts, uiComponents${config.startScene ? ', startScene' : ''} }))`,
      `}`,
      `export function unmount() {`,
      `  if (root) {`,
      `    root.unmount()`,
      `    root = null`,
      `  }`,
      `}`,
    ].join('\n'),
  )

  const { aliases, threePath } = getManaAliases()
  console.log(`Building game from ${config.gameDir}...`)
  await build(createBuildConfig(gameDir, outDir, entryFile, aliases, resolvePackagePath('tailwindcss'), threePath))
  console.log(`Game built to ${config.outDir}`)
}

async function runDev() {
  scaffoldProject()
  const { createServer } = await import('vite')
  const { createDevConfig } = await import('./create-vite-config.ts')
  const config = await loadConfig()
  const gameDir = resolve(process.cwd(), config.gameDir)
  const manaDir = resolve(process.cwd(), '.mana')
  mkdirSync(manaDir, { recursive: true })

  const game = discoverGame(gameDir)

  writeFileSync(
    resolve(manaDir, 'dev-entry.tsx'),
    [
      `import { createRoot } from 'react-dom/client'`,
      `import { createElement } from 'react'`,
      `import { Game } from 'mana-engine/game'`,
      ``,
      generateGameImports(game, config.startScene),
      ``,
      `const host = document.getElementById('game')!`,
      `const shadow = host.attachShadow({ mode: 'open' })`,
      ``,
      `const container = document.createElement('div')`,
      `container.style.containerType = 'inline-size'`,
      `container.style.width = '100%'`,
      `container.style.height = '100%'`,
      `shadow.appendChild(container)`,
      ``,
      `// Mirror Vite-injected styles from <head> into the shadow root`,
      `function mirrorStyles() {`,
      `  shadow.querySelectorAll('[data-vite-mirror]').forEach(el => el.remove())`,
      `  for (const el of document.head.querySelectorAll('style[data-vite-dev-id]')) {`,
      `    const clone = el.cloneNode(true) as HTMLStyleElement`,
      `    clone.setAttribute('data-vite-mirror', '')`,
      `    shadow.insertBefore(clone, container)`,
      `  }`,
      `}`,
      `new MutationObserver(mirrorStyles).observe(document.head, { childList: true, subtree: true, characterData: true })`,
      `mirrorStyles()`,
      ``,
      `createRoot(container).render(createElement(Game, { scenes, scripts, uiComponents${config.startScene ? ', startScene' : ''} }))`,
    ].join('\n'),
  )

  writeFileSync(
    resolve(manaDir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mana Dev</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="game" style="width: 100%; height: 100vh"></div>
    <script type="module" src="./dev-entry.tsx"></script>
  </body>
</html>
`,
  )

  const { aliases, threePath } = getManaAliases()
  const server = await createServer(
    createDevConfig(gameDir, manaDir, aliases, resolvePackagePath('tailwindcss'), threePath),
  )
  await server.listen()
  server.printUrls()
}

async function runEditor() {
  scaffoldProject()
  const { createServer } = await import('vite')
  const { createEditorConfig } = await import('./create-vite-config.ts')
  const config = await loadConfig()
  const gameDir = resolve(process.cwd(), config.gameDir)
  const manaDir = resolve(process.cwd(), '.mana')
  mkdirSync(manaDir, { recursive: true })

  // Resolve path to the editor source within the mana-engine package
  const manaRoot = resolve(dirname(new URL(import.meta.url).pathname), '..')
  const editorComponent = resolve(manaRoot, 'src/editor/Editor.tsx')

  const game = discoverGame(gameDir)

  writeFileSync(
    resolve(manaDir, 'editor-entry.tsx'),
    [
      `import { createRoot } from 'react-dom/client'`,
      `import { createElement } from 'react'`,
      `import Editor from '${editorComponent}'`,
      ``,
      generateGameImports({ ...game, scenes: [] }),
      ``,
      `createRoot(document.getElementById('editor')!).render(createElement(Editor, { uiComponents, scripts }))`,
    ].join('\n'),
  )

  writeFileSync(
    resolve(manaDir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mana Editor</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="editor"></div>
    <script type="module" src="./editor-entry.tsx"></script>
  </body>
</html>
`,
  )

  const { aliases, threePath } = getManaAliases()
  const server = await createServer(
    createEditorConfig(manaRoot, gameDir, manaDir, aliases, resolvePackagePath('tailwindcss'), threePath),
  )
  await server.listen()
  server.printUrls()
}
