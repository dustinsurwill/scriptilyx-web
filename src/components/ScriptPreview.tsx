import { useMemo, useState } from 'react'
import type { NodeConnection, ScriptNode } from '../types/graph'
import { generateScript } from '../lib/codegen'

interface ScriptPreviewProps {
  nodes: ScriptNode[]
  connections: NodeConnection[]
}

export function ScriptPreview({ nodes, connections }: ScriptPreviewProps) {
  const [professionalComments, setProfessionalComments] = useState(false)

  const { source, warnings } = useMemo(
    () => generateScript(nodes, connections, { professionalComments }),
    [nodes, connections, professionalComments],
  )

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
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Script</h2>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={professionalComments}
            onChange={(e) => setProfessionalComments(e.target.checked)}
          />
          Header comment
        </label>
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
          overflow: 'auto',
          margin: 0,
          fontSize: 11,
          lineHeight: 1.4,
          background: '#111827',
          padding: 8,
          borderRadius: 4,
        }}
      >
        <code>{source}</code>
      </pre>
    </div>
  )
}
