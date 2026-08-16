import { useEffect, useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { nodeDefinitions } from './data/nodeLibrary'
import { NodePalette } from './components/NodePalette'
import { GraphCanvas } from './components/GraphCanvas'
import { PropertyPanel } from './components/PropertyPanel'
import { ValidationPanel } from './components/ValidationPanel'
import { ScriptPreview } from './components/ScriptPreview'
import { ResizeHandle } from './components/ResizeHandle'
import { Toolbar } from './components/Toolbar'
import { useGraphStore } from './store/graphStore'
import { getGraphIssues } from './lib/graphIssues'
import { useDragResize } from './hooks/useDragResize'

/** Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Shift+Z) drive graph undo/redo — but only
 * when focus isn't inside a text field, where the browser's own native
 * undo for that field should win instead. */
function useUndoRedoShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey
      if (!ctrlOrCmd || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const { undo, redo } = useGraphStore.getState()
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

const definitionsById = new Map(nodeDefinitions.map((d) => [d.Id, d]))

function App() {
  const nodes = useGraphStore((s) => s.nodes)
  const connections = useGraphStore((s) => s.connections)
  const selection = useGraphStore((s) => s.selection)
  const addNode = useGraphStore((s) => s.addNode)

  const selectedNode = nodes.find((n) => n.Id === selection.nodeId)
  const selectedDefinition = selectedNode
    ? definitionsById.get(selectedNode.DefinitionId)
    : undefined

  const issues = useMemo(
    () => getGraphIssues({ nodes, connections, definitionsById }),
    [nodes, connections],
  )

  const handleAddNode = (definition: (typeof nodeDefinitions)[number]) => {
    const columns = 4
    const x = 60 + (nodes.length % columns) * 260
    const y = 60 + Math.floor(nodes.length / columns) * 200
    addNode(definition, { x, y })
  }

  const [leftWidth, onLeftHandleDown] = useDragResize(260, 'x', 180, 520)
  const [rightWidth, onRightHandleDown] = useDragResize(300, 'x', 220, 640, true)
  const [propertyHeight, onPropertyHandleDown] = useDragResize(220, 'y', 80, 640)
  const [validationHeight, onValidationHandleDown] = useDragResize(160, 'y', 60, 480)

  useUndoRedoShortcuts()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minWidth: 0 }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ width: leftWidth, flex: '0 0 auto', borderRight: '1px solid #374151', minHeight: 0 }}>
          <NodePalette nodeDefinitions={nodeDefinitions} onAddNode={handleAddNode} />
        </div>

        <ResizeHandle axis="x" onMouseDown={onLeftHandleDown} />

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <ReactFlowProvider>
            <GraphCanvas />
          </ReactFlowProvider>
        </div>

        <ResizeHandle axis="x" onMouseDown={onRightHandleDown} />

        <div
          style={{
            width: rightWidth,
            flex: '0 0 auto',
            borderLeft: '1px solid #374151',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ height: propertyHeight, flex: '0 0 auto', borderBottom: '1px solid #374151', minHeight: 0 }}>
            <PropertyPanel scriptNode={selectedNode} definition={selectedDefinition} />
          </div>
          <ResizeHandle axis="y" onMouseDown={onPropertyHandleDown} />
          <div style={{ height: validationHeight, flex: '0 0 auto', borderBottom: '1px solid #374151', minHeight: 0 }}>
            <ValidationPanel issues={issues} />
          </div>
          <ResizeHandle axis="y" onMouseDown={onValidationHandleDown} />
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
            <ScriptPreview nodes={nodes} connections={connections} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
