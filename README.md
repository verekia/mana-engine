# Mana Engine

Game engine that compiles a React + Three.js + Tailwind game directory into a self-contained ES module, mounted via Shadow DOM for style isolation.

## Features

- **Scene system** — JSON-based scenes with entities (cameras, meshes, lights, UI components)
- **Script system** — Unity-like lifecycle scripts (`init`, `update`, `fixedUpdate`, `dispose`) attached to entities
- **Multi-scene support** — Switch between scenes at runtime with `useMana().loadScene()`
- **UI components** — React components rendered as scene entities, authored in the game directory
- **Editor** — Built-in editor with hierarchy, inspector, viewport, console, and play mode
- **Shadow DOM isolation** — Game styles don't leak into the host page
- **Tailwind CSS v4** — Full Tailwind support with container queries

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
