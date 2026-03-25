export interface GameBundle {
  mount(container: HTMLElement, options?: { assetManifest?: Record<string, string> }): void
  unmount(): void
  css: string
  assetManifest?: Record<string, string>
}

export function mountGame(element: HTMLElement, bundle: GameBundle): () => void {
  const shadow = element.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = bundle.css
  shadow.appendChild(style)

  const container = document.createElement('div')
  container.style.containerType = 'inline-size'
  container.style.width = '100%'
  container.style.height = '100%'
  shadow.appendChild(container)

  bundle.mount(container, { assetManifest: bundle.assetManifest })

  return () => {
    bundle.unmount()
  }
}
