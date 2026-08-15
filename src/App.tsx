import { useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { nodeDefinitions } from './data/nodeLibrary'
import { NodePalette } from './components/NodePalette'
import { GraphCanvas } from './components/GraphCanvas'
import { PropertyPanel } from './components/PropertyPanel'
import { ValidationPanel } from './components/ValidationPanel'
import { useGraphStore } from './store/graphStore'
import { getGraphIssues } from './lib/graphIssues'

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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 300px', height: '100vh' }}>
      <div style={{ borderRight: '1px solid #374151', minHeight: 0 }}>
        <NodePalette nodeDefinitions={nodeDefinitions} onAddNode={handleAddNode} />
      </div>

      <div style={{ minWidth: 0 }}>
        <ReactFlowProvider>
          <GraphCanvas />
        </ReactFlowProvider>
      </div>

      <div
        style={{
          borderLeft: '1px solid #374151',
          display: 'grid',
          gridTemplateRows: '1fr 1fr',
          minHeight: 0,
        }}
      >
        <div style={{ borderBottom: '1px solid #374151', minHeight: 0 }}>
          <PropertyPanel scriptNode={selectedNode} definition={selectedDefinition} />
        </div>
        <div style={{ minHeight: 0 }}>
          <ValidationPanel issues={issues} />
        </div>
      </div>
    </div>
  )
}

export default App
