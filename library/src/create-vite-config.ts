import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'

import type { InlineConfig, Plugin } from 'vite'

// The @tailwindcss/vite plugin uses enhanced-resolve (not Vite's resolver) to
// resolve CSS @import paths. In bun workspaces, tailwindcss lives inside
// node_modules/.bun/ which enhanced-resolve can't find. This plugin rewrites
// the bare @import to an absolute path before the tailwind plugin sees it.
function tailwindResolvePlugin(tailwindPath: string): Plugin {
  return {
    name: 'mana-tailwind-resolve',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.css')) return
      if (!code.includes('tailwindcss')) return
      return code.replace(/@import\s+['"]tailwindcss['"]/g, `@import '${tailwindPath}/index.css'`)
    },
  }
}

function cssInlinePlugin(): Plugin {
  return {
    name: 'mana-css-inline',
    enforce: 'post',
    generateBundle(_, bundle) {
      let css = ''
      const cssKeys: string[] = []

      for (const [key, chunk] of Object.entries(bundle)) {
        if (key.endsWith('.css')) {
          css += (chunk as { source: string }).source
          cssKeys.push(key)
        }
      }

      for (const key of cssKeys) {
        delete bundle[key]
      }

      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          chunk.code += `\nexport const css = ${JSON.stringify(css)};`
        }
      }
    },
  }
}

export function createBuildConfig(
  gameDir: string,
  outDir: string,
  entryFile: string,
  aliases: Record<string, string>,
  tailwindPath: string,
): InlineConfig {
  return {
    plugins: [tailwindResolvePlugin(tailwindPath), react(), tailwindcss(), cssInlinePlugin()],
    build: {
      lib: {
        entry: entryFile,
        formats: ['es'],
        fileName: 'index',
      },
      outDir,
      emptyOutDir: true,
    },
    resolve: {
      alias: aliases,
    },
  }
}

export function createDevConfig(
  gameDir: string,
  root: string,
  aliases: Record<string, string>,
  tailwindPath: string,
): InlineConfig {
  return {
    root,
    plugins: [tailwindResolvePlugin(tailwindPath), react(), tailwindcss()],
    resolve: {
      alias: aliases,
    },
    server: {
      fs: {
        allow: [gameDir, process.cwd()],
      },
    },
  }
}

function sceneApiPlugin(scenesDir: string): Plugin {
  return {
    name: 'mana-scene-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__mana/scenes')) return next()

        if (req.url === '/__mana/scenes' && req.method === 'GET') {
          if (!existsSync(scenesDir)) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify([]))
            return
          }
          const files = readdirSync(scenesDir)
            .filter(f => extname(f) === '.json')
            .map(f => basename(f, '.json'))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(files))
          return
        }

        const match = req.url.match(/^\/__mana\/scenes\/([^/]+)$/)
        if (!match) return next()
        const sceneName = match[1]
        const filePath = resolve(scenesDir, `${sceneName}.json`)

        if (req.method === 'GET') {
          if (!existsSync(filePath)) {
            res.writeHead(404)
            res.end('Scene not found')
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(readFileSync(filePath, 'utf-8'))
          return
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString()
          })
          req.on('end', () => {
            mkdirSync(scenesDir, { recursive: true })
            writeFileSync(filePath, body)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          })
          return
        }

        next()
      })
    },
  }
}

export function createEditorConfig(
  manaRoot: string,
  gameDir: string,
  root: string,
  aliases: Record<string, string>,
  tailwindPath: string,
): InlineConfig {
  const scenesDir = resolve(gameDir, 'scenes')
  return {
    root,
    plugins: [tailwindResolvePlugin(tailwindPath), react(), tailwindcss(), sceneApiPlugin(scenesDir)],
    resolve: {
      alias: aliases,
    },
    server: {
      fs: {
        allow: [manaRoot, gameDir, process.cwd()],
      },
    },
  }
}
