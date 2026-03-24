import { useRef } from 'react'

import { COLORS, INPUT_STYLE } from './colors.ts'

function DragNumberInput({
  value,
  step,
  onChange,
  style,
}: {
  value: number
  step?: number
  onChange: (v: number) => void
  style?: React.CSSProperties
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const baseStep = step ?? 0.1

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => {
        const parsed = Number.parseFloat(e.target.value)
        if (!Number.isNaN(parsed)) onChange(parsed)
      }}
      onMouseDown={e => {
        if (document.activeElement === inputRef.current) return
        e.preventDefault()
        const startY = e.clientY
        const startValue = value
        let dragging = false

        const handleMouseMove = (ev: MouseEvent) => {
          const dy = startY - ev.clientY
          if (!dragging) {
            if (Math.abs(dy) < 3) return
            dragging = true
            document.body.style.cursor = 'ns-resize'
          }
          let multiplier = 1
          if (ev.shiftKey) multiplier = 10
          else if (ev.altKey) multiplier = 0.1
          const newValue = startValue + dy * baseStep * multiplier
          onChangeRef.current(Math.round(newValue * 1000) / 1000)
        }

        const handleMouseUp = () => {
          document.body.style.cursor = ''
          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
          if (!dragging) {
            inputRef.current?.focus()
            inputRef.current?.select()
          }
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
      }}
      style={{
        ...INPUT_STYLE,
        width: 80,
        cursor: 'ns-resize',
        MozAppearance: 'textfield',
        ...style,
      }}
    />
  )
}

export function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '5px 10px',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
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

export function Vec3Input({
  label,
  value,
  onChange,
}: {
  label: string
  value: [number, number, number]
  onChange: (v: [number, number, number]) => void
}) {
  const axisColors = ['#ef4444', '#22c55e', '#3b82f6']
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: COLORS.textMuted, fontSize: 10, marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 3 }}>
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <div key={axis} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0 }}>
            <span
              style={{
                color: axisColors[i],
                fontSize: 9,
                fontWeight: 600,
                width: 12,
                textAlign: 'center',
                flexShrink: 0,
              }}
            >
              {axis}
            </span>
            <DragNumberInput
              value={value[i]}
              step={0.1}
              onChange={v => {
                const next = [...value] as [number, number, number]
                next[i] = v
                onChange(next)
              }}
              style={{ width: '100%' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function NumberInput({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <DragNumberInput value={value} step={step} onChange={onChange} />
    </div>
  )
}

export function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 22,
            height: 22,
            border: `1px solid ${COLORS.inputBorder}`,
            borderRadius: 4,
            padding: 0,
            background: 'none',
          }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            ...INPUT_STYLE,
            width: 56,
            fontFamily: 'monospace',
            fontSize: 10,
          }}
        />
      </div>
    </div>
  )
}

export function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          ...INPUT_STYLE,
          width: 100,
        }}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11, flexShrink: 0 }}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          ...INPUT_STYLE,
          width: 120,
        }}
      />
    </div>
  )
}

export function CheckboxInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `1.5px solid ${value ? COLORS.accent : COLORS.inputBorder}`,
          background: value ? COLORS.accent : COLORS.input,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="1.5">
            <path d="M2 5l2.5 2.5L8 3" />
          </svg>
        )}
      </div>
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: COLORS.text,
        fontWeight: 500,
        fontSize: 11,
        marginBottom: 6,
        marginTop: 10,
        paddingBottom: 3,
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      {children}
    </div>
  )
}
