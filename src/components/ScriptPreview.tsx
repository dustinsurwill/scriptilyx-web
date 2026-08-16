import { useGraphStore } from '../store/graphStore'
import { useGeneratedScript } from '../hooks/useGeneratedScript'

// The programmable block's terminal rejects scripts over 100,000 chars.
const PB_CHAR_LIMIT = 100_000
const AMBER_THRESHOLD = 80_000
const RED_THRESHOLD = 95_000

function sizeColor(chars: number): string {
  if (chars > RED_THRESHOLD) return '#ef4444'
  if (chars > AMBER_THRESHOLD) return '#f59e0b'
  return '#22c55e'
}

export function ScriptPreview() {
  const detailedComments = useGraphStore((s) => s.detailedComments)
  const setDetailedComments = useGraphStore((s) => s.setDetailedComments)
  const minify = useGraphStore((s) => s.minify)
  const setMinify = useGraphStore((s) => s.setMinify)
  const { source, minified, displayed, warnings } = useGeneratedScript()

  return (
    <div
      style={{
        padding: 12,
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Script</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={detailedComments}
              onChange={(e) => setDetailedComments(e.target.checked)}
            />
            Detailed Comments
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={minify} onChange={(e) => setMinify(e.target.checked)} />
            Minify
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, margin: '0 0 8px', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: sizeColor(source.length) }}>
          Full: {source.length.toLocaleString()} / {PB_CHAR_LIMIT.toLocaleString()} chars
        </span>
        <span style={{ color: sizeColor(minified.length) }}>
          Minified: {minified.length.toLocaleString()} / {PB_CHAR_LIMIT.toLocaleString()} chars
        </span>
      </div>
      {warnings.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
          {warnings.map((w, i) => (
            <li key={i} style={{ fontSize: 11, color: '#f59e0b' }}>
              {w}
            </li>
          ))}
        </ul>
      )}
      <pre
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          margin: 0,
          fontSize: 11,
          lineHeight: 1.4,
          background: '#111827',
          padding: 8,
          borderRadius: 4,
        }}
      >
        <code>{displayed}</code>
      </pre>
    </div>
  )
}
