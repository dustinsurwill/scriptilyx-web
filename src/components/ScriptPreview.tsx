import { useMemo, useState } from 'react'
import type { NodeConnection, ScriptNode } from '../types/graph'
import { generateScript, minifySource } from '../lib/codegen'

const buttonStyle = {
  fontSize: 11,
  padding: '3px 8px',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 4,
  color: 'inherit',
  cursor: 'pointer',
} as const

interface ScriptPreviewProps {
  nodes: ScriptNode[]
  connections: NodeConnection[]
}

// The programmable block's terminal rejects scripts over 100,000 chars.
const PB_CHAR_LIMIT = 100_000
const AMBER_THRESHOLD = 80_000
const RED_THRESHOLD = 95_000

function sizeColor(chars: number): string {
  if (chars > RED_THRESHOLD) return '#ef4444'
  if (chars > AMBER_THRESHOLD) return '#f59e0b'
  return '#22c55e'
}

export function ScriptPreview({ nodes, connections }: ScriptPreviewProps) {
  const [professionalComments, setProfessionalComments] = useState(false)
  const [minify, setMinify] = useState(false)
  const [copied, setCopied] = useState(false)

  const { source, warnings } = useMemo(
    () => generateScript(nodes, connections, { professionalComments }),
    [nodes, connections, professionalComments],
  )
  const minified = useMemo(() => minifySource(source), [source])
  const displayed = minify ? minified : source

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayed)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleExport = () => {
    const blob = new Blob([displayed], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Script.cs'
    a.click()
    URL.revokeObjectURL(url)
  }

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
              checked={professionalComments}
              onChange={(e) => setProfessionalComments(e.target.checked)}
            />
            Header comment
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={minify} onChange={(e) => setMinify(e.target.checked)} />
            Minify
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '0 0 8px' }}>
        <button style={buttonStyle} onClick={handleCopy} title="Copy the script shown below to the clipboard">
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button style={buttonStyle} onClick={handleExport} title="Download the script shown below as a .cs file">
          Export .cs
        </button>
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
