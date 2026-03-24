import { useRef } from 'react'

import { COLORS } from './colors.ts'

export function ResizeHandle({
  direction,
  onResize,
}: {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
}) {
  const dragging = useRef(false)

  const isH = direction === 'horizontal'

  return (
    <div
      onMouseDown={e => {
        e.preventDefault()
        dragging.current = true

        const handleMove = (ev: MouseEvent) => {
          if (!dragging.current) return
          onResize(isH ? ev.movementX : ev.movementY)
        }

        const handleUp = () => {
          dragging.current = false
          document.removeEventListener('mousemove', handleMove)
          document.removeEventListener('mouseup', handleUp)
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
        }

        document.body.style.cursor = isH ? 'col-resize' : 'row-resize'
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', handleMove)
        document.addEventListener('mouseup', handleUp)
      }}
      style={{
        flexShrink: 0,
        background: COLORS.border,
        ...(isH
          ? { width: 1, cursor: 'col-resize', padding: '0 1px', margin: '0 -1px', zIndex: 10 }
          : { height: 1, cursor: 'row-resize', padding: '1px 0', margin: '-1px 0', zIndex: 10 }),
      }}
    >
      <div
        style={{ ...(isH ? { width: 1, height: '100%' } : { height: 1, width: '100%' }), background: COLORS.border }}
      />
    </div>
  )
}
