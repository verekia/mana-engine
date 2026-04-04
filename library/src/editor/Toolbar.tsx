import { COLORS } from './colors.ts'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
const MOD_KEY = isMac ? '\u2318' : 'Ctrl'
import {
  IconCube,
  IconEye,
  IconGlobe,
  IconGrid,
  IconMagnet,
  IconPlay,
  IconRedo,
  IconRotate,
  IconScale,
  IconStop,
  IconTranslate,
  IconUndo,
} from './icons.tsx'

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
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? COLORS.accent : 'transparent',
        border: `1px solid ${active ? COLORS.accent : 'transparent'}`,
        borderRadius: 5,
        color: active ? '#fff' : disabled ? COLORS.textDim : COLORS.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        padding: 0,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={e => {
        if (!disabled && !active) e.currentTarget.style.background = COLORS.hover
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = active ? COLORS.accent : 'transparent'
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
        height: 14,
        background: COLORS.border,
        margin: '0 2px',
      }}
    />
  )
}

function ToggleButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        background: 'none',
        border: 'none',
        color: active ? COLORS.text : COLORS.textDim,
        padding: '2px 4px',
        fontSize: 10,
        borderRadius: 3,
        userSelect: 'none',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = COLORS.hover
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {icon}
      {label}
    </button>
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
  showUI,
  onToggleUI,
  snapEnabled,
  onToggleSnap,
  transformSpace,
  onToggleTransformSpace,
  showGizmos,
  onToggleGizmos,
  editingPrefab,
  onExitPrefab,
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
  showUI: boolean
  onToggleUI: () => void
  snapEnabled: boolean
  onToggleSnap: () => void
  transformSpace: 'local' | 'world'
  onToggleTransformSpace: () => void
  showGizmos: boolean
  onToggleGizmos: () => void
  editingPrefab?: string | null
  onExitPrefab?: () => void
}) {
  return (
    <div
      style={{
        height: 32,
        background: editingPrefab ? '#0a1f0a' : playing ? '#0f1a2e' : COLORS.panelHeader,
        borderBottom: `1px solid ${editingPrefab ? '#1a3f1a' : playing ? '#1e3a5f' : COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        flexShrink: 0,
        gap: 2,
      }}
    >
      {/* Prefab editing mode indicator */}
      {editingPrefab && (
        <>
          <button
            onClick={onExitPrefab}
            title="Back to scene"
            style={{
              background: 'none',
              border: `1px solid #22c55e`,
              borderRadius: 4,
              color: '#22c55e',
              fontSize: 10,
              padding: '2px 8px',
              fontFamily: 'inherit',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#22c55e'
              e.currentTarget.style.color = '#000'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = '#22c55e'
            }}
          >
            Back
          </button>
          <ToolbarSeparator />
          <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600, letterSpacing: '0.03em' }}>
            PREFAB: {editingPrefab}
          </span>
          <ToolbarSeparator />
        </>
      )}
      {/* Left: transform + undo/redo */}
      <ToolbarButton
        title="Translate (W)"
        onClick={() => onTransformModeChange('translate')}
        active={!playing && transformMode === 'translate'}
        disabled={playing}
      >
        <IconTranslate />
      </ToolbarButton>
      <ToolbarButton
        title="Rotate (E)"
        onClick={() => onTransformModeChange('rotate')}
        active={!playing && transformMode === 'rotate'}
        disabled={playing}
      >
        <IconRotate />
      </ToolbarButton>
      <ToolbarButton
        title="Scale (R)"
        onClick={() => onTransformModeChange('scale')}
        active={!playing && transformMode === 'scale'}
        disabled={playing}
      >
        <IconScale />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton title="Snap (X)" onClick={onToggleSnap} active={!playing && snapEnabled} disabled={playing}>
        <IconMagnet />
      </ToolbarButton>
      <ToolbarButton
        title={`${transformSpace === 'local' ? 'Local' : 'World'} Space`}
        onClick={onToggleTransformSpace}
        disabled={playing}
      >
        {transformSpace === 'world' ? <IconGlobe /> : <IconCube />}
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton title={`Undo (${MOD_KEY}+Z)`} onClick={onUndo} disabled={!canUndo || playing}>
        <IconUndo />
      </ToolbarButton>
      <ToolbarButton title={`Redo (${MOD_KEY}+Shift+Z)`} onClick={onRedo} disabled={!canRedo || playing}>
        <IconRedo />
      </ToolbarButton>

      {/* Center: play/stop toggle */}
      <div style={{ flex: 1 }} />
      <ToolbarButton title={playing ? 'Stop' : 'Play'} onClick={playing ? onStop : onPlay} active={playing}>
        {playing ? <IconStop /> : <IconPlay />}
      </ToolbarButton>
      <div style={{ flex: 1 }} />

      {/* Right: viewport toggles + save status */}
      {!playing && (
        <>
          <ToggleButton icon={<IconEye />} label="UI" active={showUI} onClick={onToggleUI} />
          <ToggleButton icon={<IconGrid />} label="Gizmos" active={showGizmos} onClick={onToggleGizmos} />
          <ToolbarSeparator />
        </>
      )}
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dirty ? '#f59e0b' : '#22c55e',
          }}
        />
        <span style={{ color: dirty ? '#f59e0b' : COLORS.textMuted }}>{dirty ? 'Unsaved' : 'Saved'}</span>
      </div>
    </div>
  )
}
