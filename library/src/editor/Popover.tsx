import { useEffect, useRef } from 'react'

import { COLORS } from './colors.ts'

/**
 * A generic popover that positions itself relative to an anchor or absolute position.
 * Closes on click outside or Escape key.
 */
export function Popover({
  anchorRef,
  position,
  onClose,
  width = 180,
  maxHeight = 300,
  children,
}: {
  anchorRef?: React.RefObject<HTMLButtonElement | null>
  position?: { x: number; y: number }
  onClose: () => void
  width?: number
  maxHeight?: number
  children: React.ReactNode
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = (() => {
    if (position) {
      const spaceBelow = window.innerHeight - position.y
      const top = spaceBelow < maxHeight ? position.y - maxHeight : position.y
      return { top: Math.max(4, top), left: Math.max(4, position.x) }
    }
    if (!anchorRef?.current) return { top: 0, left: 0 }
    const rect = anchorRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow < maxHeight ? rect.top - maxHeight - 2 : rect.bottom + 2
    return { top: Math.max(4, top), left: Math.max(4, rect.left) }
  })()

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 1001,
        padding: '4px 0',
        maxHeight,
        overflow: 'auto',
      }}
    >
      {children}
    </div>
  )
}

/** A simple button item for use inside a Popover. */
export function PopoverItem({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mana-hover"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: icon ? '4px 10px' : '5px 10px',
        background: 'transparent',
        border: 'none',
        color: COLORS.text,
        fontSize: 11,
        textAlign: 'left',
      }}
    >
      {icon && <span style={{ color: COLORS.textMuted, display: 'flex' }}>{icon}</span>}
      {label}
    </button>
  )
}

/** A category header for grouping items inside a Popover. */
export function PopoverCategory({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '5px 10px 3px',
        fontSize: 9,
        color: COLORS.textMuted,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </div>
  )
}
