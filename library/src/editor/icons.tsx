const S = 14

const svgProps = {
  width: S,
  height: S,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// -- Toolbar icons --

export function IconTranslate() {
  return (
    <svg {...svgProps}>
      <path d="M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" />
    </svg>
  )
}

export function IconRotate() {
  return (
    <svg {...svgProps}>
      <path d="M13 3a7 7 0 0 0-10 0M3 13a7 7 0 0 0 10 0" />
      <path d="M13 3l-2.5 1M13 3l-1 2.5" />
    </svg>
  )
}

export function IconScale() {
  return (
    <svg {...svgProps}>
      <path d="M3 13l10-10" />
      <rect x="2" y="11" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="11" y="2" width="3" height="3" rx="0.5" fill="currentColor" />
    </svg>
  )
}

export function IconUndo() {
  return (
    <svg {...svgProps}>
      <path d="M4 7h6a3 3 0 0 1 0 6H9" />
      <path d="M7 4L4 7l3 3" />
    </svg>
  )
}

export function IconRedo() {
  return (
    <svg {...svgProps}>
      <path d="M12 7H6a3 3 0 0 0 0 6h1" />
      <path d="M9 4l3 3-3 3" />
    </svg>
  )
}

export function IconPlay() {
  return (
    <svg {...svgProps}>
      <path d="M5 3l9 5-9 5V3z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconStop() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// -- Entity type icons --

export function IconCamera() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <rect x="2" y="4" width="9" height="8" rx="1" />
      <path d="M11 6.5l3-1.5v6l-3-1.5" />
    </svg>
  )
}

export function IconMesh() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7z" />
      <path d="M8 1.5v6.5l5.5 3" />
      <path d="M8 8L2.5 4.5" />
    </svg>
  )
}

export function IconModel() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M2 5l6-3 6 3v6l-6 3-6-3z" />
      <path d="M2 5l6 3 6-3" />
      <path d="M8 8v6" />
    </svg>
  )
}

export function IconDirectionalLight() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1" />
    </svg>
  )
}

export function IconAmbientLight() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <circle cx="8" cy="7" r="3.5" />
      <path d="M6 12h4M6.5 14h3" />
      <path d="M6 10.5v1.5M10 10.5v1.5" />
    </svg>
  )
}

export function IconPointLight() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.5" fill="currentColor" strokeWidth="0" />
      <path d="M8 3v1M8 12v1M3 8h1M12 8h1M4.5 4.5l.7.7M10.8 10.8l.7.7M11.5 4.5l-.7.7M5.2 10.8l-.7.7" />
    </svg>
  )
}

export function IconUI() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6h12" />
    </svg>
  )
}

// -- Asset icons --

export function IconFolder() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M2 4.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5H3A1 1 0 0 0 2 4.5z" />
    </svg>
  )
}

export function IconImage() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <circle cx="5.5" cy="6" r="1.2" />
      <path d="M2 11l3.5-3 2.5 2 2.5-2L14 11" />
    </svg>
  )
}

export function IconAudio() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M3 6v4h2.5L9 13V3L5.5 6z" />
      <path d="M11 6.5a2.5 2.5 0 0 1 0 3" />
      <path d="M12.5 5a4.5 4.5 0 0 1 0 6" />
    </svg>
  )
}

export function IconVideo() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <rect x="2" y="3.5" width="8.5" height="9" rx="1" />
      <path d="M10.5 6l3.5-2v8l-3.5-2" />
    </svg>
  )
}

export function IconFile() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M4 2h5l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M9 2v4h4" />
    </svg>
  )
}

export function IconData() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M5 3l-2 5 2 5M11 3l2 5-2 5" />
      <path d="M9 3L7 13" />
    </svg>
  )
}

export function IconFont() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M3 13l4-10h2l4 10" />
      <path d="M5 9h6" />
    </svg>
  )
}

export function Icon3D() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7z" />
      <path d="M8 1.5v6.5l5.5 3" />
      <path d="M8 8L2.5 4.5" />
    </svg>
  )
}

// -- Misc --

export function IconPlus() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function IconClose() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16" width={12} height={12}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function IconEye() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  )
}

export function IconGrid() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <rect x="2" y="2" width="5" height="5" rx="0.5" />
      <rect x="9" y="2" width="5" height="5" rx="0.5" />
      <rect x="2" y="9" width="5" height="5" rx="0.5" />
      <rect x="9" y="9" width="5" height="5" rx="0.5" />
    </svg>
  )
}

export function IconPrefab() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <rect x="3" y="3" width="10" height="10" rx="2" />
      <path d="M6 3v10M10 3v10M3 6h10M3 10h10" />
    </svg>
  )
}

export function IconMagnet() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M4 2v6a4 4 0 0 0 8 0V2" />
      <path d="M4 2h2v3H4zM10 2h2v3h-2z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconGlobe() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c-2 2-2 10 0 12M8 2c2 2 2 10 0 12" />
    </svg>
  )
}

export function IconCube() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16">
      <path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7z" />
      <path d="M8 8l5.5-3M8 8L2.5 5M8 8v6.5" />
    </svg>
  )
}

export function IconChevronDown() {
  return (
    <svg {...svgProps} viewBox="0 0 16 16" width={10} height={10}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
