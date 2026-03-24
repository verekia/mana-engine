import { useRef } from 'react'

import { COLORS } from './colors.ts'

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
        width: 80,
        background: COLORS.input,
        border: `1px solid ${COLORS.inputBorder}`,
        borderRadius: 3,
        color: COLORS.text,
        fontSize: 11,
        padding: '3px 4px',
        outline: 'none',
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

export function Vec3Input({
  label,
  value,
  onChange,
}: {
  label: string
  value: [number, number, number]
  onChange: (v: [number, number, number]) => void
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <div key={axis} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ color: COLORS.textMuted, fontSize: 10 }}>{axis}</span>
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
        marginBottom: 6,
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
        marginBottom: 6,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 24,
            height: 20,
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            padding: 0,
            background: 'none',
          }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 64,
            background: COLORS.input,
            border: `1px solid ${COLORS.inputBorder}`,
            borderRadius: 3,
            color: COLORS.text,
            fontSize: 11,
            padding: '3px 4px',
            outline: 'none',
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
        marginBottom: 6,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 100,
          background: COLORS.input,
          border: `1px solid ${COLORS.inputBorder}`,
          borderRadius: 3,
          color: COLORS.text,
          fontSize: 11,
          padding: '3px 4px',
          outline: 'none',
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
        marginBottom: 6,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11, flexShrink: 0 }}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 120,
          background: COLORS.input,
          border: `1px solid ${COLORS.inputBorder}`,
          borderRadius: 3,
          color: COLORS.text,
          fontSize: 11,
          padding: '3px 4px',
          outline: 'none',
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
        marginBottom: 6,
      }}
    >
      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: COLORS.text,
        fontWeight: 500,
        fontSize: 12,
        marginBottom: 8,
        marginTop: 12,
      }}
    >
      {children}
    </div>
  )
}
