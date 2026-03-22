import { type ComponentType, useState } from 'react'

const COLORS = {
  bg: '#1a1a1a',
  panel: '#242424',
  panelHeader: '#2e2e2e',
  border: '#333',
  text: '#ccc',
  textMuted: '#777',
  toolbar: '#2a2a2a',
  viewportBg: '#111',
  hover: '#383838',
  active: '#444',
}

function Viewport({ Game, showUI }: { Game: ComponentType; showUI: boolean }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: COLORS.viewportBg }}>
      {!showUI && (
        <style>{`[data-mana-viewport] > div > *:not(canvas) { display: none !important; }`}</style>
      )}
      <div data-mana-viewport="" style={{ width: '100%', height: '100%', containerType: 'inline-size' }}>
        <Game />
      </div>
    </div>
  )
}

function ViewportBar({
  showUI,
  onToggleUI,
}: {
  showUI: boolean
  onToggleUI: () => void
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
    </div>
  )
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        color: COLORS.textMuted,
        background: COLORS.panelHeader,
        borderBottom: `1px solid ${COLORS.border}`,
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  )
}

function ToolbarButton({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <button
      title={title}
      style={{
        background: 'none',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        color: COLORS.text,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        fontSize: 14,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

function Toolbar() {
  return (
    <div
      style={{
        height: 40,
        background: COLORS.toolbar,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '0 12px',
        flexShrink: 0,
      }}
    >
      <ToolbarButton title="Play">&#9654;</ToolbarButton>
      <ToolbarButton title="Pause">&#9646;&#9646;</ToolbarButton>
      <ToolbarButton title="Stop">&#9632;</ToolbarButton>
    </div>
  )
}

function LeftPanel() {
  return (
    <div
      style={{
        width: 240,
        background: COLORS.panel,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <PanelHeader>Hierarchy</PanelHeader>
      <div style={{ padding: 10, fontSize: 12, color: COLORS.textMuted, flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '4px 8px', color: COLORS.text }}>Scene</div>
        <div style={{ padding: '4px 8px 4px 24px' }}>Camera</div>
        <div style={{ padding: '4px 8px 4px 24px' }}>Cube</div>
        <div style={{ padding: '4px 8px 4px 24px' }}>Directional Light</div>
        <div style={{ padding: '4px 8px 4px 24px' }}>Ambient Light</div>
      </div>
    </div>
  )
}

function RightPanel() {
  return (
    <div
      style={{
        width: 280,
        background: COLORS.panel,
        borderLeft: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <PanelHeader>Inspector</PanelHeader>
      <div style={{ padding: 10, fontSize: 12, color: COLORS.textMuted, flex: 1, overflow: 'auto' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: COLORS.text, fontWeight: 500, marginBottom: 6 }}>Transform</div>
          <PropertyRow label="Position" value="0, 0, 0" />
          <PropertyRow label="Rotation" value="0, 0, 0" />
          <PropertyRow label="Scale" value="1, 1, 1" />
        </div>
      </div>
    </div>
  )
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '3px 0',
        fontSize: 11,
      }}
    >
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <span style={{ color: COLORS.text }}>{value}</span>
    </div>
  )
}

function BottomPanel() {
  return (
    <div
      style={{
        height: 180,
        background: COLORS.panel,
        borderTop: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <PanelHeader>Console</PanelHeader>
      <div
        style={{
          padding: 10,
          fontSize: 11,
          color: COLORS.textMuted,
          fontFamily: 'monospace',
          flex: 1,
          overflow: 'auto',
        }}
      >
        <div>Mana Engine editor ready</div>
      </div>
    </div>
  )
}

export default function Editor({ Game }: { Game: ComponentType }) {
  const [showUI, setShowUI] = useState(true)

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <LeftPanel />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <ViewportBar showUI={showUI} onToggleUI={() => setShowUI((s) => !s)} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Viewport Game={Game} showUI={showUI} />
          </div>
          <BottomPanel />
        </div>
        <RightPanel />
      </div>
    </div>
  )
}
