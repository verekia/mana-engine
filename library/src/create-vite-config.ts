import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

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
  _threePath?: string,
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
  threePath: string,
): InlineConfig {
  return {
    root,
    plugins: [tailwindResolvePlugin(tailwindPath), react(), tailwindcss(), basisTranscoderPlugin(threePath)],
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
        if (!/^[a-zA-Z0-9_-]+$/.test(sceneName)) {
          res.writeHead(400)
          res.end('Invalid scene name')
          return
        }
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

function basisTranscoderPlugin(threePath: string): Plugin {
  const basisDir = resolve(threePath, 'examples/jsm/libs/basis')
  return {
    name: 'mana-basis-transcoder',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__mana/basis/')) return next()
        const fileName = req.url.replace('/__mana/basis/', '')
        if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
          res.writeHead(400)
          res.end('Invalid filename')
          return
        }
        const filePath = resolve(basisDir, fileName)
        if (!existsSync(filePath)) {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        const contentType = fileName.endsWith('.wasm') ? 'application/wasm' : 'application/javascript'
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(readFileSync(filePath))
      })
    },
  }
}

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream',
  '.ktx2': 'application/octet-stream',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function validateAssetPath(assetsDir: string, relPath: string): string | null {
  if (/\.\./.test(relPath)) return null
  const absPath = resolve(assetsDir, relPath)
  if (!absPath.startsWith(assetsDir)) return null
  return absPath
}

function assetsApiPlugin(assetsDir: string): Plugin {
  return {
    name: 'mana-assets-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__mana/assets')) return next()
        if (req.method !== 'GET') return next()

        const url = new URL(req.url, 'http://localhost')

        // Serve individual files: /__mana/assets/file?path=...
        if (url.pathname === '/__mana/assets/file') {
          const relPath = url.searchParams.get('path') || ''
          const absPath = validateAssetPath(assetsDir, relPath)
          if (!absPath) {
            res.writeHead(400)
            res.end('Invalid path')
            return
          }
          if (!existsSync(absPath) || statSync(absPath).isDirectory()) {
            res.writeHead(404)
            res.end('Not found')
            return
          }
          const ext = extname(absPath).toLowerCase()
          const mime = MIME_TYPES[ext] || 'application/octet-stream'
          res.writeHead(200, { 'Content-Type': mime })
          res.end(readFileSync(absPath))
          return
        }

        // List directory: /__mana/assets?path=...
        const relPath = url.searchParams.get('path') || ''
        const absPath = validateAssetPath(assetsDir, relPath)
        if (!absPath) {
          res.writeHead(400)
          res.end('Invalid path')
          return
        }

        if (!existsSync(absPath)) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify([]))
          return
        }

        const stat = statSync(absPath)
        if (!stat.isDirectory()) {
          res.writeHead(400)
          res.end('Not a directory')
          return
        }

        const entries = readdirSync(absPath)
          .filter(name => !name.startsWith('.'))
          .map(name => {
            const fullPath = join(absPath, name)
            const fileStat = statSync(fullPath)
            const isDir = fileStat.isDirectory()
            return {
              name,
              type: isDir ? ('folder' as const) : ('file' as const),
              ext: isDir ? null : extname(name).toLowerCase(),
              size: isDir ? null : fileStat.size,
            }
          })
          .toSorted((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
            return a.name.localeCompare(b.name)
          })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(entries))
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
  threePath: string,
): InlineConfig {
  const scenesDir = resolve(gameDir, 'scenes')
  const assetsDir = resolve(gameDir, 'assets')
  return {
    root,
    plugins: [
      tailwindResolvePlugin(tailwindPath),
      react(),
      tailwindcss(),
      sceneApiPlugin(scenesDir),
      assetsApiPlugin(assetsDir),
      basisTranscoderPlugin(threePath),
    ],
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
