import { nodeDefinitions } from './data/nodeLibrary'
import { NodePalette } from './components/NodePalette'

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <NodePalette nodeDefinitions={nodeDefinitions} />
    </div>
  )
}

export default App
