import { useEffect, useState } from 'react'
import type { GameWizard } from '../types/game'

/** Fill-in-the-blanks form for a WizardTemplate — opened by WizardsMenu
 * before building the graph, so the handful of block/group names and
 * timings a wizard needs come from the player's own grid instead of
 * shipping placeholder names they'd have to hunt down and edit node by
 * node afterward. Pure form state; doesn't touch the graph store itself —
 * the caller gets the collected values back via onSubmit. */
export function WizardModal({
  wizard,
  onCancel,
  onSubmit,
}: {
  wizard: GameWizard
  onCancel: () => void
  onSubmit: (values: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(wizard.parameters.map((p) => [p.id, p.default])),
  )

  useEffect(() => {
    setValues(Object.fromEntries(wizard.parameters.map((p) => [p.id, p.default])))
  }, [wizard])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(values)
        }}
        style={{
          background: '#111827',
          border: '1px solid #374151',
          borderRadius: 6,
          padding: 16,
          width: 360,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}
      >
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>{wizard.title}</h2>
        <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 14px', lineHeight: 1.4 }}>{wizard.description}</p>
        {wizard.parameters.map((param) => (
          <label key={param.id} style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
            <div style={{ marginBottom: 4, opacity: 0.85 }}>{param.label}</div>
            {param.type === 'combo' ? (
              <select
                value={values[param.id]}
                onChange={(e) => setValues((prev) => ({ ...prev, [param.id]: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }}
              >
                {param.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={param.type === 'number' ? 'number' : 'text'}
                value={values[param.id]}
                onChange={(e) => setValues((prev) => ({ ...prev, [param.id]: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            )}
          </label>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: 12,
              padding: '5px 12px',
              background: 'transparent',
              border: '1px solid #374151',
              borderRadius: 4,
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              fontSize: 12,
              padding: '5px 12px',
              background: '#2563eb',
              border: '1px solid #2563eb',
              borderRadius: 4,
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
