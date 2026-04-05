// Texture loading utilities for nanothree

import { NanoTexture } from './material'

/** Cache loaded textures by URL to avoid redundant fetches. */
const textureCache = new Map<string, NanoTexture>()

/**
 * Load an image from a URL and return a NanoTexture.
 * Uses createImageBitmap for efficient GPU-ready decoding.
 */
export function loadTexture(url: string, onLoad?: (texture: NanoTexture) => void): NanoTexture {
  const cached = textureCache.get(url)
  if (cached) {
    onLoad?.(cached)
    return cached
  }

  const texture = new NanoTexture()
  textureCache.set(url, texture)

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to fetch texture: ${url} (${res.status})`)
      return res.blob()
    })
    .then(blob => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then(bitmap => {
      texture.image = bitmap
      texture._dirty = true
      onLoad?.(texture)
    })
    .catch(err => console.warn(`[nanothree] Failed to load texture "${url}":`, err))

  return texture
}

/** Clear the texture cache and dispose all cached textures. */
export function clearTextureCache(): void {
  for (const tex of textureCache.values()) tex.dispose()
  textureCache.clear()
}
