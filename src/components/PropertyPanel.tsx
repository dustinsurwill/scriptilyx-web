import { useEffect, useMemo, useState } from 'react'
import type { NodeDefinition, ScriptNode } from '../types/graph'
import { useGraphStore } from '../store/graphStore'
import { buildVariableRegistry, type VariableRegistry } from '../lib/variableRegistry'

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
    'Insert a variable’s value with {name} — picks up its declared type automatically. Use {text:name}/{bool:name}/{num:name} only to override, or for a variable not declared anywhere else yet.',
  'block.set_lcd_text:Text': 'Insert a variable’s value with {name}. See the Echo node for details.',
  'block.set_lcd_group_text:Text': 'Insert a variable’s value with {name}. See the Echo node for details.',
  'ext.lcd.append:Text': 'Insert a variable’s value with {name}. See the Echo node for details.',
  'ext.lcd.group_append:Text': 'Insert a variable’s value with {name}. See the Echo node for details.',
  'var.calculate:Formula':
    'Number-variable names and arithmetic only: + - * / ( ). Supported functions: sqrt, abs, min, max, floor, ceil, round, sin, cos, tan, pow. Example: "a + sqrt(b) * 2".',
}

/** True for a value like "{myFlag}" or "{bool:myFlag}" — a whole-value
 * variable reference, same interpolation syntax as Echo/LCD text, applied
 * to a combo/number property instead of a string template. See
 * resolvableBool/resolvableNumber in src/lib/codegen/factories.ts. */
function isVariableReference(value: string): boolean {
  return /^\{[^{}]+\}$/.test(value.trim())
}

const KIND_LABEL: Record<'num' | 'text' | 'bool', string> = { num: 'Number', text: 'Text', bool: 'Bool' }

/** A dropdown of every variable the graph-wide registry already knows
 * about (see src/lib/variableRegistry.ts), grouped by declared type.
 * Picking one inserts a plain "{name}" — no kind prefix needed, since the
 * registry is exactly what lets that prefix be dropped. `mode: 'replace'`
 * is for whole-value reference fields (Enabled, Percent, ...); `'append'`
 * is for template-string fields (Echo/LCD Text) where the reference sits
 * alongside literal text. */
function VariablePicker({
  registry,
  mode,
  onInsert,
}: {
  registry: VariableRegistry
  mode: 'replace' | 'append'
  onInsert: (token: string) => void
}) {
  const hasAny = registry.namesByKind.num.length + registry.namesByKind.text.length + registry.namesByKind.bool.length > 0
  if (!hasAny) return null
  return (
    <select
      value=""
      title={mode === 'replace' ? 'Use this variable instead of a fixed value' : 'Insert a reference to this variable'}
      onChange={(e) => {
        if (e.target.value) onInsert(`{${e.target.value}}`)
      }}
      style={{ flex: '0 0 auto', maxWidth: 120 }}
    >
      <option value="">{mode === 'replace' ? 'Variable…' : 'Insert…'}</option>
      {(['num', 'text', 'bool'] as const).map(
        (kind) =>
          registry.namesByKind[kind].length > 0 && (
            <optgroup key={kind} label={KIND_LABEL[kind]}>
              {registry.namesByKind[kind].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ),
      )}
    </select>
  )
}

export function PropertyPanel({ scriptNode, definition }: PropertyPanelProps) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const checkpoint = useGraphStore((s) => s.checkpoint)
  const allNodes = useGraphStore((s) => s.nodes)
  const registry = useMemo(() => buildVariableRegistry(allNodes), [allNodes])
  // Combo/bool properties normally render as a fixed <select>; a key in
  // this set is manually switched to a text input so its value can be a
  // {name}/{bool:name} variable reference instead of a literal option.
  // Reset whenever the selected node changes so it doesn't leak onto an
  // unrelated node that happens to share a property key.
  const [manualKeys, setManualKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    setManualKeys(new Set())
  }, [scriptNode?.Id])

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
            {type === 'multiline' || (type === 'text' && help) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {type === 'multiline' ? (
                  <textarea
                    value={value}
                    onFocus={checkpoint}
                    onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                    rows={5}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontFamily: key === 'Code' ? 'monospace' : 'inherit',
                    }}
                  />
                ) : (
                  <input
                    type="text"
                    value={value}
                    onFocus={checkpoint}
                    onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                )}
                <VariablePicker
                  registry={registry}
                  mode="append"
                  onInsert={(token) => updateNodeProperty(scriptNode.Id, key, value ? `${value} ${token}` : token)}
                />
              </div>
            ) : type === 'combo' || type === 'bool' ? (
              manualKeys.has(key) || isVariableReference(value) ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="text"
                    value={value}
                    placeholder="{myVar}"
                    onFocus={checkpoint}
                    onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                  <VariablePicker
                    registry={registry}
                    mode="replace"
                    onInsert={(token) => updateNodeProperty(scriptNode.Id, key, token)}
                  />
                  <button
                    type="button"
                    title="Switch back to a fixed value"
                    onClick={() => {
                      setManualKeys((prev) => {
                        const next = new Set(prev)
                        next.delete(key)
                        return next
                      })
                      const fallback = propDef?.Options[0] ?? 'true'
                      if (isVariableReference(value)) updateNodeProperty(scriptNode.Id, key, fallback)
                    }}
                    style={{ flex: '0 0 auto' }}
                  >
                    Fixed
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 4 }}>
                  <select
                    value={value}
                    onFocus={checkpoint}
                    onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    {(propDef?.Options.length ? propDef.Options : ['true', 'false']).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title="Use a variable instead of a fixed value"
                    onClick={() => setManualKeys((prev) => new Set(prev).add(key))}
                    style={{ flex: '0 0 auto' }}
                  >
                    {'{ }'}
                  </button>
                </div>
              )
            ) : type === 'number' ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  value={value}
                  onFocus={checkpoint}
                  onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <VariablePicker
                  registry={registry}
                  mode="replace"
                  onInsert={(token) => updateNodeProperty(scriptNode.Id, key, token)}
                />
              </div>
            ) : (
              <input
                type="text"
                value={value}
                onFocus={checkpoint}
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
