import { useMemo, useState } from 'react'
import type { NodeDefinition } from '../types/graph'

interface NodePaletteProps {
  nodeDefinitions: NodeDefinition[]
  onAddNode: (definition: NodeDefinition) => void
}

function matchesQuery(node: NodeDefinition, query: string): boolean {
  const q = query.toLowerCase()
  return (
    node.Title.toLowerCase().includes(q) ||
    node.Category.toLowerCase().includes(q) ||
    node.Search.toLowerCase().includes(q) ||
    node.ActionType.toLowerCase().includes(q)
  )
}

/** Roughly most- to least-likely to be reached for while building a script:
 * control flow and generic building blocks first, single-purpose/DLC-block
 * categories last. Unlisted categories sort after all of these. */
const CATEGORY_PRIORITY = [
  '🧠 Logic',
  '🔢 Variables',
  '✅ Checks',
  '🔲 Blocks / Groups',
  '🧩 All Blocks / Generic',
  '🔘 Buttons / Arguments',
  '🚪 Doors / Lights / LCD / Connectors',
  '⚡ Power / Air / Utility',
  '📦 Sections / Subroutines',
  '🚀 Flight / Thrusters / Gyros',
  '⚙ Mechanical',
  '🏭 Production / Tools',
  '🛞 Wheels / Suspension',
  '📦 Conveyor Sorter',
  '🤖 AI Blocks',
  '🛰 Event Controller',
]

function categoryRank(category: string): number {
  const i = CATEGORY_PRIORITY.indexOf(category)
  return i === -1 ? CATEGORY_PRIORITY.length : i
}

export function NodePalette({ nodeDefinitions, onAddNode }: NodePaletteProps) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(nodeDefinitions.map((n) => n.Category)),
  )

  const grouped = useMemo(() => {
    const filtered = query.trim()
      ? nodeDefinitions.filter((n) => matchesQuery(n, query))
      : nodeDefinitions

    const byCategory = new Map<string, NodeDefinition[]>()
    for (const node of filtered) {
      const list = byCategory.get(node.Category) ?? []
      list.push(node)
      byCategory.set(node.Category, list)
    }
    for (const list of byCategory.values()) {
      list.sort((a, b) => a.Title.localeCompare(b.Title))
    }
    return [...byCategory.entries()].sort(
      (a, b) => categoryRank(a[0]) - categoryRank(b[0]) || a[0].localeCompare(b[0]),
    )
  }, [nodeDefinitions, query])

  const totalShown = grouped.reduce((sum, [, nodes]) => sum + nodes.length, 0)
  const searching = query.trim() !== ''

  const toggleCategory = (category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px' }}>
        <h1 style={{ fontSize: '18px', margin: '0 0 8px' }}>Scriptilyx Web</h1>
        <input
          type="text"
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box' }}
        />
        <p style={{ fontSize: '12px', opacity: 0.7, margin: '8px 0 0' }}>
          {totalShown} / {nodeDefinitions.length} nodes
        </p>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {grouped.map(([category, nodes]) => {
          const open = searching || !collapsed.has(category)
          return (
            <section key={category} style={{ marginBottom: '16px' }}>
              <h2
                onClick={() => toggleCategory(category)}
                style={{
                  fontSize: '13px',
                  opacity: 0.8,
                  margin: '0 0 4px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ display: 'inline-block', width: '1em' }}>{open ? '▾' : '▸'}</span>
                {category} ({nodes.length})
              </h2>
              {open && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {nodes.map((node) => (
                    <li
                      key={node.Id}
                      data-testid="node-palette-item"
                      title={node.Description}
                      onClick={() => onAddNode(node)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      {node.Title}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
