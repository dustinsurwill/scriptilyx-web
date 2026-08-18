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

/** Generic searchable/grouped-by-category picker popover for a free-text
 * field backed by a suggestion list — originally built for Space
 * Engineers' ItemId/ItemType fields (players see a display name in-game,
 * "Iron Ore", never the MyObjectBuilder_Ore/Iron-shaped id the field
 * actually stores; see src/games/space-engineers/inventoryItems.ts) and
 * reused as-is for Stationeers IC10's LogicType suggestions (see
 * src/games/ic10/deviceLogicTypes.ts) — same shape, different data. The
 * field stays plain free text underneath in both cases; this is a
 * convenience, not a closed dropdown, since neither list is exhaustive. */
export function ItemPicker({
  items,
  onPick,
  label = 'Pick Item ID',
  title = 'Pick an item by its in-game name instead of typing its id',
}: {
  items: GameItem[]
  onPick: (id: string) => void
  label?: string
  title?: string
}) {
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
        title={title}
      >
        {label}
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
