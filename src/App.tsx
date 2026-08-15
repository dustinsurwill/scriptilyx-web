import { ReactFlow, Background, Controls, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const placeholderNodes: Node[] = [
  {
    id: 'start',
    position: { x: 0, y: 0 },
    data: { label: 'Start' },
  },
  {
    id: 'placeholder',
    position: { x: 250, y: 80 },
    data: { label: 'Scriptilyx Web — editor coming next' },
  },
]

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow nodes={placeholderNodes} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

export default App
