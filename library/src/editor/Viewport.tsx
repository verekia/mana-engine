import { type ComponentType, useRef } from 'react'

import { COLORS } from './colors.ts'

import type { SceneEntity } from '../scene-data.ts'

export function Viewport({
  canvasRef,
  uiEntities,
  uiComponents,
  showUI,
  playing,
  onCanvasClick,
  onSelectEntity,
  hiddenEntities,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  uiEntities: SceneEntity[]
  uiComponents: Record<string, ComponentType>
  showUI: boolean
  playing: boolean
  onCanvasClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onSelectEntity?: (id: string) => void
  hiddenEntities?: Set<string>
}) {
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: COLORS.viewportBg,
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={
          !playing
            ? e => {
                pointerDownPos.current = { x: e.clientX, y: e.clientY }
              }
            : undefined
        }
        onPointerUp={
          !playing
            ? e => {
                if (pointerDownPos.current) {
                  const dx = e.clientX - pointerDownPos.current.x
                  const dy = e.clientY - pointerDownPos.current.y
                  if (dx * dx + dy * dy < 25) {
                    onCanvasClick?.(e)
                  }
                  pointerDownPos.current = null
                }
              }
            : undefined
        }
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {showUI && uiEntities.length > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            containerType: 'inline-size',
            pointerEvents: playing ? 'auto' : 'none',
          }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {uiEntities.map(entity => {
              const Component = uiComponents[entity.ui?.component ?? '']
              if (!Component) return null
              const hidden = hiddenEntities?.has(entity.id)
              return playing ? (
                <Component key={entity.id} />
              ) : (
                <div
                  key={entity.id}
                  onClick={e => {
                    e.stopPropagation()
                    onSelectEntity?.(entity.id)
                  }}
                  style={{
                    pointerEvents: hidden ? 'none' : 'auto',
                    opacity: hidden ? 0 : 1,
                  }}
                >
                  <Component />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
