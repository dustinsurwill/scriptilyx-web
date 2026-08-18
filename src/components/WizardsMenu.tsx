import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { nodeDefinitions } from '../data/nodeLibrary'
import { buildWizardGraph, wizardTemplates } from '../data/wizardTemplates'
import type { WizardTemplate } from '../data/wizardTemplates'
import { useGraphStore } from '../store/graphStore'
import { WizardModal } from './WizardModal'

const definitionsById = new Map(nodeDefinitions.map((d) => [d.Id, d]))

const buttonStyle: CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 4,
  color: 'inherit',
  cursor: 'pointer',
}

/** Toolbar dropdown listing the practical, ready-to-use scripts in
 * src/data/wizardTemplates.ts. Deliberately separate from TemplatesMenu:
 * picking one opens a short form (WizardModal) to fill in the player's own
 * block/group names first, then builds and loads the graph — vs.
 * Templates, which load a fixed example graph immediately. */
export function WizardsMenu() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<WizardTemplate | null>(null)
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

  const handleSubmit = (values: Record<string, string>) => {
    if (!active) return
    if (
      (nodes.length > 0 || connections.length > 0) &&
      !confirm(`Create "${active.title}"? This replaces the current graph (still available via Undo).`)
    ) {
      return
    }
    loadGraph(buildWizardGraph(active, values, definitionsById))
    setActive(null)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button style={buttonStyle} onClick={() => setOpen((v) => !v)} title="Build a ready-to-use script from a short form">
        Wizards
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
          {wizardTemplates.map((wizard) => (
            <button
              key={wizard.id}
              onClick={() => {
                setActive(wizard)
                setOpen(false)
              }}
              title={wizard.description}
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
              {wizard.title}
            </button>
          ))}
        </div>
      )}
      {active && <WizardModal wizard={active} onCancel={() => setActive(null)} onSubmit={handleSubmit} />}
    </div>
  )
}
