# Mana Engine

Game engine that compiles a React + Three.js + Tailwind game directory into a self-contained ES module, mounted via Shadow DOM for style isolation.

## Features

### Scene System

- **JSON-based scenes** — Scenes defined as JSON files in `game/scenes/` with a background color and an entities array
- **7 entity types** — `camera`, `mesh`, `model`, `directional-light`, `ambient-light`, `point-light`, `ui`
- **Multi-scene support** — Switch between scenes at runtime with `useMana().loadScene()`

### Meshes & Materials

- **5 geometry types** — `box`, `sphere`, `plane`, `cylinder`, `capsule`
- **PBR material** — MeshStandardMaterial with configurable color, roughness, metalness, and emissive color
- **Texture maps** — Albedo (`map`), normal, roughness, metalness, and emissive maps via file paths (PNG, JPG, KTX2)
- **GLTF/GLB model loading** — Import 3D models as `model` entities with full PBR material support

### Lighting & Shadows

- **Directional light** — Sun-like light with color, intensity, and optional shadow casting
- **Point light** — Localized light source with color, intensity, and optional shadow casting
- **Ambient light** — Global illumination with color and intensity
- **Shadow mapping** — `castShadow`/`receiveShadow` on meshes, models, and lights with configurable shadow map resolution

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

### Physics (Rapier 3D)

- **3 rigid body types** — `dynamic`, `fixed`, `kinematic`
- **4 collider shapes** — `box`, `sphere`, `capsule`, `cylinder`
- **Independent physics** — Physics steps even without scripts attached to entities
- **Collider wireframe gizmos** — Visible in editor edit mode

### UI Components

- **React components** — Rendered as scene entities, authored in the game directory
- **Scene switching** — UI components can call `loadScene()` via the `useMana()` hook
- **Tailwind CSS v4** — Full Tailwind support with container queries

### Editor (`mana editor`)

- **Hierarchy panel** — Entity tree with selection, right-click context menu (rename, delete)
- **Inspector panel** — Editable properties for transform, camera, mesh, light, UI, rigid body, collider, and scripts
- **Viewport** — Live 3D preview with raycast-based entity selection and orbit controls
- **Asset browser** — Bottom panel file browser for `game/assets/` with folder navigation, type icons, previews (images, KTX2, audio), and path copying
- **Scene selector** — Dropdown to switch between scene files
- **Play/Stop mode** — Toggle between editing and running the game with full interactivity
- **Save hotkey** — Cmd+S / Ctrl+S saves the current scene to disk
- **Add Entity menu** — Presets for empty, camera, box, sphere, plane, cylinder, capsule, and lights
- **Add Component menu** — Attach rigid body, collider, or scripts to entities
- **Selection outline** — Blue outline highlighting for selected entities (WebGPU TSL OutlineNode)
- **Gizmo helpers** — Camera, directional light, and point light helpers visible in edit mode
- **UI overlay toggle** — Show/hide React UI components in the viewport
- **Transform gizmos** — Translate (W), rotate (E), scale (R) gizmos for manipulating entities in the viewport
- **Undo/redo** — Cmd+Z / Ctrl+Shift+Z with full action history for transforms, entity operations, and property changes

### Build & Runtime

- **Shadow DOM isolation** — Game styles don't leak into the host page
- **ES module output** — Production build produces a self-contained module with `mount()`, `unmount()`, and `css` exports
- **CSS inlining** — Vite plugin extracts CSS into a JS export for Shadow DOM injection
- **WebGPU renderer** — Modern GPU rendering via Three.js WebGPURenderer
- **Hot reload** — Vite HMR with style mirroring into Shadow DOM for dev/prod parity

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
  default.json        # Scene definitions (auto-created with a cube)
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
  "startScene": "default"
}
```

- `gameDir` — Directory containing `scenes/`, `scripts/`, `ui/`, `assets/` (default: `.`)
- `outDir` — Production build output directory (default: `.mana/build`)
- `startScene` — Scene to load on startup (default: first scene alphabetically)

## Scenes

Scenes are JSON files with a background color and an array of entities:

```json
{
  "background": "#111111",
  "entities": [
    {
      "id": "cube",
      "name": "Cube",
      "type": "mesh",
      "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "mesh": { "geometry": "box", "material": { "color": "#4488ff" } },
      "scripts": ["rotate"]
    },
    {
      "id": "health-bar",
      "name": "Health Bar",
      "type": "ui",
      "ui": { "component": "HealthBar" }
    }
  ]
}
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

`ScriptContext` provides: `entity` (Three.js Object3D), `scene`, `dt` (seconds), `time` (elapsed seconds), `input` (keyboard/mouse state).

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

Bun workspaces, Vite, React 19, Three.js, Tailwind CSS v4, oxlint, oxfmt, tsgo

## Planned Features

Features not yet implemented that would enhance the engine:

- **Audio system** — Positional and global audio playback with volume/loop controls
- **Animation system** — Keyframe-based animations, skeletal animation, and animation clips
- **Particle system** — Configurable emitters for effects like fire, smoke, and sparks
- **Entity parenting** — Nested entity hierarchies with parent-child transforms
- **Prefab system** — Reusable entity templates that can be instantiated at runtime
- **Asset manager** — Centralized loading and caching of textures, models, and audio files (asset browser in editor is implemented)
- **Post-processing** — Bloom, depth of field, tone mapping, color grading, SSAO
- **Spot light** — Cone-shaped light source with angle and penumbra
- **Skybox / environment maps** — HDR environment lighting and reflections
- **Terrain** — Heightmap-based terrain generation
- **Networking** — Multiplayer state synchronization
- **Scene graph** — Drag-and-drop entity reordering and parenting in the hierarchy panel
- **Multi-select** — Select and manipulate multiple entities at once in the editor
- **Copy/paste entities** — Duplicate entities within and across scenes
- **Editor camera bookmarks** — Save and restore camera positions
- **Script hot reload** — Update scripts without restarting play mode
- **Custom shaders** — User-defined shader materials via Three.js TSL
- **Raycasting API** — Expose raycasting to scripts for gameplay logic (e.g., shooting, line-of-sight)
