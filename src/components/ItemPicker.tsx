import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { GameItem } from '../types/game'

const buttonStyle: CSSProperties = {
  fontSize: 12,
  padding: '4px 8px',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 4,
  color: 'inherit',
  cursor: 'pointer',
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
}

/** "Pick Item ID" popover for ItemId/ItemType text fields (conveyor sorter
 * filters, inventory checks) — referenced by name in NodeLibrary.json's
 * own Description text for the sorter nodes ("Use the Pick Item ID button
 * ... to choose from a searchable item list"). Players see a display name
 * in-game ("Iron Ore"), never the MyObjectBuilder_Ore/Iron-shaped id the
 * field actually stores, so this searches src/data/inventoryItems.ts by
 * name and inserts the id on pick. The field stays plain free text
 * underneath — this is a convenience, not a closed dropdown, since the
 * curated list isn't exhaustive and can't know about modded items. */
export function ItemPicker({ items, onPick }: { items: GameItem[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
      : items
    const byCategory = new Map<string, GameItem[]>()
    for (const item of matches) {
      if (!byCategory.has(item.category)) byCategory.set(item.category, [])
      byCategory.get(item.category)!.push(item)
    }
    return byCategory
  }, [items, query])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => setOpen((v) => !v)}
        title="Pick an item by its in-game name instead of typing its id"
      >
        Pick Item ID
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: 4,
            padding: 6,
            width: 240,
            maxHeight: 280,
            overflowY: 'auto',
            zIndex: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 6, fontSize: 12 }}
          />
          {filtered.size === 0 && <div style={{ fontSize: 12, opacity: 0.6, padding: '4px 2px' }}>No matches.</div>}
          {Array.from(filtered.entries()).map(([category, items]) => (
            <div key={category} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', margin: '4px 2px' }}>
                {category}
              </div>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.id}
                  onClick={() => {
                    onPick(item.id)
                    setOpen(false)
                    setQuery('')
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 12,
                    padding: '5px 6px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
