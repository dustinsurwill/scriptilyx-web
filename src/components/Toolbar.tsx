import { useRef } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import type { GraphSaveData } from '../types/graph'
import { useGraphStore } from '../store/graphStore'

const SAVE_FILENAME = 'script.segraph'

const buttonStyle: CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 4,
  color: 'inherit',
  cursor: 'pointer',
}

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  opacity: 0.4,
  cursor: 'default',
}

export function Toolbar() {
  const nodes = useGraphStore((s) => s.nodes)
  const connections = useGraphStore((s) => s.connections)
  const nextNodeNumber = useGraphStore((s) => s.nextNodeNumber)
  const canUndo = useGraphStore((s) => s.past.length > 0)
  const canRedo = useGraphStore((s) => s.future.length > 0)
  const undo = useGraphStore((s) => s.undo)
  const redo = useGraphStore((s) => s.redo)
  const loadGraph = useGraphStore((s) => s.loadGraph)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    const data: GraphSaveData = { Nodes: nodes, Connections: connections, NextNodeNumber: nextNodeNumber, Zoom: 1 }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = SAVE_FILENAME
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleOpenClick = () => fileInputRef.current?.click()

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as GraphSaveData
      if (!Array.isArray(data.Nodes) || !Array.isArray(data.Connections)) {
        throw new Error('Missing Nodes/Connections array')
      }
      loadGraph(data)
    } catch (err) {
      alert(`Couldn't open "${file.name}": ${err instanceof Error ? err.message : 'invalid file'}`)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderBottom: '1px solid #374151',
        flex: '0 0 auto',
      }}
    >
      <button style={canUndo ? buttonStyle : disabledButtonStyle} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button style={canRedo ? buttonStyle : disabledButtonStyle} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        Redo
      </button>
      <span style={{ width: 1, alignSelf: 'stretch', background: '#374151' }} />
      <button style={buttonStyle} onClick={handleSave} title="Download the graph as a .segraph file">
        Save
      </button>
      <button style={buttonStyle} onClick={handleOpenClick} title="Load a graph from a .segraph/.json file">
        Open
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".segraph,.json,application/json"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
    </div>
  )
}
