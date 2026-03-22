import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import type { InlineConfig, Plugin } from 'vite'

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
): InlineConfig {
  return {
    plugins: [react(), tailwindcss(), cssInlinePlugin()],
    build: {
      lib: {
        entry: entryFile,
        formats: ['es'],
        fileName: 'index',
      },
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        external: [],
      },
    },
    resolve: {
      alias: aliases,
    },
  }
}

export function createDevConfig(gameDir: string, root: string, aliases: Record<string, string>): InlineConfig {
  return {
    root,
    plugins: [react(), tailwindcss()],
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
