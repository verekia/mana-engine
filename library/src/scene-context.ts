import { createContext, useContext } from 'react'

export interface ManaContextValue {
  loadScene: (name: string) => void
  currentScene: string
}

export const ManaContext = createContext<ManaContextValue>({
  loadScene: () => {},
  currentScene: '',
})

export function useMana() {
  return useContext(ManaContext)
}
