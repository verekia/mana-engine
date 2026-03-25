# Mana Engine

Game engine that compiles a React + Three.js + Tailwind game directory into a self-contained ES module, mounted via Shadow DOM for style isolation.

## Architecture

- `library/` — The `mana-engine` npm package: CLI (`mana build`/`mana dev`/`mana editor`), runtime (`mountGame`, `createScene`), and Vite plugins
- `example/` — Consumer example: host page that builds the game with `mana build` then mounts it via `mountGame`
- The CLI generates entry files in `.mana/`, runs Vite programmatically, and bundles React/Three.js/Tailwind into the game output
- `cssInlinePlugin` extracts CSS into a JS export so `mountGame` can inject it into the Shadow DOM
- `tailwindResolvePlugin` rewrites `@import 'tailwindcss'` to an absolute path because `@tailwindcss/vite` uses `enhanced-resolve` which can't find packages in bun's `.bun/` layout
- Dev mode mirrors Vite-injected `<style>` tags (filtered by `data-vite-dev-id`) into the Shadow DOM via MutationObserver for dev/prod parity
- Dev/editor HTML templates must NOT use `* { padding: 0; }` or similar unlayered CSS resets — they override Tailwind v4's `@layer`-based utilities

## Scene System

- Scenes are JSON files in `game/scenes/` (e.g., `main-menu.json`, `first-world.json`)
- Each scene has a `background` color and an `entities` array
- Entity types: `camera`, `mesh`, `model`, `directional-light`, `ambient-light`, `point-light`, `ui`
- UI entities reference React components by name via `"ui": { "component": "ComponentName" }`
- Entities can have `"scripts": ["scriptName"]` to attach behavior scripts
- The game component imports all scene JSONs into a `scenes` map and manages scene switching via `ManaContext`

## Materials & Textures

- `MaterialData` in `scene-data.ts` defines PBR material properties: `color`, `roughness`, `metalness`, `emissive` (color), and texture maps
- Texture map fields: `map` (albedo), `normalMap`, `roughnessMap`, `metalnessMap`, `emissiveMap` — all are string paths to image files
- Textures are loaded via Three.js `TextureLoader` (standard formats) or `KTX2Loader` (`.ktx2` GPU-compressed textures) at entity creation time
- KTX2 support requires the basis universal transcoder, served via `/__mana/basis/` middleware from Three.js's bundled transcoder files
- `loadTexture()` helper detects file extension and uses the appropriate loader; KTX2 textures load asynchronously with `material.needsUpdate = true`
- In the editor, texture paths are editable text inputs; scalar values (roughness, metalness) are draggable number inputs
- `applyMaterialData()` helper applies all material properties to a `MeshStandardMaterial`
- Texture disposal is handled in `dispose()` and `removeEntity()` to prevent memory leaks

## GLTF/GLB Model Loading

- Entity type `'model'` loads 3D models via Three.js `GLTFLoader`
- `ModelData` has a single `src` field (path to `.gltf` or `.glb` file)
- Models are loaded asynchronously after the entity `Group` is added to the scene
- The loaded GLTF scene is added as a child of the entity `Group`
- Shadow properties (`castShadow`/`receiveShadow`) are applied recursively to all child meshes
- Editor "Add Entity" menu includes a "GLTF Model" preset
- Model entity icon in hierarchy: SVG model icon
- Raycast selection works on model entities by traversing child meshes

## Asset Pipeline

- `assets.ts` provides `resolveAsset(path)` — resolves asset paths for both dev and production
- In dev mode: paths are served via `/assets/` middleware (Vite plugin in `create-vite-config.ts`)
- In production: `manaAssetsPlugin` scans `game/assets/` at build time, emits files through Rollup with content hashes
- The asset manifest (original path → hashed filename) is appended as `assetManifest` export on the entry chunk
- `mountGame()` reads `bundle.assetManifest` and calls `setAssetManifest()` to configure the runtime resolver
- `resolveAsset()` is used in `entity.ts` for both model loading (`GLTFLoader`) and texture loading (`TextureLoader`, `KTX2Loader`)
- Asset paths in scene JSON should be relative to `game/assets/` (e.g., `models/megaxe.glb`, `textures/grass.ktx2`)
- The `assets/` prefix is optional and stripped automatically by the resolver

## Shadow Mapping

- Shadow mapping is enabled globally on the `WebGPURenderer` (`renderer.shadowMap.enabled = true`)
- Mesh and model entities have `castShadow` and `receiveShadow` boolean properties on `SceneEntity`
- Directional and point lights have `castShadow` on `LightData`
- Directional light shadows use 2048x2048 shadow maps with configurable camera bounds (-10 to 10, near 0.5, far 50)
- Point light shadows use 1024x1024 shadow maps
- Shadow properties are applied recursively on Group/model entities via `applyShadowProps()`
- Editor inspector shows checkbox inputs for shadow properties on mesh, model, and light entities

## Script System

- Scripts are TypeScript files in `game/scripts/` implementing `ManaScript`
- Lifecycle methods: `init(ctx)`, `update(ctx)`, `fixedUpdate(ctx)`, `dispose()`
- `ScriptContext` provides: `entity` (Object3D), `scene` (Scene), `dt` (delta seconds), `time` (elapsed seconds), `rigidBody?` (RapierRigidBody), `input` (Input), `params` (configured values)
- Scripts can declare `params: Record<string, ScriptParamDef>` to expose editable parameters in the editor
- `ScriptParamDef` has `type` (`'number' | 'string' | 'boolean'`) and `default` value
- In scene JSON, scripts are `ScriptEntry[]`: `[{ "name": "rotate", "params": { "speed": 3 } }]`
- Params are merged at runtime: script defaults are overridden by scene JSON values, accessible via `ctx.params`
- `fixedUpdate` runs at a fixed 60Hz timestep with accumulator
- Scripts are registered in `game/index.tsx` as `export const scripts: Record<string, ManaScript>`
- Scripts only run during gameplay (dev/prod/editor play mode), NOT in editor edit mode

## Input System

- `Input` class in `input.ts` tracks keyboard, mouse, and axis state per frame
- Created automatically for play mode (scripts); not created in editor edit mode
- Keyboard: `input.isKeyDown(code)`, `input.isKeyPressed(code)`, `input.isKeyReleased(code)` — uses `KeyboardEvent.code` (e.g. `'KeyW'`, `'Space'`)
- Mouse: `input.isMouseDown(button)`, `input.isMousePressed(button)`, `input.isMouseReleased(button)`, `input.mouseX/Y`, `input.mouseDeltaX/Y`, `input.scrollDelta`
- Axes: `input.getAxis('horizontal')` (A/D or Left/Right → -1/+1), `input.getAxis('vertical')` (W/S or Up/Down → -1/+1)
- `beginFrame()` computes mouse deltas, `endFrame()` clears per-frame pressed/released sets
- Accessible via `ctx.input` in script lifecycle methods
- Exported from `mana-engine/game` as `Input` class and included in `ScriptContext` type

## Editor

- `mana editor` launches a full editor with hierarchy, inspector, viewport, and asset browser panels
- Editor source is split into modular components: `Editor.tsx` (main), `Toolbar.tsx`, `Viewport.tsx`, `LeftPanel.tsx`, `RightPanel.tsx`, `BottomPanel.tsx`, `widgets.tsx`, `colors.ts`, `icons.tsx`, `ResizeHandle.tsx`, `scene-api.ts`, `history.ts`
- Editor reads/writes scene JSON files via a Vite middleware API (`/__mana/scenes/:name`)
- Asset browser in bottom panel browses `game/assets/` via `/__mana/assets?path=` API
- `assetsApiPlugin` lists files/folders with type detection, path traversal prevention, and sorted output (folders first)
- Asset file serving via `/__mana/assets/file?path=` for previews (images, audio, KTX2)
- Asset preview panel shows image thumbnails, KTX2 previews (via WebGPU renderer), audio players, and file info
- `basisTranscoderPlugin` serves Three.js basis transcoder files at `/__mana/basis/` for KTX2 decoding
- Scene names are validated to only contain `[a-zA-Z0-9_-]` characters (prevents path traversal)
- Scene selector dropdown to switch between scenes
- Hierarchy panel shows entities from the active scene; click to select
- Inspector panel shows editable properties (transform, camera, material, light, UI component, scripts)
- Cmd+S / Ctrl+S saves the current scene to disk
- Play/Stop toolbar buttons toggle play mode:
  - Edit mode: editor manages its own canvas, scripts don't run, UI overlay has `pointerEvents: none`
  - Play mode: mounts the actual Game component in the viewport with full interactivity
- Transform gizmos: TransformControls from Three.js for translate/rotate/scale manipulation in the viewport
  - W key = translate, E key = rotate, R key = scale
  - Gizmo attaches to selected entity automatically
  - OrbitControls disabled while dragging gizmo to prevent camera conflicts
  - Gizmo drag fires `onTransformStart`, `onTransformChange`, `onTransformEnd` callbacks
- Undo/redo: `UndoHistory` class in `history.ts` with stack-based action history
  - Cmd+Z / Ctrl+Z to undo, Cmd+Shift+Z / Ctrl+Shift+Z to redo
  - Toolbar buttons for undo/redo with enabled/disabled state
  - Tracks: transform changes (gizmo drag), entity add/delete, rename, property updates
  - History is cleared when switching scenes
- The editor entry imports `Game`, `uiComponents`, and `scripts` from the game's `index.tsx`

## Game Component Contract

The game's `index.tsx` must export:

- `default` — The `Game` React component (default export)
- `uiComponents` — `Record<string, ComponentType>` mapping names to React UI components
- `scripts` — `Record<string, ManaScript>` mapping names to script implementations

## Scene Switching API

- `useMana()` hook from `mana-engine/game` provides `{ loadScene, currentScene }`
- UI components call `loadScene('scene-name')` to switch scenes
- `ManaContext` is provided by the Game component

## Commands

Always run `bun install` first to ensure dependencies (including CLI tools like `oxfmt`, `oxlint`, `tsgo`) are installed. All commands below are defined in the root `package.json` and must be run from the repository root. Always run `bun run format` before committing, and run `bun run all` to validate everything passes before pushing.

- `bun run all` — lint + format check + typecheck + test + build (the full CI pipeline)
- `bun run dev:game` — starts the game in dev mode
- `bun run dev:host` — builds the production game, then starts the host in dev mode
- `bun run build` — build library then example
- `bun run lint` — oxlint
- `bun run format` — oxfmt (write), `bun run format:check` (check only)
- `bun run typecheck` — tsgo
- `bun run test` — bun test

## Rapier Types

- `RapierModule` and `RapierRigidBody` type aliases are exported from `scene.ts` and `game.ts`
- These centralize the dynamically-imported Rapier types so scripts and the engine can use them without `any`
- Physics runs independently of scripts — if entities have `rigidBody` components, physics steps even without scripts attached

## Stack

- Bun workspaces, Vite, React 19, Three.js, Tailwind CSS v4
- oxlint + oxfmt (not eslint/prettier)
- tsgo (native TypeScript compiler, not tsc)
- All dependency versions are pinned

## Note

Whenever important changes are done in this rapidly evolving project, update CLAUDE.md and README.md with relevant information. Any new feature added to the engine must be documented in both CLAUDE.md (architecture/implementation details) and README.md (user-facing feature list). If a planned feature from the README is implemented, move it from the "Planned Features" section into the appropriate feature section.
