import { COLORS } from './colors.ts'
import { PanelHeader } from './widgets.tsx'

export function BottomPanel({ logs }: { logs: { id: number; msg: string }[] }) {
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
        {logs.map(entry => (
          <div key={entry.id}>{entry.msg}</div>
        ))}
      </div>
    </div>
  )
}
