# Mana Engine

Game engine that compiles a React + Tailwind game directory into a self-contained ES module, mounted via Shadow DOM for style isolation. The 3D renderer and physics engine are pluggable via **adapters** — pick any combination independently.

## Features

### Scene System

- **YAML-based scenes** — Scenes defined as YAML files in `scenes/`, converted to JSON at build time (no YAML parser shipped in production)
- **7 entity types** — `camera`, `mesh`, `model`, `directional-light`, `ambient-light`, `point-light`, `ui`
- **Multi-scene support** — Switch between scenes at runtime with `useMana().loadScene()`
- **Coordinate system** — Project-level `y-up` (default) or `z-up` (Blender/CAD) in `mana.json`

### Meshes & Materials

- **4 geometry types** — `box`, `sphere`, `plane`, `capsule`
- **Lambert material** — Diffuse color, albedo texture map, emissive texture map
- **GLTF/GLB model loading** — Import 3D models as `model` entities (Three.js only)

### Lighting & Shadows

- **Directional light** — Sun-like light with color, intensity, and optional shadow casting
- **Point light** — Localized light source with color, intensity, and optional shadow casting (Three.js only)
- **Ambient light** — Global illumination with color and intensity
- **Shadow mapping** — `castShadow`/`receiveShadow` on meshes, models, and lights

### Script System

- **Unity-like lifecycle** — `init(ctx)`, `update(ctx)`, `fixedUpdate(ctx)`, `dispose()`
- **Script parameters** — Declare typed params (`number`, `string`, `boolean`) with defaults, editable in the editor
- **Fixed timestep** — `fixedUpdate` runs at 60Hz with accumulator for deterministic physics
- **ScriptContext** — Provides `entity`, `scene`, `dt`, `time`, `rigidBody`, `input`, `params`

### Input System

- **Keyboard input** — `input.isKeyDown('KeyW')`, `input.isKeyPressed('Space')`, `input.isKeyReleased('ShiftLeft')`
- **Mouse input** — `input.isMouseDown(0)`, `input.mouseX/Y`, `input.mouseDeltaX/Y`, `input.scrollDelta`
- **Axis helpers** — `input.getAxis('horizontal')` (A/D, arrows → -1/+1), `input.getAxis('vertical')` (W/S, arrows → -1/+1)
- **Per-frame state** — Pressed/released states are true for exactly one frame

### Physics (Rapier 3D / Crashcat)

- **Pluggable physics** — Choose between Rapier 3D (WASM) or Crashcat (pure JS) via `mana.json`
- **3 rigid body types** — `dynamic`, `fixed`, `kinematic`
- **3 collider shapes** — `box`, `sphere`, `capsule`
- **Rotation locking** — Per-axis `[x, y, z]` rotation lock on rigid bodies
- **Independent physics** — Physics steps even without scripts attached to entities

### UI Components

- **React components** — Rendered as scene entities, authored in the game directory
- **Scene switching** — UI components can call `loadScene()` via the `useMana()` hook
- **Tailwind CSS v4** — Full Tailwind support with container queries

### Editor (`mana editor`)

- **Hierarchy panel** — Entity tree with selection, right-click context menu (rename, delete)
- **Inspector panel** — Editable properties for transform, camera, mesh, light, UI, rigid body, collider, and scripts
- **Viewport** — Live 3D preview with raycast-based entity selection and orbit controls
- **Asset browser** — Bottom panel file browser for `assets/` with folder navigation, type icons, previews (images, KTX2, audio), and path copying
- **Scene selector** — Dropdown to switch between scene files
- **Play/Stop mode** — Toggle between editing and running the game with full interactivity
- **Save hotkey** — Cmd+S / Ctrl+S saves the current scene to disk
- **Add Entity menu** — Presets for empty, camera, box, sphere, plane, cylinder, capsule, and lights
- **Add Component menu** — Attach rigid body, collider, or scripts to entities
- **Selection outline** — Blue outline highlighting for selected entities
- **Gizmo helpers** — Camera, directional light, and point light helpers visible in edit mode
- **Collider wireframe gizmos** — Visible in editor edit mode
- **UI overlay toggle** — Show/hide React UI components in the viewport
- **Transform gizmos** — Translate (W), rotate (E), scale (R) gizmos for manipulating entities in the viewport
- **Undo/redo** — Cmd+Z / Ctrl+Shift+Z with full action history for transforms, entity operations, and property changes

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

| Feature               | Three.js                                 | VoidCore                    |
| --------------------- | ---------------------------------------- | --------------------------- |
| **Geometries**        | box, sphere, plane, capsule              | box, sphere, plane, capsule |
| **Materials**         | Lambert (color, map, emissiveMap)        | Lambert (color only)        |
| **Textures**          | PNG, JPG, KTX2 (basis transcoder)        | —                           |
| **GLTF/GLB models**   | Yes (GLTFLoader)                         | — (placeholder)             |
| **Camera**            | PerspectiveCamera                        | PerspectiveCamera           |
| **Directional light** | Yes + shadows                            | Yes + shadows               |
| **Ambient light**     | Yes                                      | Yes                         |
| **Point light**       | Yes + shadows                            | — (placeholder)             |
| **Shadow mapping**    | castShadow / receiveShadow               | castShadow only             |
| **Coordinate system** | Y-up native, Z-up via sceneRoot rotation | Y-up and Z-up               |
| **GPU backend**       | WebGPU (WebGPURenderer)                  | WebGPU with WebGL2 fallback |

#### Editor Features (per renderer)

| Feature                          | Three.js                   | VoidCore |
| -------------------------------- | -------------------------- | -------- |
| **Orbit controls**               | Yes                        | Yes      |
| **Raycasting / click-to-select** | Yes                        | —        |
| **Selection outline**            | Yes (post-processing)      | —        |
| **Transform gizmos** (W/E/R)     | Yes (TransformControls)    | —        |
| **Collider wireframe gizmos**    | Yes (green wireframes)     | —        |
| **Light helper gizmos**          | Camera, directional, point | —        |

### Physics Adapters

| Feature              | Rapier 3D                 | Crashcat                           |
| -------------------- | ------------------------- | ---------------------------------- |
| **Runtime**          | WASM (async init)         | Pure JS (sync init)                |
| **Body types**       | dynamic, fixed, kinematic | dynamic, fixed (static), kinematic |
| **Collider shapes**  | box, sphere, capsule      | box, sphere, capsule               |
| **Rotation locking** | Per-axis [x, y, z]        | Per-axis [x, y, z]                 |
| **Sleeping bodies**  | Handled by Rapier         | Skipped in getTransforms           |
| **Gravity**          | -9.81 Y (hardcoded)       | Default world gravity              |

### Adapter-Agnostic Script API (`ScriptContext`)

These APIs work identically regardless of which renderer or physics adapter is active:

| API                            | Status | Description                                     |
| ------------------------------ | ------ | ----------------------------------------------- |
| `ctx.getPosition()`            | Done   | Get entity position                             |
| `ctx.setPosition(x, y, z)`     | Done   | Set entity position (bypasses physics)          |
| `ctx.setRotation(x, y, z)`     | Done   | Set entity Euler rotation (radians)             |
| `ctx.findEntityPosition(name)` | Done   | Find another entity's position by name          |
| `ctx.entity`                   | Done   | Native renderer object (`unknown`, cast to use) |
| `ctx.scene`                    | Done   | Native scene object (`unknown`, cast to use)    |
| `ctx.dt` / `ctx.time`          | Done   | Frame delta and elapsed time                    |
| `ctx.input`                    | Done   | Keyboard, mouse, and axis input                 |
| `ctx.params`                   | Done   | Script parameters from editor                   |

### Adapter-Agnostic Physics API (`ManaRigidBody`)

Exposed via `ctx.rigidBody` — works with both Rapier and Crashcat:

| API                         | Status      | Description                 |
| --------------------------- | ----------- | --------------------------- |
| `translation()`             | Done        | World-space position        |
| `linvel()`                  | Done        | Linear velocity             |
| `setTranslation(pos, wake)` | Done        | Teleport body               |
| `setLinvel(vel, wake)`      | Done        | Set linear velocity         |
| `angvel()`                  | **Missing** | Angular velocity            |
| `setAngvel(vel, wake)`      | **Missing** | Set angular velocity        |
| `rotation()`                | **Missing** | World-space quaternion      |
| `setRotation(quat, wake)`   | **Missing** | Set rotation quaternion     |
| `applyImpulse(impulse)`     | **Missing** | Apply instantaneous impulse |
| `applyForce(force)`         | **Missing** | Apply continuous force      |
| `mass()`                    | **Missing** | Get body mass               |
| `setEnabled(enabled)`       | **Missing** | Enable/disable body         |

### Missing Across All Adapters

These features are not yet implemented in the shared abstraction or any adapter:

- **Collision/contact callbacks** — `onCollisionEnter`, `onCollisionExit` events for scripts
- **Raycasting API for scripts** — `ctx.raycast(origin, direction)` for gameplay logic (line-of-sight, shooting)
- **Joint/constraint system** — Hinge, ball, fixed, prismatic joints between bodies
- **Trigger volumes** — Colliders that detect overlap without physical response
- **Mass/density/restitution/friction** — Per-collider physics material properties
- **Cylinder collider** — Supported as a geometry but not as a collider shape
- **Standard/PBR material** — Roughness, metalness, normal maps (only Lambert exists)
- **Spot light** — Cone-shaped light source
- **Entity parenting** — Nested entity hierarchies with parent-child transforms
- **Animation system** — Keyframe and skeletal animation playback
- **Audio system** — Positional and global audio

## Quick Start

```bash
mkdir my-game && cd my-game
bun add mana-engine
bunx mana editor    # Scaffolds project + opens the editor
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
- `renderer` — `"three"` (Three.js WebGPU) or `"voidcore"` (default: `"three"`)
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

`ScriptContext` provides: `entity` (native renderer object), `scene`, `dt` (seconds), `time` (elapsed seconds), `input` (keyboard/mouse state), `rigidBody` (adapter-agnostic physics body), plus helpers like `getPosition()`, `setPosition()`, `setRotation()`, and `findEntityPosition()`.

## Scene Switching

UI components can switch scenes using the `useMana()` hook:

```typescript
import { useMana } from 'mana-engine/game'

export default function MainMenu() {
  const { loadScene } = useMana()
  return <button onClick={() => loadScene('first-world')}>Play</button>
}
```

## Editor

The built-in editor (`mana editor`) provides:

- **Hierarchy panel** — Scene entity tree with selection
- **Inspector panel** — Editable properties (transform, material, light, camera, scripts)
- **Viewport** — Live 3D preview with UI overlay
- **Asset browser** — Browse `game/assets/` with folder navigation and path copying
- **Scene selector** — Switch between scene files
- **Play/Stop** — Toggle play mode to test the game with full interactivity
- **Cmd+S / Ctrl+S** — Save scene changes to disk

## Stack

Bun workspaces, Vite, React 19, Tailwind CSS v4, oxlint, oxfmt, tsgo

## Planned Features

Features not yet implemented that would enhance the engine:

- **Particle system** — Configurable emitters for effects like fire, smoke, and sparks
- **Prefab system** — Reusable entity templates that can be instantiated at runtime
- **Asset manager** — Centralized loading and caching of textures, models, and audio files (asset browser in editor is implemented)
- **Post-processing** — Bloom, depth of field, tone mapping, color grading, SSAO
- **Skybox / environment maps** — HDR environment lighting and reflections
- **Terrain** — Heightmap-based terrain generation
- **Networking** — Multiplayer state synchronization
- **Scene graph** — Drag-and-drop entity reordering and parenting in the hierarchy panel
- **Multi-select** — Select and manipulate multiple entities at once in the editor
- **Copy/paste entities** — Duplicate entities within and across scenes
- **Editor camera bookmarks** — Save and restore camera positions
- **Script hot reload** — Update scripts without restarting play mode
- **Custom shaders** — User-defined shader materials
