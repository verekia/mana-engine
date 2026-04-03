# Mana Engine

Game engine that compiles a React + Tailwind game directory into a self-contained ES module, mounted via Shadow DOM for style isolation. The 3D renderer and physics simulation are pluggable via **adapters** — the engine core does not depend on any specific library.

## Architecture

- `library/` — The `mana-engine` npm package: CLI (`mana build`/`mana dev`/`mana editor`), runtime (`mountGame`, `createScene`), and Vite plugins
- `example/` — Consumer example: host page that builds the game with `mana build` then mounts it via `mountGame`
- The CLI generates entry files in `.mana/`, runs Vite programmatically, and bundles React/Tailwind into the game output
- `cssInlinePlugin` extracts CSS into a JS export so `mountGame` can inject it into the Shadow DOM
- `tailwindResolvePlugin` rewrites `@import 'tailwindcss'` to an absolute path because `@tailwindcss/vite` uses `enhanced-resolve` which can't find packages in bun's `.bun/` layout
- Dev mode mirrors Vite-injected `<style>` tags (filtered by `data-vite-dev-id`) into the Shadow DOM via MutationObserver for dev/prod parity
- Dev/editor HTML templates must NOT use `* { padding: 0; }` or similar unlayered CSS resets — they override Tailwind v4's `@layer`-based utilities

## Adapter System

The engine is decoupled from any specific 3D renderer or physics library via two adapter interfaces:

### RendererAdapter (`library/src/adapters/renderer-adapter.ts`)

- Defines all rendering operations: `init`, `loadScene`, `addEntity`, `removeEntity`, `updateEntity`, `setEntityVisible`, `setEntityPhysicsTransform`, `getEntityInitialPhysicsTransform`, `getEntityNativeObject`, `getNativeScene`, `setEntityScale`
- Animation: `playAnimation`, `stopAnimation`, `getAnimationNames`, `updateAnimations` — GLTF animation clip playback with crossfade
- Editor-specific: `setGizmos`, `setSelectedEntities`, `raycast`, `setTransformTarget`, `setTransformMode`, `getEditorCamera`, `setEditorCamera`
- Implementations live in `library/src/adapters/<name>/index.ts`

### PhysicsAdapter (`library/src/adapters/physics-adapter.ts`)

- Defines physics operations: `init`, `dispose`, `step`, `getTransforms`, `getBody`, `addEntity`, `removeEntity`
- `init` receives a callback to read initial entity transforms from the renderer
- `getTransforms()` returns only dynamic/kinematic bodies (fixed bodies never move)
- Physics sync: after each `step()`, the engine calls `renderer.setEntityPhysicsTransform()` for each changed transform

### Available Adapters

Each adapter lives in its own directory under `library/src/adapters/<name>/index.ts`. Renderers and physics engines are fully independent — any renderer can be combined with any physics adapter.

| Path                 | Type     | Library                              |
| -------------------- | -------- | ------------------------------------ |
| `adapters/three/`    | Renderer | Three.js (WebGPU renderer)           |
| `adapters/voidcore/` | Renderer | VoidCore (minimal, stub)             |
| `adapters/rapier/`   | Physics  | Rapier 3D (WASM, async init)         |
| `adapters/crashcat/` | Physics  | Crashcat (pure JS, synchronous init) |

- `ThreeRendererAdapter` wraps Three.js entity creation, OrbitControls, TransformControls, outline post-processing, and raycasting
- `VoidcoreRendererAdapter` wraps VoidCore (WebGPU/WebGL2): meshes (box, sphere, plane, capsule), Lambert materials, directional/ambient lights, shadow casting, coordinate system rotation, physics transform sync
  - No GLTF model loading yet (creates placeholder Group)
  - No point lights yet (VoidCore has no PointLight)
  - Editor features: raycasting (VoidCore `Raycaster`), selection outline (native `MeshOutline`), orbit controls
  - Custom transform gizmos (`transform-gizmo.ts`): translate (arrow handles), rotate (torus rings), scale (cube handles + center sphere) — built with VoidCore `BasicMaterial`, `CylinderGeometry`, `ConeGeometry`, `SphereGeometry`, and a custom torus `Geometry`
    - Screen-constant sizing, axis hover highlighting, click capture to prevent deselection
    - Drag uses ray-axis/ray-plane intersection in scene-local space (sceneRoot inverse transform)
  - No collider wireframe gizmos yet, no light helper gizmos
  - Uses `Engine.create()` for async WebGPU init with WebGL2 fallback
- `RapierPhysicsAdapter` wraps Rapier 3D world setup, rigid body/collider creation, and transform readback
- `CrashcatPhysicsAdapter` wraps Crashcat — a pure-JS physics engine (no WASM, synchronous init)
  - Shapes: box (`halfExtents`), sphere (`radius`), capsule (`halfHeightOfCylinder` + `radius`)
  - Motion types: static, kinematic, dynamic; DOF rotation locking via `lockRotation`
  - `getTransforms()` skips sleeping bodies for efficiency
  - Uses two-layer broadphase: static and dynamic object layers
  - `CrashcatRigidBody` and `CrashcatWorld` type aliases exported for script use
- `GameComponent.tsx` and the editor have NO hardcoded adapter defaults — adapters are always injected via the CLI-generated entry files based on `mana.json` config
- `ManaRigidBody` interface abstracts physics bodies: `translation()`, `linvel()`, `setTranslation()`, `setLinvel()`, `angvel()`, `setAngvel()`, `rotation()`, `setRotation()`, `applyImpulse()`, `applyForce()`, `mass()`, `setEnabled()` — scripts use this generic API and work with both Rapier and Crashcat

### createScene API

`createScene(canvas, sceneData, options)` in `scene.ts` is the adapter-agnostic orchestrator:

- Calls `renderer.init(canvas, ...)` then `renderer.loadScene(sceneData)`
- If a `physics` adapter is provided (play mode only), calls `physics.init(sceneData, getInitialTransform)` seeded from the renderer
- Runs the animation loop: fixed-step physics + scripts, variable-rate update, renderer-driven render
- `ScriptContext.entity` and `.scene` are typed as `unknown` — scripts cast to adapter-specific types (e.g. `ctx.entity as Object3D` for Three.js)
- `ScriptContext.rigidBody` is typed as `ManaRigidBody | undefined` — the adapter-agnostic interface, no casting needed
- `RapierModule` and `RapierRigidBody` type aliases are exported from `adapters/rapier/index.ts` and re-exported from `game.ts`
- Physics init uses `renderer.getEntityInitialPhysicsTransform(id)` — no duck-typing of renderer-specific objects

### Collision & Trigger System

- `CollisionEvent` in `physics-adapter.ts` carries `entityIdA`, `entityIdB`, `started`, `sensor`
- `PhysicsAdapter.getCollisionEvents()` returns events accumulated during the last `step()`
- Rapier adapter: uses `EventQueue` + `ActiveEvents.COLLISION_EVENTS` on every collider; drains events after `world.step(eventQueue)`
- Crashcat adapter: uses `Listener` callbacks (`onContactAdded`, `onContactPersisted`, `onContactRemoved`); tracks active contact pairs to emit enter/exit events
- `ColliderData.sensor` marks a collider as a trigger volume (no physical response, only overlap detection)
- Rapier: `colliderDesc.setSensor(true)` — true trigger volumes with no physical response
- **Crashcat limitation**: Crashcat has no native sensor support; `sensor: true` colliders still produce physical forces (the `sensor` flag in `CollisionInfo` is correctly reported, but the body will still collide physically)
- `ManaScript.onCollisionEnter(ctx, other)` / `onCollisionExit(ctx, other)` — dispatched after each physics step, before `fixedUpdate`
- `CollisionInfo` contains `entityId` (of the other entity) and `sensor` boolean
- Both sides of a collision pair receive callbacks — if entity A hits entity B, both A's and B's scripts are notified

### Physics Material Properties

- `ColliderData.friction` (number, default 0.5) — friction coefficient (0 = frictionless, 1 = high friction)
- `ColliderData.restitution` (number, default 0) — bounciness (0 = no bounce, 1 = perfectly elastic)
- Rapier: applied via `colliderDesc.setFriction()` / `colliderDesc.setRestitution()` on collider creation
- Crashcat: applied directly as `body.friction` / `body.restitution` properties after body creation
- Editor inspector shows Friction and Restitution number inputs in the Collider section

### Entity Tags

- `SceneEntity.tags` is an optional `string[]` field for grouping entities (e.g. `['enemy', 'damageable']`)
- Tags are indexed in `scene.ts` via a `tagIndex: Map<string, Set<string>>` for fast lookup
- `ctx.findEntitiesByTag(tag)` returns all entity IDs with that tag
- Tag index is updated when entities are instantiated from prefabs and cleaned up on entity destruction
- Editor inspector has a Tags section with chip-style display and an input field to add new tags

### Script Event Bus

- `ctx.emit(event, data?)` broadcasts a named event to all listeners across all scripts
- `ctx.on(event, callback)` subscribes to a named event; returns an unsubscribe function
- `ctx.off(event, callback)` removes a specific listener
- Event listeners are tracked per-entity and automatically cleaned up when the entity is destroyed
- Implemented via `eventListeners: Map<string, Set<callback>>` and `entityListeners: Map<entityId, Array<{event, callback}>>` in `scene.ts`

### Animation System

- `ctx.playAnimation(name, { loop?, crossFadeDuration? })` plays a named GLTF animation clip on the entity's model
- `ctx.stopAnimation()` stops all animations on the entity
- `ctx.getAnimationNames()` returns the names of all available animation clips
- Three.js adapter: uses `AnimationMixer` per entity, `AnimationClip` storage from GLTF loading, crossfade between animations via `fadeIn`/`fadeOut`
- VoidCore adapter: stub implementations (no GLTF animation support yet)
- `RendererAdapter.updateAnimations(dt)` is called once per frame to advance all active mixers
- Animation clips are captured during GLTF model loading via `onAnimationClips` callback
- Mixers and clips are cleaned up on entity removal

### Audio System

- `Audio` class in `audio.ts` wraps the Web Audio API with buffer caching
- Created automatically in play mode (`scene.ts`), not in editor edit mode
- `ctx.playSound(path, { volume?, loop? })` — plays a one-shot sound effect, returns a sound ID
- `ctx.stopSound(id)` — stops a sound by ID
- `ctx.playMusic(path, { volume?, loop? })` — plays a music track (loops by default), stops previous music
- `ctx.stopMusic()` — stops current music
- `ctx.setMasterVolume(volume)` — sets master volume (0–1) for all sounds and music
- Handles browser autoplay policy by resuming `AudioContext` on first interaction
- Asset paths are resolved via `resolveAsset()` — works in both dev and production

### Script Raycasting

- `ctx.raycast(origin, direction, maxDistance?)` — world-space ray for gameplay logic (shooting, LOS, ground detection)
- Returns `RaycastHit | null` with `entityId`, `distance`, and world-space `point`
- `RendererAdapter.raycastWorld()` — adapter method that casts from world-space origin/direction against entity meshes (no gizmos/helpers)
- Three.js: transforms ray through `sceneRoot.matrixWorld` for z-up support, transforms hit point back
- VoidCore: uses `Raycaster.set(origin, direction)` directly, walks hit node parents to find entity ID

### Coordinate System

- `coordinateSystem` is set in `mana.json` (project-level) — not per-scene in YAML
- The CLI injects it into the generated entry files; the `Game` component and editor propagate it to every scene before calling `createScene`
- Supported values: `'y-up'` (default) or `'z-up'` (Blender/CAD workflows)
- This is a **project-level abstraction**: users author positions/rotations in their chosen coordinate system and never need to know which axis a given renderer uses internally
- `ThreeRendererAdapter` implements this via a `sceneRoot: Group` — when `z-up`, `sceneRoot.rotation.x = -π/2` converts the entire scene to Three.js world space automatically
- Entity local positions/rotations stay in scene-coordinate space throughout: `snapshotTransform`, `getEntityInitialPhysicsTransform`, and `setEntityPhysicsTransform` all operate in the scene coordinate system
- Physics adapters receive and return transforms in the scene coordinate system; they are coordinate-agnostic (gravity direction is the only configuration needed for Z-up)
- Renderer adapters must apply this convention in their `loadScene()` implementation

## Project Structure & Auto-Discovery

- Running `mana editor`, `mana dev`, or `mana build` in a directory auto-scaffolds a new project if no `mana.json` or `mana.config.js` exists
- Scaffolding creates: `mana.json`, `scenes/default.yaml` (camera + light + cube), `scripts/`, `ui/`, `assets/`, `prefabs/` dirs, and `game.css`
- `mana.json` is the project config: `{ "gameDir": ".", "outDir": ".mana/build", "startScene": "default", "renderer": "three", "physics": "rapier", "coordinateSystem": "y-up" }`
- `renderer` defaults to `"three"` (Three.js WebGPU); supported values: `"three"`, `"voidcore"`
- `physics` defaults to `"rapier"`; supported values: `"rapier"`, `"crashcat"`, `"none"`
- `coordinateSystem` defaults to `"y-up"`; supported values: `"y-up"`, `"z-up"`
- The CLI reads these and injects the correct adapter factories + `coordinateSystem` into the generated entry files — no manual adapter wiring needed
- `gameDir` defaults to `.` (project root); set to e.g. `"game"` for embedding use cases
- The CLI auto-discovers scenes (`scenes/*.yaml`), scripts (`scripts/*.ts`), UI components (`ui/*.tsx`), and prefabs (`prefabs/*.prefab.yaml`) — no manual registration needed
- Generated entry files in `.mana/` wire everything together: imports, maps, and the library's `Game` component
- The `Game` component (`library/src/Game.tsx`) is part of the engine, not user code — it receives `scenes`, `scripts`, `uiComponents`, `prefabs`, and optional `startScene` as props
- Users only author: scene YAML (via editor), script `.ts` files, React UI `.tsx` components, prefab YAML files, and assets
- Legacy `mana.config.js`/`mana.config.mjs` files are still supported as fallback

## Scene System

- Scenes are YAML files in `scenes/` (e.g., `main-menu.yaml`, `first-world.yaml`)
- YAML is used for authoring; at build time a Vite plugin (`yamlPlugin`) transforms `.yaml` imports into JSON so `js-yaml` stays out of the production bundle
- Each scene has a `background` color and an `entities` array
- Entity types: `camera`, `mesh`, `model`, `directional-light`, `ambient-light`, `point-light`, `ui`
- UI entities reference React components by name via `ui: { component: ComponentName }`
- Entities can have `scripts: [scriptName]` to attach behavior scripts
- The `Game` component in the library manages scene switching via `ManaContext`

## Prefab System

- Prefabs are reusable entity templates stored as YAML files in `prefabs/` (e.g., `enemy.prefab.yaml`)
- The `prefabs/` directory is auto-scaffolded on project creation alongside `scenes/`, `scripts/`, `ui/`, `assets/`
- `PrefabData` in `scene-data.ts` contains a single `entity: SceneEntity` field (the root entity definition)
- Prefabs are auto-discovered by the CLI (`discoverPrefabs()`) and imported into generated entry files
- The prefab map is passed to `Game`, `Editor`, and `createScene` for runtime instantiation
- **Prefab API** — Vite middleware at `/__mana/prefabs` (GET list, GET/POST/DELETE by name), mirroring the scene API pattern
  - Client functions in `scene-api.ts`: `fetchPrefabList`, `loadPrefabData`, `savePrefabData`, `createPrefab`, `deletePrefab`, `renamePrefab`
- **Asset browser integration** — A virtual "prefabs" folder appears at the root of the asset browser; when browsing it, a "New Prefab" button appears in the breadcrumb bar; selecting a `.prefab.yaml` file shows a preview with an "Edit Prefab" button
- **Left panel tabs** — The left sidebar has "Scenes" and "Prefabs" tabs; the Prefabs tab lists all prefabs with create/rename/delete/edit via context menu; "Add to Scene" in context menu creates a prefab instance entity
- **Prefab editing mode** — Activated via "Edit" from the asset browser or prefab list; creates a temporary scene with a camera, ambient light, directional light, and the prefab entity; the toolbar turns green with a "PREFAB: name" label and a "Back" button; Cmd+S saves only the prefab entity (stripping helper entities); exiting restores the previous scene state
- **Script instantiation** — `ctx.instantiatePrefab(name, position?)` in `ScriptContext` creates a new entity from a prefab at runtime; returns the entity ID or null if not found; uses `structuredClone` to deep-copy the prefab data and generates a unique instance ID; physics bodies and scripts on the prefab are automatically initialized
- **Entity destruction** — `ctx.destroyEntity(id)` removes an entity from the renderer, physics simulation, and active scripts; works for both scene entities and runtime-instantiated prefab instances
- **Prefab instances in scenes** — Entities can reference a prefab by name via the `prefab` field on `SceneEntity`; at runtime, `scene.ts` resolves prefab references by merging the prefab's entity definition with per-instance overrides (position, rotation, etc.); the editor shows prefab instances with a green icon and "Prefab: name" label in the inspector
- **Nested entities** — `SceneEntity` has an optional `children: SceneEntity[]` field for multi-entity hierarchies; children are flattened before being processed by renderers, physics, and scripts; prefabs can contain children for complex multi-part entities

## Materials & Textures

- `MaterialData` in `scene-data.ts` currently defines **Lambert** material properties only: `color`, `map` (albedo texture), `emissiveMap`
- Additional material types (Standard/PBR, Unlit, etc.) will be added incrementally as adapters support them
- The Three.js adapter uses `MeshLambertMaterial`; texture maps are loaded via `TextureLoader` (standard formats) or `KTX2Loader` (`.ktx2` GPU-compressed textures)
- KTX2 support requires the basis universal transcoder, served via `/__mana/basis/` middleware from Three.js's bundled transcoder files
- `loadTexture()` helper detects file extension and uses the appropriate loader; KTX2 textures load asynchronously with `material.needsUpdate = true`
- In the editor, texture paths are editable text inputs
- `applyMaterialData()` helper in `adapters/three/three-entity.ts` applies material properties to a `MeshLambertMaterial`
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
- `resolveAsset()` is used in `adapters/three/three-entity.ts` for both model loading (`GLTFLoader`) and texture loading (`TextureLoader`, `KTX2Loader`)
- Asset paths in scene YAML should be relative to `game/assets/` (e.g., `models/megaxe.glb`, `textures/grass.ktx2`)
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
- Lifecycle methods: `init(ctx)`, `update(ctx)`, `fixedUpdate(ctx)`, `onCollisionEnter(ctx, other)`, `onCollisionExit(ctx, other)`, `dispose()`
- `ScriptContext` provides: `entityId` (string), `entity` (unknown), `scene` (unknown), `dt` (delta seconds), `time` (elapsed seconds), `rigidBody?` (unknown), `input` (Input), `params` (configured values), audio methods (`playSound`, `playMusic`, `stopSound`, `stopMusic`, `setMasterVolume`), `raycast(origin, direction, maxDistance?)`, `findEntitiesByTag(tag)`, event bus (`emit`, `on`, `off`), and animation (`playAnimation`, `stopAnimation`, `getAnimationNames`)
- `entity`, `scene`, and `rigidBody` are typed `unknown` — scripts cast them to the adapter-specific types they need (e.g. `ctx.entity as Object3D` when using `ThreeRendererAdapter`, `ctx.rigidBody as RapierRigidBody` when using `RapierPhysicsAdapter`)
- Scripts can declare `params: Record<string, ScriptParamDef>` to expose editable parameters in the editor
- `ScriptParamDef` has `type` (`'number' | 'string' | 'boolean'`) and `default` value
- In scene YAML, scripts are `ScriptEntry[]`: `[{ name: rotate, params: { speed: 3 } }]`
- Params are merged at runtime: script defaults are overridden by scene YAML values, accessible via `ctx.params`
- `fixedUpdate` runs at a fixed 60Hz timestep with accumulator
- `ctx.instantiatePrefab(name, position?)` creates a new entity from a prefab at runtime, returns the entity ID; physics bodies and scripts on the prefab are auto-initialized
- `ctx.destroyEntity(id)` removes an entity from the renderer, physics, and scripts at runtime
- `ctx.setScale(x, y, z)` sets the entity's scale
- `ctx.findEntitiesByTag(tag)` returns all entity IDs with a given tag (e.g. `'enemy'`, `'collectible'`)
- `ctx.emit(event, data?)` / `ctx.on(event, cb)` / `ctx.off(event, cb)` — script-to-script event bus with auto-cleanup on entity destruction
- `ctx.playAnimation(name, { loop?, crossFadeDuration? })` / `ctx.stopAnimation()` / `ctx.getAnimationNames()` — GLTF animation playback with crossfade support
- Scripts are auto-discovered from `scripts/` directory by the CLI — no manual registration needed
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
- Editor reads/writes scene YAML files via a Vite middleware API (`/__mana/scenes/:name`) — the API speaks JSON over the wire, the server converts to/from YAML at the file I/O boundary
- Asset browser in bottom panel browses `game/assets/` via `/__mana/assets?path=` API
- `assetsApiPlugin` lists files/folders with type detection, path traversal prevention, and sorted output (folders first)
- Asset file serving via `/__mana/assets/file?path=` for previews (images, audio, KTX2)
- Asset preview panel shows image thumbnails, KTX2 previews (via WebGPU renderer), audio players, and file info
- `basisTranscoderPlugin` serves Three.js basis transcoder files at `/__mana/basis/` for KTX2 decoding
- Scene names are validated to only contain `[a-zA-Z0-9_-]` characters (prevents path traversal)
- Scene selector dropdown to switch between scenes
- Hierarchy panel shows entities from the active scene as a collapsible tree; click to select
- Entity hierarchy supports nesting (parent/child relationships via `children` on `SceneEntity`)
  - Indented rows with collapse/expand triangles; collapsed state persisted to localStorage
  - Drag-and-drop reordering: drop above/below to reorder, drop on center to reparent as child
  - Root-level drop target at bottom of entity list
- Copy/paste/duplicate:
  - Ctrl+C / Cmd+C copies the selected entity (with children) to clipboard
  - Ctrl+V / Cmd+V pastes clipboard as child of selected entity, or at root if nothing selected
  - Ctrl+D / Cmd+D duplicates the selected entity in-place (inserted after original in same parent)
  - Delete / Backspace deletes the selected entity and all children
- Context menu (right-click entity): Rename, Duplicate, Copy, Paste as Child, Unparent (move to root), Delete
- Entity tree helpers in `scene-data.ts`: `findEntityInTree`, `removeEntityFromTree`, `cloneEntity`, `mapEntityTree`
- All entity operations (add, delete, rename, update, transform) are tree-aware via these helpers
- Inspector panel shows editable properties (transform, camera, material, light, UI component, scripts)
- Cmd+S / Ctrl+S saves the current scene to disk
- Play/Stop toolbar buttons toggle play mode:
  - Edit mode: editor manages its own canvas, scripts don't run, UI overlay has `pointerEvents: none`
  - Play mode: recreates the scene with scripts enabled for full interactivity
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
- The editor entry auto-imports discovered `uiComponents`, `scripts`, and `prefabs` (no `game/index.tsx` needed)
- Left panel has two tabs: "Scenes" (scene list + entity hierarchy) and "Prefabs" (prefab list with create/rename/delete)
- Prefab editing mode: green toolbar with "PREFAB: name" label, "Back" button, auto-generated camera/lights, Cmd+S saves prefab data

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

- `RapierModule` and `RapierRigidBody` type aliases are defined in `adapters/rapier/index.ts` and re-exported from `game.ts`
- These centralize the dynamically-imported Rapier types so adapter-specific scripts can use them without `any`
- Physics runs independently of scripts — if entities have `rigidBody` components, physics steps even without scripts attached

## Stack

- Bun workspaces, Vite, React 19, Three.js, Tailwind CSS v4
- oxlint + oxfmt (not eslint/prettier)
- tsgo (native TypeScript compiler, not tsc)
- All dependency versions are pinned

## Note

Whenever important changes are done in this rapidly evolving project, update CLAUDE.md, README.md, website/index.html with relevant information. Any new feature added to the engine must be documented in both CLAUDE.md (architecture/implementation details), README.md and website/index.html (user-facing feature lists). If a planned feature from the README is implemented, move it from the "Planned Features" section into the appropriate feature section.
