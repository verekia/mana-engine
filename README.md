# Mana Engine

Game engine that compiles a React + Tailwind game directory into a self-contained ES module, mounted via Shadow DOM for style isolation. The 3D renderer and physics engine are pluggable via **adapters** — pick any combination independently.

⚠️ Disclaimer: Entirely vibe-coded, will likely go unmaintained, only use for testing.

## Quickstart

Create a `package.json`:

```json
{
  "name": "my-game",
  "private": true,
  "scripts": {
    "editor": "mana editor",
    "dev": "mana dev",
    "build": "mana build",
    "start": "mana start"
  }
}
```

```sh
bun i mana-engine
```

```sh
bun editor
```

## Features

### Scene System

- **YAML-based scenes** — Scenes defined as YAML files in `scenes/`, converted to JSON at build time (no YAML parser shipped in production)
- **8 entity types** — `camera`, `mesh`, `model`, `directional-light`, `ambient-light`, `point-light`, `ui`, `particles`
- **Multi-scene support** — Switch between scenes at runtime with `useMana().loadScene()` from UI or `ctx.loadScene()` from scripts
- **Coordinate system** — Project-level `y-up` (default) or `z-up` (Blender/CAD) in `mana.json`

### Meshes & Materials

- **6 geometry types** — `box`, `sphere`, `plane`, `capsule`, `cone`, `tetrahedron`
- **PBR material** (Three.js) — Physically-based rendering with metalness/roughness workflow: color, albedo map, emissive map/color, normal map, roughness map, metalness map
- **Lambert material** (VoidCore) — Diffuse color, albedo texture map, emissive texture map
- **GLTF/GLB model loading** — Import 3D models as `model` entities (Three.js and VoidCore)

### Lighting & Shadows

- **Directional light** — Sun-like light with color, intensity, and optional shadow casting
- **Point light** — Localized light source with color, intensity, and optional shadow casting (Three.js only)
- **Ambient light** — Global illumination with color and intensity
- **Shadow mapping** — `castShadow`/`receiveShadow` on meshes, models, and lights
- **Skybox / environment maps** (Three.js) — HDR equirectangular environment maps for image-based lighting and reflections, configurable intensity, optional background display with blur control
- **Post-processing** (Three.js) — Bloom effect with configurable intensity, threshold, and radius

### Script System

- **Unity-like lifecycle** — `init(ctx)`, `update(ctx)`, `fixedUpdate(ctx)`, `dispose()`
- **Collision callbacks** — `onCollisionEnter(ctx, other)`, `onCollisionExit(ctx, other)` fired on contact start/end
- **Script parameters** — Declare typed params (`number`, `string`, `boolean`) with defaults, editable in the editor
- **Fixed timestep** — `fixedUpdate` runs at 60Hz with accumulator for deterministic physics
- **World-space raycasting** — `ctx.raycast(origin, direction)` for shooting, line-of-sight, ground detection
- **Entity tags** — Add `tags: ['enemy', 'collectible']` to entities, query with `ctx.findEntitiesByTag('enemy')`
- **Event bus** — Cross-script communication via `ctx.emit('player-died', data)`, `ctx.on('player-died', cb)`, `ctx.off('player-died', cb)` with auto-cleanup on entity destruction
- **Animation playback** — `ctx.playAnimation('walk')`, `ctx.stopAnimation()`, `ctx.getAnimationNames()` for GLTF skeletal animations with crossfade support
- **ScriptContext** — Provides `entityId`, `entity`, `scene`, `dt`, `time`, `rigidBody`, `input`, `params`

### Input System

- **Keyboard input** — `input.isKeyDown('KeyW')`, `input.isKeyPressed('Space')`, `input.isKeyReleased('ShiftLeft')`
- **Mouse input** — `input.isMouseDown(0)`, `input.mouseX/Y`, `input.mouseDeltaX/Y`, `input.scrollDelta`
- **Axis helpers** — `input.getAxis('horizontal')` (A/D, arrows → -1/+1), `input.getAxis('vertical')` (W/S, arrows → -1/+1)
- **Per-frame state** — Pressed/released states are true for exactly one frame

### Physics (Rapier 3D / Crashcat)

- **Pluggable physics** — Choose between Rapier 3D (WASM) or Crashcat (pure JS) via `mana.json`
- **3 rigid body types** — `dynamic`, `fixed`, `kinematic`
- **4 collider shapes** — `box`, `sphere`, `capsule`, `cylinder`
- **Sensor/trigger volumes** — Colliders with `sensor: true` detect overlaps without physical response
- **Collision events** — `onCollisionEnter`/`onCollisionExit` callbacks on scripts, works with both adapters
- **Rotation locking** — Per-axis `[x, y, z]` rotation lock on rigid bodies
- **Physics materials** — Per-collider `friction` (0–1) and `restitution` (0–1) for ice floors, bouncy pads, etc.
- **Independent physics** — Physics steps even without scripts attached to entities

### Audio

- **Sound effects** — `ctx.playSound('audio/hit.mp3')` with volume and loop options, returns ID for stopping
- **Music playback** — `ctx.playMusic('audio/bgm.mp3')` with looping by default, stops previous track
- **Master volume** — `ctx.setMasterVolume(0.5)` affects all sounds and music
- **Web Audio API** — Buffer caching, automatic AudioContext resume for browser autoplay policy

### Particle System

- **Configurable emitters** — Particles entity type with rate, lifetime, speed, spread, size, color, opacity, gravity, texture, and blending mode
- **Burst mode** — Emit all particles at once for explosions, impacts, etc.
- **Color & opacity interpolation** — Start/end values linearly interpolated over particle lifetime
- **Three.js adapter** — GPU-friendly `Points` + `BufferGeometry` with TSL `SpriteNodeMaterial` for size attenuation and alpha blending
- **VoidCore adapter** — Pool of `Sprite` billboard objects with CPU-driven updates
- **nanothree adapter** — Billboard `Sprite` quads with alpha-blended WebGPU pipelines (normal + additive), soft circle shader, CPU-driven updates
- **Script API** — `ctx.emitParticleBurst(count?)` for triggering bursts, `ctx.resetParticles()` for restarting emitters
- **Editor support** — Full inspector panel with all particle properties, "Particles" entry in Add Entity menu

### Prefab System

- **Reusable entity templates** — Prefabs are YAML files in `prefabs/` (e.g., `enemy.prefab.yaml`) with optional `children` for multi-entity hierarchies
- **Visual prefab editor** — Edit prefabs in a dedicated mode with green toolbar, auto-generated camera and lighting
- **Runtime instantiation** — Spawn prefab instances from scripts via `ctx.instantiatePrefab('enemy', { x: 0, y: 1, z: 0 })` — physics and scripts auto-initialize
- **Entity destruction** — Remove entities at runtime via `ctx.destroyEntity(id)` — cleans up renderer, physics, and scripts
- **Scene-placed instances** — Place prefab instances in scenes via the editor (right-click prefab → "Add to Scene"); the `prefab` field references the template, with per-instance overrides
- **Nested entities** — `SceneEntity` supports `children` for hierarchical multi-part entities (e.g. vehicle with wheels)
- **Asset browser integration** — Browse, create, and edit prefabs from the asset browser's virtual "prefabs" folder
- **Left panel tabs** — Switch between Scenes and Prefabs tabs in the editor sidebar

### UI Components

- **React components** — Rendered as scene entities, authored in the game directory
- **Scene switching** — UI components can call `loadScene()` via the `useMana()` hook
- **Tailwind CSS v4** — Full Tailwind support with container queries

### Editor (`mana editor`)

- **Hierarchy panel** — Collapsible entity tree with parent/child nesting, drag-drop reordering and reparenting, right-click context menu (rename, duplicate, copy, paste, unparent, delete)
- **Inspector panel** — Editable properties for transform, camera, mesh, light, UI, rigid body, collider, and scripts
- **Viewport** — Live 3D preview with raycast-based entity selection and orbit controls
- **Asset browser** — Bottom panel file browser for `assets/` with folder navigation, type icons, previews (images, KTX2, audio), and path copying
- **Asset drag-and-drop** — Drag prefabs, models, audio files into the viewport to create entities; drag textures onto meshes to apply them
- **Scene selector** — Dropdown to switch between scene files
- **Play/Stop mode** — Toggle between editing and running the game with full interactivity
- **Save hotkey** — Cmd+S / Ctrl+S saves the current scene to disk
- **Add Entity menu** — Presets for empty, camera, box, sphere, plane, cylinder, capsule, cone, tetrahedron, lights, and audio
- **Add Component menu** — Attach rigid body, collider, or scripts to entities
- **Multi-select** — Ctrl+click / Cmd+click to add/remove entities from selection in viewport or hierarchy; batch delete
- **Selection outline** — Blue outline highlighting for selected entities
- **Focus/frame entity** — F key flies the camera to center and frame the selected entity
- **Gizmo helpers** — Camera, directional light, point light, and audio helpers visible in edit mode
- **Collider wireframe gizmos** — Visible in editor edit mode
- **UI overlay toggle** — Show/hide React UI components in the viewport
- **Transform gizmos** — Translate (W), rotate (E), scale (R) gizmos for manipulating entities in the viewport
- **Snap-to-grid** — Toggle snap (X key) to snap translations to 1-unit grid, rotations to 15° steps, scale to 0.25 steps
- **Local/World space** — Toggle transform gizmo coordinate space between local and world
- **Undo/redo** — Cmd+Z / Ctrl+Shift+Z with full action history for transforms, entity operations, and property changes
- **Copy/paste/duplicate** — Ctrl+C/V/D for entity clipboard operations, Delete/Backspace to remove entities

### Build & Runtime

- **Shadow DOM isolation** — Game styles don't leak into the host page
- **ES module output** — Production build produces a self-contained module with `mount()`, `unmount()`, and `css` exports
- **CSS inlining** — Vite plugin extracts CSS into a JS export for Shadow DOM injection
- **Hot reload** — Vite HMR with style mirroring into Shadow DOM for dev/prod parity

## Adapter System

The engine is decoupled from any specific 3D renderer or physics library. Choose your renderer and physics engine independently in `mana.json`:

```json
{
  "renderer": "three",
  "physics": "rapier"
}
```

### Renderer Adapters

| Feature               | Three.js                                       | VoidCore                                       | nanothree                                      |
| --------------------- | ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| **Geometries**        | box, sphere, plane, capsule, cone, tetrahedron | box, sphere, plane, capsule, cone, tetrahedron | box, sphere, plane, capsule, cone, tetrahedron |
| **Materials**         | Lambert (color, map, emissiveMap)              | Lambert (color only)                           | Lambert (color, albedo map)                    |
| **Textures**          | PNG, JPG, KTX2 (basis transcoder)              | —                                              | PNG, JPG (albedo only)                         |
| **GLTF/GLB models**   | Yes (GLTFLoader)                               | Yes (loadGLTF)                                 | Yes (custom GLTFLoader)                        |
| **Camera**            | PerspectiveCamera                              | PerspectiveCamera                              | PerspectiveCamera                              |
| **Directional light** | Yes + shadows                                  | Yes + shadows                                  | Yes + shadows (PCF)                            |
| **Ambient light**     | Yes                                            | Yes                                            | Yes                                            |
| **Point light**       | Yes + shadows                                  | — (placeholder)                                | — (placeholder)                                |
| **Shadow mapping**    | castShadow / receiveShadow                     | castShadow only                                | castShadow / receiveShadow                     |
| **Coordinate system** | Y-up native, Z-up via sceneRoot rotation       | Y-up and Z-up                                  | Y-up native, Z-up via sceneRoot                |
| **Frustum culling**   | Yes (per-object)                               | —                                              | Yes (bounding sphere, enabled by default)      |
| **GPU backend**       | WebGPU (WebGPURenderer)                        | WebGPU with WebGL2 fallback                    | WebGPU only                                    |

#### Editor Features (per renderer)

| Feature                          | Three.js                   | VoidCore                  | nanothree                      |
| -------------------------------- | -------------------------- | ------------------------- | ------------------------------ |
| **Orbit controls**               | Yes                        | Yes                       | Yes (manual implementation)    |
| **Raycasting / click-to-select** | Yes                        | Yes                       | Yes (CPU ray-triangle)         |
| **Selection outline**            | Yes (post-processing)      | Yes (native mesh outline) | Yes (invert hull)              |
| **Transform gizmos** (W/E/R)     | Yes (TransformControls)    | Yes (custom gizmos)       | Yes (visual only, no dragging) |
| **Collider wireframe gizmos**    | Yes (green wireframes)     | Yes (green transparent)   | Yes (wireframe meshes)         |
| **Light helper gizmos**          | Camera, directional, point | —                         | Camera, directional            |

### Physics Adapters

| Feature              | Rapier 3D                      | Crashcat                           |
| -------------------- | ------------------------------ | ---------------------------------- |
| **Runtime**          | WASM (async init)              | Pure JS (sync init)                |
| **Body types**       | dynamic, fixed, kinematic      | dynamic, fixed (static), kinematic |
| **Collider shapes**  | box, sphere, capsule, cylinder | box, sphere, capsule, cylinder     |
| **Rotation locking** | Per-axis [x, y, z]             | Per-axis [x, y, z]                 |
| **Sleeping bodies**  | Handled by Rapier              | Skipped in getTransforms           |
| **Gravity**          | -9.81 Y (hardcoded)            | Default world gravity              |

### Adapter-Agnostic Script API (`ScriptContext`)

These APIs work identically regardless of which renderer or physics adapter is active:

| API                             | Status | Description                                      |
| ------------------------------- | ------ | ------------------------------------------------ |
| `ctx.getPosition()`             | Done   | Get entity position                              |
| `ctx.setPosition(x, y, z)`      | Done   | Set entity position (bypasses physics)           |
| `ctx.setRotation(x, y, z)`      | Done   | Set entity Euler rotation (radians)              |
| `ctx.setScale(x, y, z)`         | Done   | Set entity scale                                 |
| `ctx.findEntityPosition(name)`  | Done   | Find another entity's position by name           |
| `ctx.instantiatePrefab(name)`   | Done   | Spawn a prefab instance (with physics + scripts) |
| `ctx.destroyEntity(id)`         | Done   | Remove entity from renderer, physics, scripts    |
| `ctx.entity`                    | Done   | Native renderer object (`unknown`, cast to use)  |
| `ctx.scene`                     | Done   | Native scene object (`unknown`, cast to use)     |
| `ctx.dt` / `ctx.time`           | Done   | Frame delta and elapsed time                     |
| `ctx.input`                     | Done   | Keyboard, mouse, and axis input                  |
| `ctx.params`                    | Done   | Script parameters from editor                    |
| `ctx.raycast(origin, dir)`      | Done   | World-space raycast for gameplay (shooting, LOS) |
| `ctx.playSound(path)`           | Done   | Play a one-shot sound effect                     |
| `ctx.stopSound(id)`             | Done   | Stop a sound by ID                               |
| `ctx.playMusic(path)`           | Done   | Play looping music (stops previous)              |
| `ctx.stopMusic()`               | Done   | Stop current music                               |
| `ctx.setMasterVolume(vol)`      | Done   | Set master volume (0–1)                          |
| `ctx.findEntitiesByTag(tag)`    | Done   | Find all entity IDs with a given tag             |
| `ctx.emit(event, data?)`        | Done   | Emit event to all listeners                      |
| `ctx.on(event, callback)`       | Done   | Subscribe to events (auto-cleanup on destroy)    |
| `ctx.off(event, callback)`      | Done   | Unsubscribe from events                          |
| `ctx.playAnimation(name)`       | Done   | Play GLTF animation clip (with crossfade)        |
| `ctx.stopAnimation()`           | Done   | Stop current animation                           |
| `ctx.getAnimationNames()`       | Done   | List available animation clips                   |
| `ctx.loadScene(name)`           | Done   | Switch to a different scene by name              |
| `ctx.emitParticleBurst(count?)` | Done   | Emit a burst of particles from this emitter      |
| `ctx.resetParticles()`          | Done   | Reset and restart the particle emitter           |

### Adapter-Agnostic Physics API (`ManaRigidBody`)

Exposed via `ctx.rigidBody` — works with both Rapier and Crashcat:

| API                         | Status | Description                 |
| --------------------------- | ------ | --------------------------- |
| `translation()`             | Done   | World-space position        |
| `linvel()`                  | Done   | Linear velocity             |
| `setTranslation(pos, wake)` | Done   | Teleport body               |
| `setLinvel(vel, wake)`      | Done   | Set linear velocity         |
| `angvel()`                  | Done   | Angular velocity            |
| `setAngvel(vel, wake)`      | Done   | Set angular velocity        |
| `rotation()`                | Done   | World-space quaternion      |
| `setRotation(quat, wake)`   | Done   | Set rotation quaternion     |
| `applyImpulse(impulse)`     | Done   | Apply instantaneous impulse |
| `applyForce(force)`         | Done   | Apply continuous force      |
| `mass()`                    | Done   | Get body mass               |
| `setEnabled(enabled)`       | Done   | Enable/disable body         |

### Missing Across All Adapters

These features are not yet implemented in the shared abstraction or any adapter:

- **Joint/constraint system** — Hinge, ball, fixed, prismatic joints between bodies
- **Standard/PBR material** — Roughness, metalness, normal maps (only Lambert exists)
- **Spot light** — Cone-shaped light source
- **Positional audio** — 3D spatialized sound sources attached to entities

## Quick Start

```bash
mkdir my-game && cd my-game
bun add mana-engine
bunx mana editor    # Scaffolds project + opens the editor
bunx mana build     # Build for production
bunx mana start     # Serve the production build locally
```

Running `mana editor` (or `mana dev` / `mana build`) in an empty directory automatically creates the project structure with a default scene containing a camera, light, and cube.

## Project Structure

```
mana.json             # Project config (auto-created)
game.css              # Tailwind entry (auto-created)
scenes/
  default.yaml        # Scene definitions (auto-created with a cube)
scripts/
  rotate.ts           # Behavior scripts (ManaScript)
ui/
  MainMenu.tsx        # React UI components
  HealthBar.tsx
prefabs/              # Reusable entity templates
  enemy.prefab.yaml
assets/               # Static assets (textures, models, audio)
  textures/
  models/
  audio/
```

Scenes, scripts, and UI components are **auto-discovered** — no manual registration or `index.tsx` needed. Just create files in the right directories and they're available.

### `mana.json`

```json
{
  "gameDir": ".",
  "outDir": ".mana/build",
  "startScene": "default",
  "renderer": "three",
  "physics": "rapier",
  "coordinateSystem": "y-up"
}
```

- `gameDir` — Directory containing `scenes/`, `scripts/`, `ui/`, `assets/` (default: `.`)
- `outDir` — Production build output directory (default: `.mana/build`)
- `startScene` — Scene to load on startup (default: first scene alphabetically)
- `renderer` — `"three"` (Three.js WebGPU), `"voidcore"`, or `"nanothree"` (default: `"three"`)
- `physics` — `"rapier"` (WASM), `"crashcat"` (pure JS), or `"none"` (default: `"rapier"`)
- `coordinateSystem` — `"y-up"` or `"z-up"` (default: `"y-up"`)

## Scenes

Scenes are YAML files with a background color and an array of entities:

```yaml
background: '#111111'
entities:
  - id: cube
    name: Cube
    type: mesh
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    mesh: { geometry: box, material: { color: '#4488ff' } }
    tags: [interactive]
    scripts: [{ name: rotate }]
  - id: health-bar
    name: Health Bar
    type: ui
    ui: { component: HealthBar }
```

Entity types: `camera`, `mesh`, `directional-light`, `ambient-light`, `ui`

## Scripts

Scripts implement the `ManaScript` interface with lifecycle methods:

```typescript
import type { ManaScript } from 'mana-engine/game'

export default {
  update({ entity, dt }) {
    entity.rotation.y += dt
  },
} satisfies ManaScript
```

- `init(ctx)` — Called once when the entity is created
- `update(ctx)` — Called every frame with delta time
- `fixedUpdate(ctx)` — Called at fixed 60Hz (for physics)
- `dispose()` — Called on scene cleanup

`ScriptContext` provides: `entityId` (the entity's ID string), `entity` (native renderer object), `scene`, `dt` (seconds), `time` (elapsed seconds), `input` (keyboard/mouse state), `rigidBody` (adapter-agnostic physics body), plus helpers like `getPosition()`, `setPosition()`, `setRotation()`, `setScale()`, `findEntityPosition()`, `findEntitiesByTag()`, `instantiatePrefab()`, `destroyEntity()`, `loadScene()`, `emit()`/`on()`/`off()` for cross-script events, and `playAnimation()`/`stopAnimation()`/`getAnimationNames()` for GLTF animations.

## Scene Switching

UI components can switch scenes using the `useMana()` hook:

```typescript
import { useMana } from 'mana-engine/game'

export default function MainMenu() {
  const { loadScene } = useMana()
  return <button onClick={() => loadScene('first-world')}>Play</button>
}
```

Scripts can also switch scenes directly:

```typescript
export default {
  onCollisionEnter(ctx, other) {
    if (other.entityId === 'exit-door') {
      ctx.loadScene('next-level')
    }
  },
} satisfies ManaScript
```

## Editor

The built-in editor (`mana editor`) provides:

- **Hierarchy panel** — Collapsible entity tree with nesting, drag-drop reordering and reparenting
- **Inspector panel** — Editable properties (transform, material, light, camera, scripts)
- **Viewport** — Live 3D preview with UI overlay
- **Asset browser** — Browse `game/assets/` with folder navigation and path copying
- **Scene selector** — Switch between scene files
- **Play/Stop** — Toggle play mode to test the game with full interactivity
- **Cmd+S / Ctrl+S** — Save scene changes to disk
- **Copy/paste/duplicate** — Ctrl+C/V/D for entity clipboard operations, Delete/Backspace to remove

## Examples

The `examples/` directory contains Bun workspace packages demonstrating different configurations:

- **`examples/platformer/`** — Full platformer demo with host page, scripts, UI components, and multiple scenes
- **`examples/<renderer>-<physics>-<coord>/`** — Minimal examples for every adapter combination (a plane + falling cube):

| Example                  | Renderer  | Physics  | Coordinate System |
| ------------------------ | --------- | -------- | ----------------- |
| `three-rapier-yup`       | Three.js  | Rapier   | Y-up              |
| `three-rapier-zup`       | Three.js  | Rapier   | Z-up              |
| `three-crashcat-yup`     | Three.js  | Crashcat | Y-up              |
| `three-crashcat-zup`     | Three.js  | Crashcat | Z-up              |
| `voidcore-rapier-yup`    | VoidCore  | Rapier   | Y-up              |
| `voidcore-rapier-zup`    | VoidCore  | Rapier   | Z-up              |
| `voidcore-crashcat-yup`  | VoidCore  | Crashcat | Y-up              |
| `voidcore-crashcat-zup`  | VoidCore  | Crashcat | Z-up              |
| `nanothree-rapier-yup`   | nanothree | Rapier   | Y-up              |
| `nanothree-crashcat-yup` | nanothree | Crashcat | Y-up              |

To run any minimal example:

```bash
cd examples/three-rapier-yup
bun run editor
```

## Stack

Bun workspaces, Vite, React 19, Tailwind CSS v4, oxlint, oxfmt, tsgo

## Planned Features

Features not yet implemented that would enhance the engine:

- **Asset manager** — Centralized loading and caching of textures, models, and audio files (asset browser in editor is implemented)
- **Post-processing** — Depth of field, tone mapping, color grading, SSAO (bloom is implemented)
- **Terrain** — Heightmap-based terrain generation
- **Networking** — Multiplayer state synchronization
- **Editor camera bookmarks** — Save and restore camera positions
- **Script hot reload** — Update scripts without restarting play mode
- **Custom shaders** — User-defined shader materials

## VoidCore Feature Parity with Three.js

Features that the Three.js adapter supports today but VoidCore does not yet implement. This serves as the priority roadmap for bringing VoidCore to feature parity.

### Rendering

- **PBR materials** — Metalness, roughness, emissive color (VoidCore only has Lambert diffuse)
- **Texture maps** — Albedo map, normal map, emissive map, roughness map, metalness map (VoidCore supports color only, no texture loading)
- **KTX2 compressed textures** — GPU-compressed texture format with basis transcoder
- **Point lights** — Localized light sources with color, intensity, and shadows (VoidCore creates an empty Group placeholder)
- **Skybox / environment maps** — HDR equirectangular environment maps for image-based lighting, background display, intensity control, and background blur
- **Post-processing** — Bloom effect with configurable intensity, threshold, and radius (requires a render pipeline)

### Editor

- **Light helper gizmos** — Visual helpers for directional lights (DirectionalLightHelper), point lights (PointLightHelper), and cameras (CameraHelper) in the viewport
- **Audio entity visualization** — Speaker-icon helper (center sphere + concentric rings) for audio entities in the viewport (VoidCore skips audio entities entirely)
- **Local/World transform space toggle** — Switch transform gizmo between local and world coordinate space (VoidCore gizmo always operates in scene-local space)

### Performance

- **Instanced particle rendering** — Three.js renders all particles in a single draw call using `Points` + `BufferGeometry` with per-particle GPU attributes; VoidCore and nanothree use individual `Sprite` objects with CPU-driven updates (N draw calls vs 1)
