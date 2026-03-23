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
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  uiEntities: SceneEntity[]
  uiComponents: Record<string, ComponentType>
  showUI: boolean
  playing: boolean
  onCanvasClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onSelectEntity?: (id: string) => void
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
              return playing ? (
                <Component key={entity.id} />
              ) : (
                <div
                  key={entity.id}
                  onClick={e => {
                    e.stopPropagation()
                    onSelectEntity?.(entity.id)
                  }}
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
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

export function ViewportBar({
  showUI,
  onToggleUI,
  showGizmos,
  onToggleGizmos,
}: {
  showUI: boolean
  onToggleUI: () => void
  showGizmos: boolean
  onToggleGizmos: () => void
}) {
  return (
    <div
      style={{
        height: 28,
        background: COLORS.panelHeader,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 10,
        flexShrink: 0,
        fontSize: 11,
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          color: COLORS.textMuted,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input type="checkbox" checked={showUI} onChange={onToggleUI} />
        UI
      </label>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          color: COLORS.textMuted,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input type="checkbox" checked={showGizmos} onChange={onToggleGizmos} />
        Gizmos
      </label>
    </div>
  )
}
