import type { PrefabData, SceneData } from '../scene-data.ts'

export interface AssetEntry {
  name: string
  type: 'file' | 'folder'
  ext: string | null
  size: number | null
}

export function assetFileUrl(path: string): string {
  return `/__mana/assets/file?path=${encodeURIComponent(path)}`
}

export async function fetchAssets(path: string): Promise<AssetEntry[]> {
  const res = await fetch(`/__mana/assets?path=${encodeURIComponent(path)}`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchSceneList(): Promise<string[]> {
  const res = await fetch('/__mana/scenes')
  if (!res.ok) return []
  return res.json()
}

export async function loadSceneData(name: string): Promise<SceneData> {
  const res = await fetch(`/__mana/scenes/${name}`)
  if (!res.ok) throw new Error(`Failed to load scene: ${name}`)
  return res.json()
}

export async function saveSceneData(name: string, data: SceneData): Promise<void> {
  const res = await fetch(`/__mana/scenes/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2),
  })
  if (!res.ok) throw new Error(`Failed to save scene: ${name}`)
}

export async function createScene(name: string): Promise<void> {
  const data: SceneData = { background: '#222222', entities: [] }
  await saveSceneData(name, data)
}

export async function deleteScene(name: string): Promise<void> {
  const res = await fetch(`/__mana/scenes/${name}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete scene: ${name}`)
}

export async function renameScene(oldName: string, newName: string): Promise<void> {
  const data = await loadSceneData(oldName)
  await saveSceneData(newName, data)
  await deleteScene(oldName)
}

// ── Prefab API ────────────────────────────────────────────────────────────────

export async function fetchPrefabList(): Promise<string[]> {
  const res = await fetch('/__mana/prefabs')
  if (!res.ok) return []
  return res.json()
}

export async function loadPrefabData(name: string): Promise<PrefabData> {
  const res = await fetch(`/__mana/prefabs/${name}`)
  if (!res.ok) throw new Error(`Failed to load prefab: ${name}`)
  return res.json()
}

export async function savePrefabData(name: string, data: PrefabData): Promise<void> {
  const res = await fetch(`/__mana/prefabs/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2),
  })
  if (!res.ok) throw new Error(`Failed to save prefab: ${name}`)
}

export async function createPrefab(name: string): Promise<void> {
  const data: PrefabData = {
    entity: {
      id: 'root',
      name: name,
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      mesh: { geometry: 'box', material: { color: '#888888' } },
    },
  }
  await savePrefabData(name, data)
}

export async function deletePrefab(name: string): Promise<void> {
  const res = await fetch(`/__mana/prefabs/${name}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete prefab: ${name}`)
}

export async function renamePrefab(oldName: string, newName: string): Promise<void> {
  const data = await loadPrefabData(oldName)
  await savePrefabData(newName, data)
  await deletePrefab(oldName)
}
