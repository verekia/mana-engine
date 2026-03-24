import { describe, expect, test } from 'bun:test'

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
    const cylinder: ColliderData = { shape: 'cylinder', radius: 0.5, halfHeight: 1 }

    expect(box.halfExtents).toEqual([1, 1, 1])
    expect(sphere.radius).toBe(0.5)
    expect(capsule.halfHeight).toBe(0.5)
    expect(cylinder.radius).toBe(0.5)
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
