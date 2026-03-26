import { describe, expect, test } from 'bun:test'

import { resolveAsset, setAssetManifest } from './assets.ts'

describe('resolveAsset', () => {
  test('returns empty string for empty input', () => {
    expect(resolveAsset('')).toBe('')
  })

  test('returns http URLs as-is', () => {
    expect(resolveAsset('https://example.com/texture.png')).toBe('https://example.com/texture.png')
    expect(resolveAsset('http://cdn.example.com/model.glb')).toBe('http://cdn.example.com/model.glb')
  })

  test('returns data URLs as-is', () => {
    expect(resolveAsset('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })

  test('returns blob URLs as-is', () => {
    expect(resolveAsset('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
  })

  test('strips assets/ prefix and serves via /assets/ in dev mode', () => {
    // Reset manifest to null (dev mode)
    setAssetManifest(null)
    expect(resolveAsset('assets/textures/grass.png')).toBe('/assets/textures/grass.png')
    expect(resolveAsset('textures/grass.png')).toBe('/assets/textures/grass.png')
  })

  test('uses asset manifest in production mode', () => {
    setAssetManifest({
      'textures/grass.png': '/game-assets/grass-abc123.png',
      'models/megaxe.glb': '/game-assets/megaxe-def456.glb',
    })

    expect(resolveAsset('textures/grass.png')).toBe('/game-assets/grass-abc123.png')
    expect(resolveAsset('assets/textures/grass.png')).toBe('/game-assets/grass-abc123.png')
    expect(resolveAsset('models/megaxe.glb')).toBe('/game-assets/megaxe-def456.glb')
  })

  test('falls back to original path when not in manifest', () => {
    setAssetManifest({
      'textures/grass.png': '/game-assets/grass-abc123.png',
    })

    expect(resolveAsset('textures/missing.png')).toBe('textures/missing.png')
  })
})
