import { useState } from 'react'

import { useMana } from 'mana-engine/game'

export default function Settings() {
  const { loadScene } = useMana()
  const [musicVolume, setMusicVolume] = useState(80)
  const [sfxVolume, setSfxVolume] = useState(100)

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex w-72 flex-col items-center gap-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Settings</h1>
        <div className="flex w-full flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/60">Music Volume</label>
            <input
              type="range"
              min={0}
              max={100}
              value={musicVolume}
              onChange={e => setMusicVolume(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/60">SFX Volume</label>
            <input
              type="range"
              min={0}
              max={100}
              value={sfxVolume}
              onChange={e => setSfxVolume(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
          </div>
        </div>
        <button
          onClick={() => loadScene('main-menu')}
          className="w-48 rounded-lg bg-white/10 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-white/20"
        >
          Back
        </button>
      </div>
    </div>
  )
}
