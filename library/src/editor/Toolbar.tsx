import { COLORS } from './colors.ts'

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

export function Toolbar({
  playing,
  onPlay,
  onStop,
  dirty,
}: {
  playing: boolean
  onPlay: () => void
  onStop: () => void
  dirty: boolean
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
      <ToolbarButton title="Play" onClick={onPlay} disabled={playing} active={playing}>
        &#9654;
      </ToolbarButton>
      <ToolbarButton title="Stop" onClick={onStop} disabled={!playing}>
        &#9632;
      </ToolbarButton>
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
