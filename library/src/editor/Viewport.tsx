import { type ComponentType, useRef } from 'react'

import { COLORS } from './colors.ts'

import type { SceneEntity } from '../scene-data.ts'

function renderUIEntities(
  entities: SceneEntity[],
  uiComponents: Record<string, ComponentType>,
  playing: boolean,
  onSelectEntity?: (id: string) => void,
  hiddenEntities?: Set<string>,
): React.ReactNode {
  return entities
    .filter(e => e.type === 'ui' || e.type === 'ui-group')
    .map(entity => {
      const hidden = hiddenEntities?.has(entity.id)

      if (entity.type === 'ui-group') {
        return (
          <div key={entity.id} style={hidden ? { display: 'none' } : undefined}>
            {entity.children
              ? renderUIEntities(entity.children, uiComponents, playing, onSelectEntity, hiddenEntities)
              : null}
          </div>
        )
      }

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
          style={{
            pointerEvents: hidden ? 'none' : 'auto',
            opacity: hidden ? 0 : 1,
          }}
        >
          <Component />
        </div>
      )
    })
}

export function Viewport({
  canvasRef,
  uiEntities,
  uiComponents,
  showUI,
  playing,
  onCanvasClick,
  onSelectEntity,
  onAssetDrop,
  hiddenEntities,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  uiEntities: SceneEntity[]
  uiComponents: Record<string, ComponentType>
  showUI: boolean
  playing: boolean
  onCanvasClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onSelectEntity?: (id: string) => void
  onAssetDrop?: (path: string, ext: string, hitEntityId: string | null) => void
  hiddenEntities?: Set<string>
}) {
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      onDragOver={e => {
        if (e.dataTransfer.types.includes('application/mana-asset')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={e => {
        const raw = e.dataTransfer.getData('application/mana-asset')
        if (!raw || !onAssetDrop) return
        e.preventDefault()
        const { path, ext } = JSON.parse(raw)
        // Raycast to find entity under cursor for texture drops
        const canvas = canvasRef.current
        let hitEntityId: string | null = null
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
          const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
          // Pass NDC coords encoded in the hitEntityId — Editor will raycast
          hitEntityId = `__ndc:${ndcX}:${ndcY}`
        }
        onAssetDrop(path, ext, hitEntityId)
      }}
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
        tabIndex={playing ? 0 : undefined}
        style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
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
            {renderUIEntities(uiEntities, uiComponents, playing, onSelectEntity, hiddenEntities)}
          </div>
        </div>
      )}
    </div>
  )
}
