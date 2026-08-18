import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import type { GraphSaveData } from '../types/graph'
import type { Game } from '../types/game'
import { useGraphStore } from '../store/GraphStoreContext'
import { useGeneratedScript } from '../hooks/useGeneratedScript'
import { TemplatesMenu } from './TemplatesMenu'
import { WizardsMenu } from './WizardsMenu'

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

export function Toolbar({ game }: { game: Game }) {
  const nodes = useGraphStore((s) => s.nodes)
  const connections = useGraphStore((s) => s.connections)
  const nextNodeNumber = useGraphStore((s) => s.nextNodeNumber)
  const canUndo = useGraphStore((s) => s.past.length > 0)
  const canRedo = useGraphStore((s) => s.future.length > 0)
  const undo = useGraphStore((s) => s.undo)
  const redo = useGraphStore((s) => s.redo)
  const loadGraph = useGraphStore((s) => s.loadGraph)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { displayed } = useGeneratedScript(game)
  const [copied, setCopied] = useState(false)

  const definitionsById = useMemo(
    () => new Map(game.nodeDefinitions.map((d) => [d.Id, d])),
    [game],
  )

  const saveFilename = `script${game.saveFileExtension}`
  const scriptFilename = `Script${game.fileExtension}`

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(displayed)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleExportScript = () => {
    const blob = new Blob([displayed], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = scriptFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = () => {
    const data: GraphSaveData = { Nodes: nodes, Connections: connections, NextNodeNumber: nextNodeNumber, Zoom: 1 }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = saveFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleOpenClick = () => fileInputRef.current?.click()

  const handleClear = () => {
    if (nodes.length === 0 && connections.length === 0) return
    if (!confirm('Clear the entire graph? This also overwrites the autosave, but you can still Ctrl+Z it back.')) return
    loadGraph({ Nodes: [], Connections: [], NextNodeNumber: 1, Zoom: 1 })
  }

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
      loadGraph(game.remapLegacyGraph ? game.remapLegacyGraph(data) : data)
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
      <button style={buttonStyle} onClick={handleSave} title={`Download the graph as a ${saveFilename} file`}>
        Save
      </button>
      <button style={buttonStyle} onClick={handleOpenClick} title={`Load a graph from a ${game.saveFileExtension}/.json file`}>
        Open
      </button>
      {game.templates && game.templates.length > 0 && (
        <TemplatesMenu templates={game.templates} definitionsById={definitionsById} />
      )}
      {game.wizards && game.wizards.length > 0 && (
        <WizardsMenu wizards={game.wizards} definitionsById={definitionsById} />
      )}
      <button
        style={nodes.length === 0 && connections.length === 0 ? disabledButtonStyle : buttonStyle}
        onClick={handleClear}
        disabled={nodes.length === 0 && connections.length === 0}
        title="Clear the graph (and its autosave) and start over"
      >
        Clear
      </button>
      <span style={{ width: 1, alignSelf: 'stretch', background: '#374151' }} />
      <button style={buttonStyle} onClick={handleCopyScript} title="Copy the script shown below to the clipboard">
        {copied ? 'Copied!' : 'Copy Script'}
      </button>
      <button style={buttonStyle} onClick={handleExportScript} title={`Download the script shown below as a ${game.fileExtension} file`}>
        Export Script
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={`${game.saveFileExtension},.json,application/json`}
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
    </div>
  )
}
