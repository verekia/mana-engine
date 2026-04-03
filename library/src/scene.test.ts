import './setup-dom.ts'
import { describe, expect, test, mock } from 'bun:test'

// Polyfill requestAnimationFrame/cancelAnimationFrame for happy-dom
globalThis.requestAnimationFrame = (cb: (time: number) => void) => setTimeout(() => cb(performance.now()), 0) as any
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)

import { resolvePrefabs, setupScripts, assignUniqueIds, createScene } from './scene.ts'

import type { PhysicsAdapter, CollisionEvent } from './adapters/physics-adapter.ts'
import type { RendererAdapter } from './adapters/renderer-adapter.ts'
import type { PrefabData, SceneData, SceneEntity } from './scene-data.ts'
import type { ManaScript } from './script.ts'

// ── resolvePrefabs ──────────────────────────────────────────────────────────

describe('resolvePrefabs', () => {
  test('returns entities unchanged when no prefab references', () => {
    const entities: SceneEntity[] = [
      { id: 'a', name: 'A', type: 'mesh' },
      { id: 'b', name: 'B', type: 'camera' },
    ]
    const result = resolvePrefabs(entities, {})
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
  })

  test('merges prefab defaults with entity overrides', () => {
    const prefabs: Record<string, PrefabData> = {
      enemy: {
        entity: {
          id: 'template',
          name: 'Enemy',
          type: 'mesh',
          mesh: { geometry: 'box', material: { color: '#ff0000' } },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          scripts: [{ name: 'chase' }],
        },
      },
    }

    const entities: SceneEntity[] = [
      {
        id: 'enemy1',
        name: 'Enemy 1',
        type: 'mesh',
        prefab: 'enemy',
        transform: { position: [5, 0, 3] },
      },
    ]

    const result = resolvePrefabs(entities, prefabs)
    expect(result).toHaveLength(1)
    // Entity fields override prefab
    expect(result[0].id).toBe('enemy1')
    expect(result[0].name).toBe('Enemy 1')
    // Prefab defaults are inherited
    expect(result[0].mesh?.geometry).toBe('box')
    expect(result[0].scripts).toHaveLength(1)
    // Transform position is overridden, rotation/scale from prefab
    expect(result[0].transform?.position).toEqual([5, 0, 3])
    expect(result[0].transform?.rotation).toEqual([0, 0, 0])
    expect(result[0].transform?.scale).toEqual([1, 1, 1])
  })

  test('partial transform override keeps prefab values for unspecified fields', () => {
    const prefabs: Record<string, PrefabData> = {
      item: {
        entity: {
          id: 'tpl',
          name: 'Item',
          type: 'mesh',
          transform: { position: [1, 2, 3], rotation: [0, 1, 0], scale: [2, 2, 2] },
        },
      },
    }

    const entities: SceneEntity[] = [
      {
        id: 'item1',
        name: 'Item 1',
        type: 'mesh',
        prefab: 'item',
        transform: { position: [10, 20, 30] }, // only override position
      },
    ]

    const result = resolvePrefabs(entities, prefabs)
    expect(result[0].transform?.position).toEqual([10, 20, 30])
    expect(result[0].transform?.rotation).toEqual([0, 1, 0]) // from prefab
    expect(result[0].transform?.scale).toEqual([2, 2, 2]) // from prefab
  })

  test('warns and returns entity as-is when prefab not found', () => {
    const warnSpy = mock(() => {})
    const origWarn = console.warn
    console.warn = warnSpy

    const entities: SceneEntity[] = [{ id: 'x', name: 'X', type: 'mesh', prefab: 'nonexistent' }]

    const result = resolvePrefabs(entities, {})
    expect(result[0].id).toBe('x')
    expect(result[0].prefab).toBe('nonexistent')
    expect(warnSpy).toHaveBeenCalledTimes(1)

    console.warn = origWarn
  })

  test('resolves prefabs recursively on children', () => {
    const prefabs: Record<string, PrefabData> = {
      wheel: {
        entity: {
          id: 'wheel-tpl',
          name: 'Wheel',
          type: 'mesh',
          mesh: { geometry: 'sphere', material: { color: '#333' } },
        },
      },
    }

    const entities: SceneEntity[] = [
      {
        id: 'car',
        name: 'Car',
        type: 'mesh',
        children: [
          { id: 'w1', name: 'Wheel 1', type: 'mesh', prefab: 'wheel', transform: { position: [-1, 0, 1] } },
          { id: 'w2', name: 'Wheel 2', type: 'mesh', prefab: 'wheel', transform: { position: [1, 0, 1] } },
        ],
      },
    ]

    const result = resolvePrefabs(entities, prefabs)
    expect(result[0].children).toHaveLength(2)
    expect(result[0].children?.[0].mesh?.geometry).toBe('sphere')
    expect(result[0].children?.[1].mesh?.geometry).toBe('sphere')
    expect(result[0].children?.[0].transform?.position).toEqual([-1, 0, 1])
    expect(result[0].children?.[1].transform?.position).toEqual([1, 0, 1])
  })

  test('deep clones prefab data so mutations do not affect template', () => {
    const prefabs: Record<string, PrefabData> = {
      box: {
        entity: {
          id: 'tpl',
          name: 'Box',
          type: 'mesh',
          mesh: { geometry: 'box', material: { color: '#fff' } },
        },
      },
    }

    const entities: SceneEntity[] = [
      { id: 'b1', name: 'B1', type: 'mesh', prefab: 'box' },
      { id: 'b2', name: 'B2', type: 'mesh', prefab: 'box' },
    ]

    const result = resolvePrefabs(entities, prefabs)
    // Mutate one result
    result[0].mesh = result[0].mesh ?? { geometry: 'box' }
    result[0].mesh.material = result[0].mesh.material ?? {}
    result[0].mesh.material.color = '#000'
    // Original and second instance should be unaffected
    expect(prefabs.box.entity.mesh?.material?.color).toBe('#fff')
    expect(result[1].mesh?.material?.color).toBe('#fff')
  })
})

// ── assignUniqueIds ─────────────────────────────────────────────────────────

describe('assignUniqueIds', () => {
  test('assigns a new id with the given prefix', () => {
    const entity: SceneEntity = { id: 'original', name: 'Test', type: 'mesh' }
    assignUniqueIds(entity, 'bullet')
    expect(entity.id).toStartWith('bullet_')
    expect(entity.id).not.toBe('original')
    expect(entity.id.length).toBeGreaterThan('bullet_'.length)
  })

  test('assigns unique ids to children recursively', () => {
    const entity: SceneEntity = {
      id: 'root',
      name: 'Root',
      type: 'mesh',
      children: [
        {
          id: 'child',
          name: 'Child',
          type: 'mesh',
          children: [{ id: 'grandchild', name: 'GC', type: 'mesh' }],
        },
      ],
    }
    assignUniqueIds(entity, 'pfx')
    expect(entity.id).toStartWith('pfx_')
    expect(entity.children?.[0].id).toStartWith('pfx_')
    expect(entity.children?.[0].children?.[0].id).toStartWith('pfx_')
    // All ids should be different
    const ids = [entity.id, entity.children?.[0].id ?? '', entity.children?.[0].children?.[0].id ?? '']
    expect(new Set(ids).size).toBe(3)
  })

  test('generates different ids on successive calls', () => {
    const e1: SceneEntity = { id: 'a', name: 'A', type: 'mesh' }
    const e2: SceneEntity = { id: 'b', name: 'B', type: 'mesh' }
    assignUniqueIds(e1, 'test')
    assignUniqueIds(e2, 'test')
    expect(e1.id).not.toBe(e2.id)
  })
})

// ── setupScripts ────────────────────────────────────────────────────────────

describe('setupScripts', () => {
  test('returns empty array for entities with no scripts', () => {
    const entities: SceneEntity[] = [
      { id: 'a', name: 'A', type: 'mesh' },
      { id: 'b', name: 'B', type: 'camera' },
    ]
    const result = setupScripts(entities, {})
    expect(result).toEqual([])
  })

  test('creates active scripts with default params', () => {
    const rotate: ManaScript = {
      params: {
        speed: { type: 'number', default: 2 },
        axis: { type: 'string', default: 'y' },
      },
    }

    const entities: SceneEntity[] = [{ id: 'cube', name: 'Cube', type: 'mesh', scripts: [{ name: 'rotate' }] }]

    const result = setupScripts(entities, { rotate })
    expect(result).toHaveLength(1)
    expect(result[0].entityId).toBe('cube')
    expect(result[0].params).toEqual({ speed: 2, axis: 'y' })
    expect(result[0].script).toBe(rotate)
  })

  test('instance params override defaults', () => {
    const rotate: ManaScript = {
      params: {
        speed: { type: 'number', default: 2 },
      },
    }

    const entities: SceneEntity[] = [
      { id: 'cube', name: 'Cube', type: 'mesh', scripts: [{ name: 'rotate', params: { speed: 10 } }] },
    ]

    const result = setupScripts(entities, { rotate })
    expect(result[0].params.speed).toBe(10)
  })

  test('coerces string to number when param type is number', () => {
    const script: ManaScript = {
      params: { speed: { type: 'number', default: 1 } },
    }

    const entities: SceneEntity[] = [
      { id: 'e', name: 'E', type: 'mesh', scripts: [{ name: 'test', params: { speed: '5' as any } }] },
    ]

    const result = setupScripts(entities, { test: script })
    expect(result[0].params.speed).toBe(5)
    expect(typeof result[0].params.speed).toBe('number')
  })

  test('coerces string "true" to boolean when param type is boolean', () => {
    const script: ManaScript = {
      params: { active: { type: 'boolean', default: false } },
    }

    const entities: SceneEntity[] = [
      { id: 'e', name: 'E', type: 'mesh', scripts: [{ name: 'test', params: { active: 'true' as any } }] },
    ]

    const result = setupScripts(entities, { test: script })
    expect(result[0].params.active).toBe(true)
    expect(typeof result[0].params.active).toBe('boolean')
  })

  test('coerces non-string to string when param type is string', () => {
    const script: ManaScript = {
      params: { label: { type: 'string', default: 'hi' } },
    }

    const entities: SceneEntity[] = [
      { id: 'e', name: 'E', type: 'mesh', scripts: [{ name: 'test', params: { label: 42 as any } }] },
    ]

    const result = setupScripts(entities, { test: script })
    expect(result[0].params.label).toBe('42')
    expect(typeof result[0].params.label).toBe('string')
  })

  test('warns and skips scripts that are not found', () => {
    const warnSpy = mock(() => {})
    const origWarn = console.warn
    console.warn = warnSpy

    const entities: SceneEntity[] = [{ id: 'e', name: 'E', type: 'mesh', scripts: [{ name: 'missing' }] }]

    const result = setupScripts(entities, {})
    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)

    console.warn = origWarn
  })

  test('handles multiple scripts on one entity', () => {
    const scriptA: ManaScript = { params: { a: { type: 'number', default: 1 } } }
    const scriptB: ManaScript = { params: { b: { type: 'string', default: 'x' } } }

    const entities: SceneEntity[] = [{ id: 'e', name: 'E', type: 'mesh', scripts: [{ name: 'a' }, { name: 'b' }] }]

    const result = setupScripts(entities, { a: scriptA, b: scriptB })
    expect(result).toHaveLength(2)
    expect(result[0].params).toEqual({ a: 1 })
    expect(result[1].params).toEqual({ b: 'x' })
  })

  test('handles scripts with no params defined', () => {
    const script: ManaScript = {
      init() {},
    }

    const entities: SceneEntity[] = [{ id: 'e', name: 'E', type: 'mesh', scripts: [{ name: 'test' }] }]

    const result = setupScripts(entities, { test: script })
    expect(result).toHaveLength(1)
    expect(result[0].params).toEqual({})
  })

  test('extra instance params not in defs are passed through', () => {
    const script: ManaScript = {
      params: { speed: { type: 'number', default: 1 } },
    }

    const entities: SceneEntity[] = [
      { id: 'e', name: 'E', type: 'mesh', scripts: [{ name: 'test', params: { speed: 5, extra: 'bonus' } }] },
    ]

    const result = setupScripts(entities, { test: script })
    expect(result[0].params).toEqual({ speed: 5, extra: 'bonus' })
  })
})

// ── createScene integration ─────────────────────────────────────────────────

function createMockRenderer(): RendererAdapter {
  const entities = new Map<string, SceneEntity>()
  return {
    init: mock(async () => {}),
    dispose: mock(() => {}),
    loadScene: mock(async (data: SceneData) => {
      for (const e of data.entities) {
        entities.set(e.id, e)
      }
    }),
    addEntity: mock(async (entity: SceneEntity) => {
      entities.set(entity.id, entity)
    }),
    removeEntity: mock((id: string) => {
      entities.delete(id)
    }),
    updateEntity: mock(() => {}),
    setEntityVisible: mock(() => {}),
    setEntityPhysicsTransform: mock(() => {}),
    getEntityInitialPhysicsTransform: mock(() => ({
      position: [0, 0, 0] as [number, number, number],
      quaternion: [0, 0, 0, 1] as [number, number, number, number],
    })),
    getEntityPosition: mock((id: string) => {
      const e = entities.get(id)
      if (!e) return null
      return (e.transform?.position as [number, number, number]) ?? [0, 0, 0]
    }),
    setEntityPosition: mock(() => {}),
    setEntityEulerRotation: mock(() => {}),
    setEntityScale: mock(() => {}),
    getEntityNativeObject: mock((id: string) => ({ id, _mock: true })),
    getNativeScene: mock(() => ({ _mockScene: true })),
    raycastWorld: mock(() => null),
    setGizmos: mock(() => {}),
    setSelectedEntities: mock(() => {}),
    raycast: mock(() => null),
    setTransformTarget: mock(() => {}),
    setTransformMode: mock(() => {}),
    getEditorCamera: mock(() => null),
    setEditorCamera: mock(() => {}),
    updateControls: mock(() => {}),
    render: mock(() => {}),
  }
}

function createMockPhysics(): PhysicsAdapter {
  return {
    init: mock(async () => {}),
    dispose: mock(() => {}),
    step: mock(() => {}),
    getTransforms: mock(() => new Map()),
    getBody: mock(() => undefined),
    addEntity: mock(() => {}),
    removeEntity: mock(() => {}),
    getCollisionEvents: mock((): CollisionEvent[] => []),
  }
}

describe('createScene', () => {
  test('initializes renderer and loads scene data', async () => {
    const renderer = createMockRenderer()
    const sceneData: SceneData = {
      background: '#000',
      entities: [
        { id: 'cam', name: 'Camera', type: 'camera' },
        { id: 'box', name: 'Box', type: 'mesh' },
      ],
    }

    const scene = await createScene(document.createElement('canvas'), sceneData, { renderer })
    expect(renderer.init).toHaveBeenCalledTimes(1)
    expect(renderer.loadScene).toHaveBeenCalledTimes(1)
    scene.dispose()
  })

  test('does not init physics in editor mode (orbitControls)', async () => {
    const renderer = createMockRenderer()
    const physics = createMockPhysics()
    const sceneData: SceneData = {
      entities: [{ id: 'box', name: 'Box', type: 'mesh', rigidBody: { type: 'dynamic' } }],
    }

    const scene = await createScene(document.createElement('canvas'), sceneData, {
      renderer,
      physics,
      orbitControls: true,
    })
    expect(physics.init).not.toHaveBeenCalled()
    scene.dispose()
  })

  test('inits physics in play mode when provided', async () => {
    const renderer = createMockRenderer()
    const physics = createMockPhysics()
    const sceneData: SceneData = {
      entities: [{ id: 'box', name: 'Box', type: 'mesh', rigidBody: { type: 'dynamic' } }],
    }

    const scene = await createScene(document.createElement('canvas'), sceneData, {
      renderer,
      physics,
      orbitControls: false,
    })
    expect(physics.init).toHaveBeenCalledTimes(1)
    scene.dispose()
  })

  test('handles undefined scene data gracefully', async () => {
    const renderer = createMockRenderer()
    const scene = await createScene(document.createElement('canvas'), undefined, { renderer })
    expect(renderer.loadScene).not.toHaveBeenCalled()
    scene.dispose()
  })

  test('dispose cleans up renderer and physics', async () => {
    const renderer = createMockRenderer()
    const physics = createMockPhysics()
    const sceneData: SceneData = {
      entities: [{ id: 'a', name: 'A', type: 'mesh' }],
    }

    const scene = await createScene(document.createElement('canvas'), sceneData, {
      renderer,
      physics,
    })
    scene.dispose()
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(physics.dispose).toHaveBeenCalledTimes(1)
  })

  test('editor methods delegate to renderer', async () => {
    const renderer = createMockRenderer()
    const sceneData: SceneData = {
      entities: [{ id: 'box', name: 'Box', type: 'mesh' }],
    }

    const scene = await createScene(document.createElement('canvas'), sceneData, {
      renderer,
      orbitControls: true,
    })

    scene.setGizmos(true)
    expect(renderer.setGizmos).toHaveBeenCalledWith(true)

    scene.setSelectedObjects(['box'])
    expect(renderer.setSelectedEntities).toHaveBeenCalledWith(['box'])

    scene.setTransformMode('rotate')
    expect(renderer.setTransformMode).toHaveBeenCalledWith('rotate')

    scene.setTransformTarget('box')
    expect(renderer.setTransformTarget).toHaveBeenCalledWith('box')

    scene.setEntityVisible('box', false)
    expect(renderer.setEntityVisible).toHaveBeenCalledWith('box', false)

    scene.raycast(0, 0)
    expect(renderer.raycast).toHaveBeenCalledWith(0, 0)

    scene.getEditorCamera()
    expect(renderer.getEditorCamera).toHaveBeenCalled()

    const camState = { position: [0, 5, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number] }
    scene.setEditorCamera(camState)
    expect(renderer.setEditorCamera).toHaveBeenCalledWith(camState)

    scene.dispose()
  })

  test('addEntity and removeEntity delegate to renderer', async () => {
    const renderer = createMockRenderer()
    const scene = await createScene(document.createElement('canvas'), { entities: [] }, { renderer })

    const entity: SceneEntity = { id: 'new', name: 'New', type: 'mesh' }
    scene.addEntity(entity)
    expect(renderer.addEntity).toHaveBeenCalledWith(entity)

    scene.removeEntity('new')
    expect(renderer.removeEntity).toHaveBeenCalledWith('new')

    scene.dispose()
  })

  test('resolves prefab references before loading scene', async () => {
    const renderer = createMockRenderer()
    const prefabs: Record<string, PrefabData> = {
      crate: {
        entity: {
          id: 'crate-tpl',
          name: 'Crate',
          type: 'mesh',
          mesh: { geometry: 'box', material: { color: '#8B4513' } },
        },
      },
    }

    const sceneData: SceneData = {
      entities: [{ id: 'c1', name: 'Crate 1', type: 'mesh', prefab: 'crate', transform: { position: [1, 0, 0] } }],
    }

    const scene = await createScene(document.createElement('canvas'), sceneData, {
      renderer,
      prefabs,
    })

    // Verify loadScene was called with resolved data
    const loadCall = (renderer.loadScene as any).mock.calls[0]
    const loadedData = loadCall[0] as SceneData
    expect(loadedData.entities[0].mesh?.geometry).toBe('box')
    expect(loadedData.entities[0].transform?.position).toEqual([1, 0, 0])

    scene.dispose()
  })
})
