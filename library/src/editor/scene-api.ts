import type { SceneData } from '../scene-data.ts'

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
  await fetch(`/__mana/scenes/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2),
  })
}
