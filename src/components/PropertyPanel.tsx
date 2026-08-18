import { useEffect, useMemo, useState } from 'react'
import type { NodeDefinition, ScriptNode } from '../types/graph'
import { useGraphStore } from '../store/graphStoreContext'
import { buildVariableRegistry, type VarKind, type VariableRegistry } from '../lib/variableRegistry'
import { ItemPicker } from './ItemPicker'
import type { GameItem } from '../types/game'

const ALL_KINDS: VarKind[] = ['num', 'text', 'bool']

interface PropertyPanelProps {
  scriptNode: ScriptNode | undefined
  definition: NodeDefinition | undefined
  itemList?: GameItem[]
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
  'sorter.add_item:ItemId': 'The game only shows item names like "Iron Ore" — use Pick Item ID to look it up.',
  'sorter.remove_item:ItemId': 'The game only shows item names like "Iron Ore" — use Pick Item ID to look it up.',
  'sorter.if_allows_item:ItemId': 'The game only shows item names like "Iron Ore" — use Pick Item ID to look it up.',
  'ext.inventory.contains_item:ItemType':
    'The game only shows item names like "Iron Ore" — use Pick Item ID to look it up.',
  'ext.inventory.get_item_amount:ItemType':
    'The game only shows item names like "Iron Ore" — use Pick Item ID to look it up.',
  'ext.inventory.if_item_below:ItemType':
    'The game only shows item names like "Iron Ore" — use Pick Item ID to look it up.',
}

/** ItemId/ItemType fields (conveyor sorter filters, inventory checks) hold
 * a MyObjectBuilder_TypeId/SubtypeId string a player never sees in-game —
 * see src/data/inventoryItems.ts. Checked by property key alone: these are
 * the only two property names used for this shape anywhere in the node
 * library (verified against NodeLibrary.json). */
function isItemIdField(key: string): boolean {
  return key === 'ItemId' || key === 'ItemType'
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
 * alongside literal text. `kinds` restricts the list to types the field
 * can actually use — a combo/bool field can only take a bool variable, a
 * number field only a num variable, so showing the other kinds there
 * would just be an option that's guaranteed to be a type error once
 * generated; append-mode text fields accept all three (a template string
 * can embed a number/bool/text variable's value equally well). */
function VariablePicker({
  registry,
  mode,
  kinds = ALL_KINDS,
  onInsert,
}: {
  registry: VariableRegistry
  mode: 'replace' | 'append'
  kinds?: VarKind[]
  onInsert: (token: string) => void
}) {
  const hasAny = kinds.some((kind) => registry.namesByKind[kind].length > 0)
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
      {kinds.map(
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

export function PropertyPanel({ scriptNode, definition, itemList }: PropertyPanelProps) {
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
        const options = propDef?.Options.length ? propDef.Options : ['true', 'false']
        // Only a true boolean combo (exactly true/false) goes through
        // resolvableBool at codegen time — an enum-style combo (Operator,
        // Direction, State, ...) is read as a raw literal and compared
        // against known option strings, so a "{name}" reference there
        // wouldn't resolve to anything: it would just silently fail to
        // match and fall back to that emitter's default. Only offer the
        // variable-reference escape hatch where it can actually work.
        const isBooleanCombo = options.length === 2 && options.includes('true') && options.includes('false')

        return (
          <label key={key} style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
            <div style={{ marginBottom: 4, opacity: 0.85 }}>{key}</div>
            {help && (
              <div style={{ marginBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>{help}</div>
            )}
            {isItemIdField(key) && itemList ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  value={value}
                  onFocus={checkpoint}
                  onChange={(e) => updateNodeProperty(scriptNode.Id, key, e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <ItemPicker items={itemList} onPick={(id) => updateNodeProperty(scriptNode.Id, key, id)} />
              </div>
            ) : type === 'multiline' || (type === 'text' && help) ? (
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
              isBooleanCombo && (manualKeys.has(key) || isVariableReference(value)) ? (
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
                    kinds={['bool']}
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
                      if (isVariableReference(value)) updateNodeProperty(scriptNode.Id, key, options[0])
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
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  {isBooleanCombo && (
                    <button
                      type="button"
                      title="Use a variable instead of a fixed value"
                      onClick={() => setManualKeys((prev) => new Set(prev).add(key))}
                      style={{ flex: '0 0 auto' }}
                    >
                      {'{ }'}
                    </button>
                  )}
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
                  kinds={['num']}
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
