import type { NodeDefinition, ScriptNode } from '../types/graph'
import { useGraphStore } from '../store/graphStore'

interface PropertyPanelProps {
  scriptNode: ScriptNode | undefined
  definition: NodeDefinition | undefined
}

export function PropertyPanel({ scriptNode, definition }: PropertyPanelProps) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)

  if (!scriptNode) {
    return (
      <div style={{ padding: 12, opacity: 0.6, fontSize: 13 }}>
        Select a node to edit its properties.
      </div>
    )
  }

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>
        {scriptNode.Title} #{scriptNode.Number}
      </h2>
      {Object.entries(scriptNode.Properties).map(([key, value]) => {
        const propDef = definition?.Properties[key]
        const type = propDef?.Type ?? 'text'

        return (
          <label key={key} style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
            <div style={{ marginBottom: 4, opacity: 0.85 }}>{key}</div>
            {type === 'multiline' ? (
              <textarea
                value={value}
                onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                rows={5}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontFamily: key === 'Code' ? 'monospace' : 'inherit',
                }}
              />
            ) : type === 'combo' || type === 'bool' ? (
              <select
                value={value}
                onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              >
                {(propDef?.Options.length ? propDef.Options : ['true', 'false']).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}
