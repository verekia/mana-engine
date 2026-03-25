/** Asset manifest mapping original paths to hashed production URLs. */
let assetManifest: Record<string, string> | null = null

/**
 * Set the asset manifest for production builds.
 * Called once at startup with the map from `virtual:mana-assets`.
 */
export function setAssetManifest(manifest: Record<string, string>) {
  assetManifest = manifest
}

/**
 * Resolve an asset path. In production, returns the hashed URL from the manifest.
 * In dev, returns the path prefixed with /assets/ for the dev server middleware.
 * Paths already starting with http/data/blob are returned as-is.
 */
export function resolveAsset(path: string): string {
  if (!path) return path
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path

  // Strip leading "assets/" prefix — manifest keys don't include it
  const key = path.replace(/^assets\//, '')

  if (assetManifest) {
    return assetManifest[key] ?? path
  }

  // Dev mode: serve via /assets/ middleware
  return `/assets/${key}`
}
