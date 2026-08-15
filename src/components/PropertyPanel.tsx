import type { NodeDefinition, ScriptNode } from '../types/graph'
import { useGraphStore } from '../store/graphStore'

interface PropertyPanelProps {
  scriptNode: ScriptNode | undefined
  definition: NodeDefinition | undefined
}

/** Extra usage notes for properties whose syntax isn't self-explanatory
 * from the node's own Description — keyed by "<node-library Id>:<property
 * key>" so generic and extended nodes that share a property name (both
 * called "Text", say) don't collide. */
const PROPERTY_HELP: Record<string, string> = {
  'logic.echo:Text':
    'Insert a variable’s value with {name}. Defaults to a number variable; use {text:name} or {bool:name} to read a text or bool variable instead.',
  'block.set_lcd_text:Text': 'Insert a variable’s value with {name} (or {text:name} / {bool:name}). See the Echo node for details.',
  'block.set_lcd_group_text:Text': 'Insert a variable’s value with {name} (or {text:name} / {bool:name}). See the Echo node for details.',
  'ext.lcd.append:Text': 'Insert a variable’s value with {name} (or {text:name} / {bool:name}). See the Echo node for details.',
  'ext.lcd.group_append:Text': 'Insert a variable’s value with {name} (or {text:name} / {bool:name}). See the Echo node for details.',
  'var.calculate:Formula':
    'Number-variable names and arithmetic only: + - * / ( ). Supported functions: sqrt, abs, min, max, floor, ceil, round, sin, cos, tan, pow. Example: "a + sqrt(b) * 2".',
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
      {definition?.Description && (
        <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 12px', lineHeight: 1.4 }}>{definition.Description}</p>
      )}
      {Object.entries(scriptNode.Properties).map(([key, value]) => {
        const propDef = definition?.Properties[key]
        const type = propDef?.Type ?? 'text'
        const help = definition ? PROPERTY_HELP[`${definition.Id}:${key}`] : undefined

        return (
          <label key={key} style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
            <div style={{ marginBottom: 4, opacity: 0.85 }}>{key}</div>
            {help && (
              <div style={{ marginBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>{help}</div>
            )}
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
