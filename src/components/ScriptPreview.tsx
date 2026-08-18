import { useGraphStore } from '../store/graphStoreContext'
import { useGeneratedScript } from '../hooks/useGeneratedScript'
import type { Game } from '../types/game'

function tierColor(value: number, amberAt: number, redAt: number): string {
  if (value > redAt) return '#ef4444'
  if (value > amberAt) return '#f59e0b'
  return '#22c55e'
}

export function ScriptPreview({ game }: { game: Game }) {
  const detailedComments = useGraphStore((s) => s.detailedComments)
  const setDetailedComments = useGraphStore((s) => s.setDetailedComments)
  const minify = useGraphStore((s) => s.minify)
  const setMinify = useGraphStore((s) => s.setMinify)
  const { source, minified, displayed, warnings } = useGeneratedScript(game)

  const lines = source.split('\n')
  const longestLine = lines.reduce((max, l) => Math.max(max, l.length), 0)

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
          {game.minify && (
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={minify} onChange={(e) => setMinify(e.target.checked)} />
              Minify
            </label>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, margin: '0 0 8px', fontVariantNumeric: 'tabular-nums' }}>
        {game.charLimit && (
          <>
            <span style={{ color: tierColor(source.length, game.charLimit.amberAt, game.charLimit.redAt) }}>
              Full: {source.length.toLocaleString()} / {game.charLimit.max.toLocaleString()} chars
            </span>
            {game.minify && (
              <span style={{ color: tierColor(minified.length, game.charLimit.amberAt, game.charLimit.redAt) }}>
                Minified: {minified.length.toLocaleString()} / {game.charLimit.max.toLocaleString()} chars
              </span>
            )}
          </>
        )}
        {game.lineLimit && (
          <>
            <span
              style={{
                color: tierColor(
                  lines.length,
                  Math.floor(game.lineLimit.maxLines * 0.9),
                  game.lineLimit.maxLines,
                ),
              }}
            >
              Lines: {lines.length} / {game.lineLimit.maxLines}
            </span>
            <span
              style={{
                color: tierColor(
                  longestLine,
                  Math.floor(game.lineLimit.maxLineLength * 0.9),
                  game.lineLimit.maxLineLength,
                ),
              }}
            >
              Longest line: {longestLine} / {game.lineLimit.maxLineLength} chars
            </span>
          </>
        )}
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
