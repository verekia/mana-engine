import { describe, expect, test } from 'bun:test'

import { flattenEntities } from './scene-data.ts'

import type { ColliderData, SceneData, SceneEntity } from './scene-data.ts'

describe('SceneData types', () => {
  test('minimal scene data is valid', () => {
    const scene: SceneData = { entities: [] }
    expect(scene.entities).toEqual([])
    expect(scene.background).toBeUndefined()
  })

  test('scene with background and entities', () => {
    const scene: SceneData = {
      background: '#111111',
      entities: [
        { id: 'cam1', name: 'Camera', type: 'camera', camera: { fov: 50 } },
        {
          id: 'mesh1',
          name: 'Box',
          type: 'mesh',
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          mesh: { geometry: 'box', material: { color: '#ff0000' } },
        },
      ],
    }
    expect(scene.entities).toHaveLength(2)
    expect(scene.entities[0].type).toBe('camera')
    expect(scene.entities[1].mesh?.geometry).toBe('box')
  })

  test('entity with scripts and params', () => {
    const entity: SceneEntity = {
      id: 'e1',
      name: 'Spinning Box',
      type: 'mesh',
      scripts: [{ name: 'rotate', params: { speed: 3 } }],
    }
    expect(entity.scripts).toHaveLength(1)
    expect(entity.scripts?.[0].params?.speed).toBe(3)
  })

  test('entity with rigid body and collider', () => {
    const entity: SceneEntity = {
      id: 'e2',
      name: 'Physics Box',
      type: 'mesh',
      rigidBody: { type: 'dynamic' },
      collider: { shape: 'box', halfExtents: [0.5, 0.5, 0.5] },
    }
    expect(entity.rigidBody?.type).toBe('dynamic')
    expect(entity.collider?.shape).toBe('box')
  })

  test('all collider shapes have expected properties', () => {
    const box: ColliderData = { shape: 'box', halfExtents: [1, 1, 1] }
    const sphere: ColliderData = { shape: 'sphere', radius: 0.5 }
    const capsule: ColliderData = { shape: 'capsule', radius: 0.3, halfHeight: 0.5 }

    expect(box.halfExtents).toEqual([1, 1, 1])
    expect(sphere.radius).toBe(0.5)
    expect(capsule.halfHeight).toBe(0.5)
  })

  test('all entity types are representable', () => {
    const types: SceneEntity['type'][] = [
      'camera',
      'mesh',
      'model',
      'directional-light',
      'ambient-light',
      'point-light',
      'ui',
    ]
    for (const type of types) {
      const entity: SceneEntity = { id: `test-${type}`, name: type, type }
      expect(entity.type).toBe(type)
    }
  })
})

describe('flattenEntities', () => {
  test('returns flat array unchanged', () => {
    const entities: SceneEntity[] = [
      { id: 'a', name: 'A', type: 'mesh' },
      { id: 'b', name: 'B', type: 'mesh' },
    ]
    const result = flattenEntities(entities)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
  })

  test('returns empty array for empty input', () => {
    expect(flattenEntities([])).toEqual([])
  })

  test('flattens one level of children', () => {
    const entities: SceneEntity[] = [
      {
        id: 'parent',
        name: 'Parent',
        type: 'mesh',
        children: [
          { id: 'child1', name: 'Child 1', type: 'mesh' },
          { id: 'child2', name: 'Child 2', type: 'mesh' },
        ],
      },
    ]
    const result = flattenEntities(entities)
    expect(result).toHaveLength(3)
    expect(result.map(e => e.id)).toEqual(['parent', 'child1', 'child2'])
  })

  test('flattens deeply nested children', () => {
    const entities: SceneEntity[] = [
      {
        id: 'root',
        name: 'Root',
        type: 'mesh',
        children: [
          {
            id: 'mid',
            name: 'Mid',
            type: 'mesh',
            children: [{ id: 'leaf', name: 'Leaf', type: 'mesh' }],
          },
        ],
      },
    ]
    const result = flattenEntities(entities)
    expect(result).toHaveLength(3)
    expect(result.map(e => e.id)).toEqual(['root', 'mid', 'leaf'])
  })

  test('handles mix of entities with and without children', () => {
    const entities: SceneEntity[] = [
      { id: 'solo', name: 'Solo', type: 'mesh' },
      {
        id: 'parent',
        name: 'Parent',
        type: 'mesh',
        children: [{ id: 'child', name: 'Child', type: 'mesh' }],
      },
      { id: 'another', name: 'Another', type: 'mesh' },
    ]
    const result = flattenEntities(entities)
    expect(result).toHaveLength(4)
    expect(result.map(e => e.id)).toEqual(['solo', 'parent', 'child', 'another'])
  })

  test('handles entities with empty children array', () => {
    const entities: SceneEntity[] = [{ id: 'a', name: 'A', type: 'mesh', children: [] }]
    const result = flattenEntities(entities)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })
})
