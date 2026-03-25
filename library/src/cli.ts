import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import { loadConfig } from './config.ts'

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

async function runBuild() {
  const { build } = await import('vite')
  const { createBuildConfig } = await import('./create-vite-config.ts')
  const config = await loadConfig()
  const gameDir = resolve(process.cwd(), config.gameDir)
  const outDir = resolve(process.cwd(), config.outDir)
  const manaDir = resolve(process.cwd(), '.mana')
  mkdirSync(manaDir, { recursive: true })

  const entryFile = resolve(manaDir, 'build-entry.tsx')
  writeFileSync(
    entryFile,
    [
      `import { createRoot } from 'react-dom/client'`,
      `import { createElement } from 'react'`,
      `import { setAssetManifest } from 'mana-engine/game'`,
      `import Game from '${gameDir}/index.tsx'`,
      ``,
      `let root`,
      `export function mount(container, options) {`,
      `  if (options?.assetManifest) setAssetManifest(options.assetManifest)`,
      `  root = createRoot(container)`,
      `  root.render(createElement(Game))`,
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
  const { createServer } = await import('vite')
  const { createDevConfig } = await import('./create-vite-config.ts')
  const config = await loadConfig()
  const gameDir = resolve(process.cwd(), config.gameDir)
  const manaDir = resolve(process.cwd(), '.mana')
  mkdirSync(manaDir, { recursive: true })

  writeFileSync(
    resolve(manaDir, 'dev-entry.tsx'),
    [
      `import { createRoot } from 'react-dom/client'`,
      `import { createElement } from 'react'`,
      `import Game from '${gameDir}/index.tsx'`,
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
      `createRoot(container).render(createElement(Game))`,
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
  const { createServer } = await import('vite')
  const { createEditorConfig } = await import('./create-vite-config.ts')
  const config = await loadConfig()
  const gameDir = resolve(process.cwd(), config.gameDir)
  const manaDir = resolve(process.cwd(), '.mana')
  mkdirSync(manaDir, { recursive: true })

  // Resolve path to the editor source within the mana-engine package
  const manaRoot = resolve(dirname(new URL(import.meta.url).pathname), '..')
  const editorComponent = resolve(manaRoot, 'src/editor/Editor.tsx')

  writeFileSync(
    resolve(manaDir, 'editor-entry.tsx'),
    [
      `import { createRoot } from 'react-dom/client'`,
      `import { createElement } from 'react'`,
      `import Editor from '${editorComponent}'`,
      `import Game, { uiComponents, scripts } from '${gameDir}/index.tsx'`,
      `import '${gameDir}/game.css'`,
      ``,
      `createRoot(document.getElementById('editor')!).render(createElement(Editor, { Game, uiComponents, scripts }))`,
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
