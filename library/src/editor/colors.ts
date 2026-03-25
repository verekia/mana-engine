export const COLORS = {
  bg: '#181818',
  panel: '#1e1e1e',
  panelHeader: '#252525',
  border: '#2e2e2e',
  text: '#d4d4d4',
  textMuted: '#707070',
  textDim: '#505050',
  toolbar: '#1e1e1e',
  viewportBg: '#111',
  hover: '#2a2a2a',
  active: '#333',
  selected: '#1a3a5c',
  selectedBorder: '#2563eb',
  input: '#141414',
  inputBorder: '#333',
  accent: '#3b82f6',
  accentHover: '#2563eb',
  danger: '#ef4444',
  dangerHover: '#dc2626',
  focusRing: '0 0 0 1.5px #3b82f6',
}

export const INPUT_STYLE: React.CSSProperties = {
  background: COLORS.input,
  border: `1px solid ${COLORS.inputBorder}`,
  borderRadius: 4,
  color: COLORS.text,
  fontSize: 11,
  padding: '4px 6px',
  outline: 'none',
}

export const EDITOR_CSS = `
  *, *::before, *::after { cursor: default; }
  input[type="text"], input[type="search"], textarea { cursor: text; }
  input[type="text"][inputmode="decimal"] { cursor: ns-resize; }
  [data-resize="col"] { cursor: col-resize !important; }
  [data-resize="row"] { cursor: row-resize !important; }
  input:focus, select:focus, textarea:focus {
    box-shadow: ${COLORS.focusRing} !important;
    border-color: ${COLORS.accent} !important;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${COLORS.inputBorder}; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: ${COLORS.textDim}; }
  ::-webkit-scrollbar-corner { background: transparent; }
`
