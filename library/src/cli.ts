import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
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
    console.log('Mana Engine editor coming soon.')
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
  return dirname(req.resolve(`${name}/package.json`))
}

function ensureSymlinks(packageNames: string[]) {
  const nodeModulesDir = resolve(process.cwd(), 'node_modules')
  for (const name of packageNames) {
    const link = resolve(nodeModulesDir, name)
    if (!existsSync(link)) {
      mkdirSync(dirname(link), { recursive: true })
      symlinkSync(resolvePackagePath(name), link, 'dir')
    }
  }
}

function getViteAliases(): Record<string, string> {
  return {
    react: resolvePackagePath('react'),
    'react-dom': resolvePackagePath('react-dom'),
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
  ensureSymlinks(['react', 'react-dom', 'tailwindcss'])

  const entryFile = resolve(manaDir, 'build-entry.tsx')
  writeFileSync(
    entryFile,
    [
      `import { createRoot } from 'react-dom/client'`,
      `import { createElement } from 'react'`,
      `import Game from '${gameDir}/index.tsx'`,
      ``,
      `let root`,
      `export function mount(container) {`,
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

  console.log(`Building game from ${config.gameDir}...`)
  await build(createBuildConfig(gameDir, outDir, entryFile, getViteAliases()))
  console.log(`Game built to ${config.outDir}`)
}

async function runDev() {
  const { createServer } = await import('vite')
  const { createDevConfig } = await import('./create-vite-config.ts')
  const config = await loadConfig()
  const gameDir = resolve(process.cwd(), config.gameDir)
  const manaDir = resolve(process.cwd(), '.mana')
  mkdirSync(manaDir, { recursive: true })
  ensureSymlinks(['react', 'react-dom', 'tailwindcss'])

  writeFileSync(
    resolve(manaDir, 'dev-entry.tsx'),
    [
      `import { createRoot } from 'react-dom/client'`,
      `import { createElement } from 'react'`,
      `import Game from '${gameDir}/index.tsx'`,
      ``,
      `const container = document.getElementById('game')!`,
      `container.style.containerType = 'inline-size'`,
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
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="game" style="width: 100%; height: 100vh; container-type: inline-size"></div>
    <script type="module" src="./dev-entry.tsx"></script>
  </body>
</html>
`,
  )

  const server = await createServer(createDevConfig(gameDir, manaDir, getViteAliases()))
  await server.listen()
  server.printUrls()
}
