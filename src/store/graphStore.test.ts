import { beforeEach, describe, expect, it } from 'vitest'
import { useGraphStore } from './graphStore'
import type { GraphSaveData, NodeDefinition } from '../types/graph'

const START_DEF: NodeDefinition = {
  Id: 'logic.start',
  Category: 'Logic',
  Title: 'Start',
  Description: 'Script starts here',
  Search: 'start',
  ActionType: 'Start',
  InputPorts: [],
  OutputPorts: ['Next'],
  Properties: {},
  Preview: '',
}

const ECHO_DEF: NodeDefinition = {
  Id: 'logic.echo',
  Category: 'Logic',
  Title: 'Echo Message',
  Description: 'Prints a message',
  Search: 'echo',
  ActionType: 'Echo',
  InputPorts: ['In'],
  OutputPorts: ['Next'],
  Properties: { Text: { Type: 'text', DefaultValue: 'hi', Options: [] } },
  Preview: '',
}

const initialState = useGraphStore.getState()

beforeEach(() => {
  useGraphStore.setState(initialState, true)
})

describe('addNode / deleteNode', () => {
  it('assigns sequential Numbers and increments nextNodeNumber', () => {
    useGraphStore.getState().addNode(START_DEF, { x: 0, y: 0 })
    useGraphStore.getState().addNode(ECHO_DEF, { x: 10, y: 10 })
    const { nodes, nextNodeNumber } = useGraphStore.getState()
    expect(nodes.map((n) => n.Number)).toEqual([1, 2])
    expect(nextNodeNumber).toBe(3)
  })

  it('deleting a node also removes any connection touching it', () => {
    const { addNode, connect } = useGraphStore.getState()
    addNode(START_DEF, { x: 0, y: 0 })
    addNode(ECHO_DEF, { x: 10, y: 10 })
    const [start, echo] = useGraphStore.getState().nodes
    connect({ FromNodeId: start.Id, FromPort: 'Next', ToNodeId: echo.Id, ToPort: 'In' })
    expect(useGraphStore.getState().connections).toHaveLength(1)

    useGraphStore.getState().deleteNode(start.Id)
    const state = useGraphStore.getState()
    expect(state.nodes.map((n) => n.Id)).toEqual([echo.Id])
    expect(state.connections).toHaveLength(0)
  })
})

describe('undo / redo', () => {
  it('undo restores the pre-mutation state; redo re-applies it', () => {
    useGraphStore.getState().addNode(START_DEF, { x: 0, y: 0 })
    expect(useGraphStore.getState().nodes).toHaveLength(1)

    useGraphStore.getState().undo()
    expect(useGraphStore.getState().nodes).toHaveLength(0)

    useGraphStore.getState().redo()
    expect(useGraphStore.getState().nodes).toHaveLength(1)
  })

  it('a new mutation after undo clears the redo stack', () => {
    const { addNode } = useGraphStore.getState()
    addNode(START_DEF, { x: 0, y: 0 })
    useGraphStore.getState().undo()
    expect(useGraphStore.getState().future).toHaveLength(1)

    useGraphStore.getState().addNode(ECHO_DEF, { x: 0, y: 0 })
    expect(useGraphStore.getState().future).toHaveLength(0)
  })

  it('undo/redo on an empty history is a no-op', () => {
    useGraphStore.getState().undo()
    useGraphStore.getState().redo()
    expect(useGraphStore.getState().nodes).toHaveLength(0)
  })

  it('checkpoint() alone records a point without changing state, for callers batching continuous edits', () => {
    useGraphStore.getState().addNode(START_DEF, { x: 0, y: 0 })
    const nodeId = useGraphStore.getState().nodes[0].Id
    const pastLengthBeforeCheckpoint = useGraphStore.getState().past.length

    useGraphStore.getState().checkpoint()
    // Several rapid moves after one checkpoint (simulating drag frames / keystrokes).
    useGraphStore.getState().moveNode(nodeId, { x: 1, y: 1 })
    useGraphStore.getState().moveNode(nodeId, { x: 2, y: 2 })
    useGraphStore.getState().moveNode(nodeId, { x: 3, y: 3 })

    expect(useGraphStore.getState().past.length).toBe(pastLengthBeforeCheckpoint + 1)
    useGraphStore.getState().undo()
    expect(useGraphStore.getState().nodes[0].X).toBe(0)
  })
})

describe('loadGraph', () => {
  it('replaces the whole graph and is itself undoable', () => {
    useGraphStore.getState().addNode(START_DEF, { x: 0, y: 0 })
    const data: GraphSaveData = {
      Nodes: [
        {
          Id: 'loaded-1',
          Number: 1,
          DefinitionId: 'logic.echo',
          ActionType: 'Echo',
          Title: 'Echo Message',
          Description: '',
          X: 5,
          Y: 5,
          InputPorts: ['In'],
          OutputPorts: ['Next'],
          Properties: { Text: 'loaded' },
        },
      ],
      Connections: [],
      NextNodeNumber: 2,
      Zoom: 1,
    }

    useGraphStore.getState().loadGraph(data)
    expect(useGraphStore.getState().nodes).toEqual(data.Nodes)
    expect(useGraphStore.getState().nextNodeNumber).toBe(2)

    useGraphStore.getState().undo()
    expect(useGraphStore.getState().nodes).toHaveLength(1)
    expect(useGraphStore.getState().nodes[0].DefinitionId).toBe('logic.start')
  })
})
