# Mana Engine

Game engine that compiles a React + Three.js + Tailwind game directory into a self-contained ES module, mounted via Shadow DOM for style isolation.

## Architecture

- `library/` — The `mana-engine` npm package: CLI (`mana build`/`mana dev`), runtime (`mountGame`, `createScene`), and Vite plugins
- `example/` — Consumer example: host page that builds the game with `mana build` then mounts it via `mountGame`
- The CLI generates entry files in `.mana/`, runs Vite programmatically, and bundles React/Three.js/Tailwind into the game output
- `cssInlinePlugin` extracts CSS into a JS export so `mountGame` can inject it into the Shadow DOM
- `tailwindResolvePlugin` rewrites `@import 'tailwindcss'` to an absolute path because `@tailwindcss/vite` uses `enhanced-resolve` which can't find packages in bun's `.bun/` layout
- Dev mode mirrors Vite-injected `<style>` tags into the Shadow DOM via MutationObserver for dev/prod parity

## Commands

- `bun run all` — lint + format check + typecheck + test + build (the full CI pipeline)
- `bun run dev:game` — starts the game in dev mode
- `bun run dev:host` — builds the production game, then starts the host in dev mode
- `bun run build` — build library then example
- `bun run lint` — oxlint
- `bun run format` — oxfmt (write), `bun run format:check` (check only)
- `bun run typecheck` — tsgo
- `bun run test` — bun test

## Stack

- Bun workspaces, Vite, React 19, Three.js, Tailwind CSS v4
- oxlint + oxfmt (not eslint/prettier)
- tsgo (native TypeScript compiler, not tsc)
- All dependency versions are pinned

## Note

Whenever important changes are done in this rapidly evolving project, update CLAUDE.md and README.md with relevant information.
