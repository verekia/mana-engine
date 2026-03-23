# Mana Engine

Game engine that compiles a React + Three.js + Tailwind game directory into a self-contained ES module, mounted via Shadow DOM for style isolation.

## Features

### Scene System

- **JSON-based scenes** — Scenes defined as JSON files in `game/scenes/` with a background color and an entities array
- **6 entity types** — `camera`, `mesh`, `directional-light`, `ambient-light`, `point-light`, `ui`
- **Multi-scene support** — Switch between scenes at runtime with `useMana().loadScene()`

### Meshes & Materials

- **5 geometry types** — `box`, `sphere`, `plane`, `cylinder`, `capsule`
- **PBR material** — MeshStandardMaterial with configurable color

### Lighting

- **Directional light** — Sun-like light with color and intensity
- **Point light** — Localized light source with color and intensity
- **Ambient light** — Global illumination with color and intensity

### Script System

- **Unity-like lifecycle** — `init(ctx)`, `update(ctx)`, `fixedUpdate(ctx)`, `dispose()`
- **Script parameters** — Declare typed params (`number`, `string`, `boolean`) with defaults, editable in the editor
- **Fixed timestep** — `fixedUpdate` runs at 60Hz with accumulator for deterministic physics
- **ScriptContext** — Provides `entity`, `scene`, `dt`, `time`, `rigidBody`, `params`

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
- **Console panel** — Log output for scene loads, saves, play/stop events, and errors
- **Scene selector** — Dropdown to switch between scene files
- **Play/Stop mode** — Toggle between editing and running the game with full interactivity
- **Save hotkey** — Cmd+S / Ctrl+S saves the current scene to disk
- **Add Entity menu** — Presets for empty, camera, box, sphere, plane, cylinder, capsule, and lights
- **Add Component menu** — Attach rigid body, collider, or scripts to entities
- **Selection outline** — Blue outline highlighting for selected entities (WebGPU TSL OutlineNode)
- **Gizmo helpers** — Camera, directional light, and point light helpers visible in edit mode
- **UI overlay toggle** — Show/hide React UI components in the viewport

### Build & Runtime

- **Shadow DOM isolation** — Game styles don't leak into the host page
- **ES module output** — Production build produces a self-contained module with `mount()`, `unmount()`, and `css` exports
- **CSS inlining** — Vite plugin extracts CSS into a JS export for Shadow DOM injection
- **WebGPU renderer** — Modern GPU rendering via Three.js WebGPURenderer
- **Hot reload** — Vite HMR with style mirroring into Shadow DOM for dev/prod parity

## Quick Start

```bash
bun install
bun run dev:game    # Dev server with hot reload
bun run editor      # Open the visual editor
bun run build       # Production build
```

## Project Structure

```
game/
  index.tsx           # Game component, uiComponents & scripts registries
  game.css            # Tailwind entry
  scenes/
    main-menu.json    # Scene definitions
    first-world.json
  scripts/
    rotate.ts         # Behavior scripts (ManaScript)
  ui/
    MainMenu.tsx      # React UI components
    HealthBar.tsx
```

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

`ScriptContext` provides: `entity` (Three.js Object3D), `scene`, `dt` (seconds), `time` (elapsed seconds).

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
- **Console** — Log output
- **Scene selector** — Switch between scene files
- **Play/Stop** — Toggle play mode to test the game with full interactivity
- **Cmd+S / Ctrl+S** — Save scene changes to disk

## Game Component

The game's `index.tsx` exports:

```typescript
export default function Game() {
  /* ... */
}
export const uiComponents: Record<string, ComponentType> = { HealthBar, MainMenu }
export const scripts: Record<string, ManaScript> = { rotate }
```

## Stack

Bun workspaces, Vite, React 19, Three.js, Tailwind CSS v4, oxlint, oxfmt, tsgo

## Planned Features

Features not yet implemented that would enhance the engine:

- **Texture support** — Albedo, normal, roughness, metalness, emissive maps on materials
- **GLTF/GLB model loading** — Import 3D models as entities
- **Shadow mapping** — `castShadow`/`receiveShadow` on meshes and lights
- **Audio system** — Positional and global audio playback with volume/loop controls
- **Animation system** — Keyframe-based animations, skeletal animation, and animation clips
- **Particle system** — Configurable emitters for effects like fire, smoke, and sparks
- **Input system** — First-class keyboard, mouse, touch, and gamepad input API available in ScriptContext
- **Transform gizmos** — Translate/rotate/scale gizmos in the editor viewport (like Unity/Blender)
- **Undo/redo** — Editor action history
- **Entity parenting** — Nested entity hierarchies with parent-child transforms
- **Prefab system** — Reusable entity templates that can be instantiated at runtime
- **Asset manager** — Centralized loading and caching of textures, models, and audio files
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
