import { useCallback, useEffect, useRef, useState } from 'react'

import { COLORS } from './colors.ts'
import { Icon3D, IconAudio, IconData, IconFile, IconFolder, IconFont, IconImage, IconVideo } from './icons.tsx'
import { type AssetEntry, assetFileUrl, fetchAssets } from './scene-api.ts'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.bmp'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac'])

function getAssetIcon(entry: AssetEntry): React.ReactNode {
  if (entry.type === 'folder') return <IconFolder />
  if (!entry.ext) return <IconFile />
  if (IMAGE_EXTS.has(entry.ext) || entry.ext === '.ktx2' || entry.ext === '.hdr' || entry.ext === '.exr')
    return <IconImage />
  if (['.gltf', '.glb', '.fbx', '.obj'].includes(entry.ext)) return <Icon3D />
  if (AUDIO_EXTS.has(entry.ext)) return <IconAudio />
  if (['.mp4', '.webm'].includes(entry.ext)) return <IconVideo />
  if (['.json', '.xml'].includes(entry.ext)) return <IconData />
  if (['.ttf', '.otf', '.woff', '.woff2'].includes(entry.ext)) return <IconFont />
  return <IconFile />
}

function getIconColor(entry: AssetEntry): string {
  if (entry.type === 'folder') return '#d4a843'
  if (!entry.ext) return COLORS.textDim
  if (IMAGE_EXTS.has(entry.ext) || entry.ext === '.ktx2' || entry.ext === '.hdr' || entry.ext === '.exr') return '#4a9'
  if (['.gltf', '.glb', '.fbx', '.obj'].includes(entry.ext)) return '#a6e'
  if (AUDIO_EXTS.has(entry.ext)) return '#e94'
  if (['.mp4', '.webm'].includes(entry.ext)) return '#e55'
  if (['.json', '.xml'].includes(entry.ext)) return '#999'
  if (['.ttf', '.otf', '.woff', '.woff2'].includes(entry.ext)) return '#6ae'
  return COLORS.textDim
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Ktx2Preview({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false

    Promise.all([import('three/examples/jsm/loaders/KTX2Loader.js'), import('three/webgpu')]).then(
      ([{ KTX2Loader }, { Scene, Mesh, PlaneGeometry, MeshBasicMaterial, OrthographicCamera, WebGPURenderer }]) => {
        if (disposed) return

        const renderer = new WebGPURenderer({ canvas })
        renderer.setSize(128, 128)

        renderer.init().then(() => {
          if (disposed) {
            renderer.dispose()
            return
          }

          const ktx2 = new KTX2Loader()
          ktx2.setTranscoderPath('/__mana/basis/')
          ktx2.detectSupport(renderer)

          ktx2.load(
            url,
            texture => {
              if (disposed) {
                texture.dispose()
                renderer.dispose()
                return
              }
              const scene = new Scene()
              const camera = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10)
              camera.position.z = 1
              const plane = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: texture }))
              scene.add(plane)
              renderer.renderAsync(scene, camera).then(() => {
                texture.dispose()
                plane.geometry.dispose()
                ;(plane.material as InstanceType<typeof MeshBasicMaterial>).dispose()
                renderer.dispose()
              })
            },
            undefined,
            () => {
              if (!disposed) setError(true)
              renderer.dispose()
            },
          )
        })
      },
    )

    return () => {
      disposed = true
    }
  }, [url])

  if (error) {
    return <div style={{ color: COLORS.textMuted, fontSize: 10 }}>Failed to decode KTX2</div>
  }

  return <canvas ref={canvasRef} width={128} height={128} style={{ maxWidth: '100%', maxHeight: '100%' }} />
}

function AssetPreview({ filePath, ext, size }: { filePath: string; ext: string | null; size: number | null }) {
  const url = assetFileUrl(filePath)
  const fileName = filePath.split('/').pop() ?? filePath

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 4,
        padding: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {ext && IMAGE_EXTS.has(ext) && (
          <img
            src={url}
            alt={fileName}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 3,
              imageRendering: 'auto',
            }}
          />
        )}
        {ext === '.ktx2' && <Ktx2Preview url={url} />}
        {ext && AUDIO_EXTS.has(ext) && (
          <audio controls src={url} style={{ width: '100%', maxWidth: 140 }}>
            <track kind="captions" />
          </audio>
        )}
        {ext && !IMAGE_EXTS.has(ext) && ext !== '.ktx2' && !AUDIO_EXTS.has(ext) && (
          <div style={{ color: COLORS.textDim, fontSize: 10 }}>No preview</div>
        )}
      </div>

      <div style={{ fontSize: 10, color: COLORS.textMuted, textAlign: 'center', flexShrink: 0 }}>
        <div style={{ color: COLORS.text, fontSize: 10, marginBottom: 1, wordBreak: 'break-all' }}>{fileName}</div>
        {size != null && <div>{formatSize(size)}</div>}
      </div>
    </div>
  )
}

export function BottomPanel() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<AssetEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<AssetEntry | null>(null)

  const loadDir = useCallback((path: string) => {
    setLoading(true)
    setSelectedFile(null)
    setSelectedEntry(null)
    fetchAssets(path).then(data => {
      setEntries(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    loadDir('')
  }, [loadDir])

  const handleDoubleClick = useCallback(
    (entry: AssetEntry) => {
      if (entry.type === 'folder') {
        const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
        setCurrentPath(newPath)
        loadDir(newPath)
      }
    },
    [currentPath, loadDir],
  )

  const handleClick = useCallback(
    (entry: AssetEntry) => {
      if (entry.type === 'file') {
        const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name
        setSelectedFile(filePath)
        setSelectedEntry(entry)
      } else {
        setSelectedFile(null)
        setSelectedEntry(null)
      }
    },
    [currentPath],
  )

  const breadcrumbs = currentPath ? currentPath.split('/') : []

  const navigateTo = useCallback(
    (index: number) => {
      if (index < 0) {
        setCurrentPath('')
        loadDir('')
      } else {
        const segments = currentPath.split('/')
        const newPath = segments.slice(0, index + 1).join('/')
        setCurrentPath(newPath)
        loadDir(newPath)
      }
    },
    [currentPath, loadDir],
  )

  return (
    <div
      style={{
        height: 210,
        background: COLORS.panel,
        borderTop: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Breadcrumb bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 10px',
          fontSize: 10,
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.panelHeader,
          gap: 1,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: COLORS.textMuted,
            letterSpacing: '0.04em',
            marginRight: 6,
          }}
        >
          ASSETS
        </span>
        <button
          type="button"
          onClick={() => navigateTo(-1)}
          style={{
            background: 'none',
            border: 'none',
            color: currentPath ? COLORS.accent : COLORS.text,
            padding: '1px 2px',
            fontSize: 11,
            fontFamily: 'inherit',
          }}
        >
          assets
        </button>
        {breadcrumbs.map((segment, i) => (
          <span key={segment} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span style={{ color: COLORS.textDim }}>/</span>
            <button
              type="button"
              onClick={() => navigateTo(i)}
              style={{
                background: 'none',
                border: 'none',
                color: i < breadcrumbs.length - 1 ? COLORS.accent : COLORS.text,
                padding: '1px 2px',
                fontSize: 11,
                fontFamily: 'inherit',
              }}
            >
              {segment}
            </button>
          </span>
        ))}
      </div>

      {/* Main area: file list + preview */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '2px 0',
          }}
        >
          {loading ? (
            <div style={{ padding: '8px 10px', color: COLORS.textMuted, fontSize: 11 }}>Loading...</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: '8px 10px', color: COLORS.textMuted, fontSize: 11 }}>
              {currentPath ? 'Empty folder' : 'No assets yet. Create a game/assets/ directory to get started.'}
            </div>
          ) : (
            entries.map(entry => {
              const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name
              const isSelected = selectedFile === filePath
              return (
                <div
                  key={entry.name}
                  onClick={() => handleClick(entry)}
                  onDoubleClick={() => handleDoubleClick(entry)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px 10px',
                    fontSize: 11,
                    gap: 6,
                    background: isSelected ? COLORS.selected : 'transparent',
                    userSelect: 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.background = COLORS.hover
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span
                    style={{
                      color: getIconColor(entry),
                      display: 'flex',
                      flexShrink: 0,
                    }}
                  >
                    {getAssetIcon(entry)}
                  </span>
                  <span
                    style={{ color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {entry.name}
                  </span>
                  {entry.type === 'file' && entry.size != null && (
                    <span
                      style={{ color: COLORS.textDim, fontSize: 10, marginLeft: 'auto', paddingLeft: 8, flexShrink: 0 }}
                    >
                      {formatSize(entry.size)}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Preview panel */}
        {selectedFile && selectedEntry && (
          <div
            style={{
              width: 150,
              borderLeft: `1px solid ${COLORS.border}`,
              background: COLORS.panelHeader,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            <AssetPreview filePath={selectedFile} ext={selectedEntry.ext} size={selectedEntry.size} />
          </div>
        )}
      </div>

      {/* Status bar */}
      {selectedFile && (
        <div
          style={{
            padding: '2px 10px',
            fontSize: 10,
            color: COLORS.textMuted,
            borderTop: `1px solid ${COLORS.border}`,
            background: COLORS.panelHeader,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            assets/{selectedFile}
          </span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(`assets/${selectedFile}`)}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = COLORS.accent
              e.currentTarget.style.color = COLORS.text
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = COLORS.border
              e.currentTarget.style.color = COLORS.textMuted
            }}
            style={{
              background: 'none',
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textMuted,
              padding: '1px 6px',
              fontSize: 10,
              borderRadius: 3,
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            Copy path
          </button>
        </div>
      )}
    </div>
  )
}
