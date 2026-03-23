import { COLORS } from './colors.ts'

import type { TransformMode } from '../scene.ts'

function ToolbarButton({
  children,
  title,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  title?: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? COLORS.accent : 'none',
        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
        borderRadius: 4,
        color: active ? '#fff' : disabled ? COLORS.border : COLORS.text,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        fontSize: 14,
        padding: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

function ToolbarSeparator() {
  return (
    <div
      style={{
        width: 1,
        height: 20,
        background: COLORS.border,
        margin: '0 4px',
      }}
    />
  )
}

export function Toolbar({
  playing,
  onPlay,
  onStop,
  dirty,
  transformMode,
  onTransformModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  playing: boolean
  onPlay: () => void
  onStop: () => void
  dirty: boolean
  transformMode: TransformMode
  onTransformModeChange: (mode: TransformMode) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  return (
    <div
      style={{
        height: 40,
        background: playing ? '#1a2a4a' : COLORS.toolbar,
        borderBottom: `1px solid ${playing ? '#2a4a7a' : COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '0 12px',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Transform mode buttons (left side) */}
      <div style={{ position: 'absolute', left: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
        <ToolbarButton
          title="Translate (W)"
          onClick={() => onTransformModeChange('translate')}
          active={!playing && transformMode === 'translate'}
          disabled={playing}
        >
          T
        </ToolbarButton>
        <ToolbarButton
          title="Rotate (E)"
          onClick={() => onTransformModeChange('rotate')}
          active={!playing && transformMode === 'rotate'}
          disabled={playing}
        >
          R
        </ToolbarButton>
        <ToolbarButton
          title="Scale (R)"
          onClick={() => onTransformModeChange('scale')}
          active={!playing && transformMode === 'scale'}
          disabled={playing}
        >
          S
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo || playing}>
          &#8630;
        </ToolbarButton>
        <ToolbarButton title="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo || playing}>
          &#8631;
        </ToolbarButton>
      </div>

      {/* Play/Stop buttons (center) */}
      <ToolbarButton title="Play" onClick={onPlay} disabled={playing} active={playing}>
        &#9654;
      </ToolbarButton>
      <ToolbarButton title="Stop" onClick={onStop} disabled={!playing}>
        &#9632;
      </ToolbarButton>

      {/* Save status (right side) */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          fontSize: 11,
          fontWeight: 600,
          color: dirty ? '#e8a034' : '#4a4',
        }}
      >
        {dirty ? 'Unsaved' : 'Saved'}
      </div>
    </div>
  )
}
