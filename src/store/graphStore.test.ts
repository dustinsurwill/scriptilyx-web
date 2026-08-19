import { beforeEach, describe, expect, it } from 'vitest'
import { createGraphStore, type OutputCaseConfig } from './graphStore'
import type { GraphSaveData, NodeDefinition } from '../types/graph'

const useGraphStore = createGraphStore({ autosaveKey: 'test:graph' })

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

  it('calling connect() twice with an identical connection (React Flow can fire onConnect twice per drag) only checkpoints once', () => {
    const { addNode, connect } = useGraphStore.getState()
    addNode(START_DEF, { x: 0, y: 0 })
    addNode(ECHO_DEF, { x: 10, y: 10 })
    const [start, echo] = useGraphStore.getState().nodes
    const pastLengthBeforeConnect = useGraphStore.getState().past.length

    const wire = { FromNodeId: start.Id, FromPort: 'Next', ToNodeId: echo.Id, ToPort: 'In' }
    connect(wire)
    connect(wire) // duplicate call, as if onConnect fired twice for one gesture
    expect(useGraphStore.getState().connections).toHaveLength(1)
    expect(useGraphStore.getState().past.length).toBe(pastLengthBeforeConnect + 1)

    // A single undo should fully remove the wire, not just no-op the redundant checkpoint.
    useGraphStore.getState().undo()
    expect(useGraphStore.getState().connections).toHaveLength(0)
  })

  it('calling deleteNode()/deleteConnection() twice on the same id is a no-op the second time', () => {
    const { addNode, connect } = useGraphStore.getState()
    addNode(START_DEF, { x: 0, y: 0 })
    addNode(ECHO_DEF, { x: 10, y: 10 })
    const [start, echo] = useGraphStore.getState().nodes
    connect({ FromNodeId: start.Id, FromPort: 'Next', ToNodeId: echo.Id, ToPort: 'In' })

    const pastLengthBeforeDelete = useGraphStore.getState().past.length
    useGraphStore.getState().deleteNode(start.Id)
    useGraphStore.getState().deleteNode(start.Id)
    expect(useGraphStore.getState().past.length).toBe(pastLengthBeforeDelete + 1)
    useGraphStore.getState().undo()
    expect(useGraphStore.getState().nodes.map((n) => n.Id)).toEqual([start.Id, echo.Id])
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

const SWITCH_DEF: NodeDefinition = {
  Id: 'logic.switch',
  Category: 'Logic',
  Title: 'Switch',
  Description: 'Routes by matching Value',
  Search: 'switch',
  ActionType: 'Switch',
  InputPorts: ['In'],
  OutputPorts: ['Case1', 'Case2', 'Default'],
  Properties: {
    Value: { Type: 'text', DefaultValue: '', Options: [] },
    Case1Value: { Type: 'text', DefaultValue: 'case1', Options: [] },
    Case2Value: { Type: 'text', DefaultValue: 'case2', Options: [] },
  },
  Preview: '',
}

// Mirrors the Switch entry in PropertyPanel's OUTPUT_CASE_CONFIGS — the
// store itself has no per-ActionType naming knowledge (see OutputCaseConfig's
// doc comment in graphStore.ts), so these tests exercise the generic
// mechanism with a config shaped like a real caller would supply.
const SWITCH_CASE_CONFIG: OutputCaseConfig = {
  terminalPort: 'Default',
  nextPort: (cases) => `Case${cases.length + 1}`,
  isRemovable: () => true,
  propertyKey: (port) => `${port}Value`,
  defaultValue: (port) => port.toLowerCase(),
}

describe('addOutputCase / removeOutputCase', () => {
  it('adds a new case port before the terminal port, with a matching match-value property', () => {
    useGraphStore.getState().addNode(SWITCH_DEF, { x: 0, y: 0 })
    const [node] = useGraphStore.getState().nodes
    useGraphStore.getState().addOutputCase(node.Id, SWITCH_CASE_CONFIG)
    const updated = useGraphStore.getState().nodes[0]
    expect(updated.OutputPorts).toEqual(['Case1', 'Case2', 'Case3', 'Default'])
    expect(updated.Properties.Case3Value).toBe('case3')
  })

  it('removes the highest-numbered case and any wire connected from it', () => {
    useGraphStore.getState().addNode(SWITCH_DEF, { x: 0, y: 0 })
    useGraphStore.getState().addNode(START_DEF, { x: 10, y: 10 })
    const [switchNode, start] = useGraphStore.getState().nodes
    useGraphStore.getState().connect({ FromNodeId: switchNode.Id, FromPort: 'Case2', ToNodeId: start.Id, ToPort: 'In' })

    useGraphStore.getState().removeOutputCase(switchNode.Id, SWITCH_CASE_CONFIG)
    const updated = useGraphStore.getState().nodes[0]
    expect(updated.OutputPorts).toEqual(['Case1', 'Default'])
    expect(updated.Properties.Case2Value).toBeUndefined()
    expect(useGraphStore.getState().connections).toHaveLength(0)
  })

  it('is a no-op once nothing is removable', () => {
    useGraphStore.getState().addNode(SWITCH_DEF, { x: 0, y: 0 })
    const [node] = useGraphStore.getState().nodes
    useGraphStore.getState().removeOutputCase(node.Id, SWITCH_CASE_CONFIG)
    useGraphStore.getState().removeOutputCase(node.Id, SWITCH_CASE_CONFIG)
    expect(useGraphStore.getState().nodes[0].OutputPorts).toEqual(['Default'])

    useGraphStore.getState().removeOutputCase(node.Id, SWITCH_CASE_CONFIG)
    expect(useGraphStore.getState().nodes[0].OutputPorts).toEqual(['Default'])
  })

  it('respects a config that keeps some ports fixed/non-removable', () => {
    useGraphStore.getState().addNode(SWITCH_DEF, { x: 0, y: 0 })
    const [node] = useGraphStore.getState().nodes
    const onlyCase2Removable: OutputCaseConfig = { ...SWITCH_CASE_CONFIG, isRemovable: (port) => port === 'Case2' }
    useGraphStore.getState().removeOutputCase(node.Id, onlyCase2Removable)
    expect(useGraphStore.getState().nodes[0].OutputPorts).toEqual(['Case1', 'Default'])
    // Case1 isn't removable under this config, so a second call is a no-op.
    useGraphStore.getState().removeOutputCase(node.Id, onlyCase2Removable)
    expect(useGraphStore.getState().nodes[0].OutputPorts).toEqual(['Case1', 'Default'])
  })

  it('addOutputCase/removeOutputCase are each one undo step', () => {
    useGraphStore.getState().addNode(SWITCH_DEF, { x: 0, y: 0 })
    const [node] = useGraphStore.getState().nodes
    useGraphStore.getState().addOutputCase(node.Id, SWITCH_CASE_CONFIG)
    expect(useGraphStore.getState().nodes[0].OutputPorts).toHaveLength(4)
    useGraphStore.getState().undo()
    expect(useGraphStore.getState().nodes[0].OutputPorts).toEqual(['Case1', 'Case2', 'Default'])
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
