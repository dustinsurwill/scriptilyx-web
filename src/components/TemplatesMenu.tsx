import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { NodeDefinition } from '../types/graph'
import type { GameTemplate } from '../types/game'
import { useGraphStore } from '../store/graphStoreContext'

const buttonStyle: CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 4,
  color: 'inherit',
  cursor: 'pointer',
}

/** Toolbar dropdown listing the active game's pre-built scenario graphs,
 * grouped by tier (in first-seen order). Loading one replaces the whole
 * graph (same confirm-if-non-empty guard as Toolbar's Clear button), as
 * one undoable step via loadGraph. */
export function TemplatesMenu({
  templates,
  definitionsById,
}: {
  templates: GameTemplate[]
  definitionsById: Map<string, NodeDefinition>
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodes = useGraphStore((s) => s.nodes)
  const connections = useGraphStore((s) => s.connections)
  const loadGraph = useGraphStore((s) => s.loadGraph)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const tiers = [...new Set(templates.map((t) => t.tier))]

  const handlePick = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return
    if (
      (nodes.length > 0 || connections.length > 0) &&
      !confirm(`Load "${template.title}"? This replaces the current graph (still available via Undo).`)
    ) {
      return
    }
    loadGraph(template.build(definitionsById))
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button style={buttonStyle} onClick={() => setOpen((v) => !v)} title="Load a pre-built example scenario">
        Templates
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: 4,
            padding: 6,
            width: 280,
            zIndex: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {tiers.map((tier) => {
            const inTier = templates.filter((t) => t.tier === tier)
            if (inTier.length === 0) return null
            return (
              <div key={tier} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', margin: '4px 4px' }}>
                  {tier}
                </div>
                {inTier.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handlePick(template.id)}
                    title={template.description}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      fontSize: 12,
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {template.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
