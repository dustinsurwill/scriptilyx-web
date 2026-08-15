import { create } from 'zustand'
import type { NodeConnection, NodeDefinition, ScriptNode } from '../types/graph'

interface Selection {
  nodeId: string | null
  connectionId: string | null
}

export function connectionId(c: NodeConnection): string {
  return `${c.FromNodeId}::${c.FromPort}->${c.ToNodeId}::${c.ToPort}`
}

interface GraphState {
  nodes: ScriptNode[]
  connections: NodeConnection[]
  nextNodeNumber: number
  selection: Selection

  addNode: (definition: NodeDefinition, position: { x: number; y: number }) => void
  moveNode: (nodeId: string, position: { x: number; y: number }) => void
  updateNodeProperty: (nodeId: string, key: string, value: string) => void
  deleteNode: (nodeId: string) => void
  deleteConnection: (id: string) => void
  connect: (connection: NodeConnection) => void
  selectNode: (nodeId: string | null) => void
  selectConnection: (id: string | null) => void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  connections: [],
  nextNodeNumber: 1,
  selection: { nodeId: null, connectionId: null },

  addNode: (definition, position) => {
    const { nextNodeNumber } = get()
    const properties: Record<string, string> = {}
    for (const [key, def] of Object.entries(definition.Properties)) {
      properties[key] = def.DefaultValue
    }
    const node: ScriptNode = {
      Id: crypto.randomUUID(),
      Number: nextNodeNumber,
      DefinitionId: definition.Id,
      ActionType: definition.ActionType,
      Title: definition.Title,
      Description: definition.Description,
      X: position.x,
      Y: position.y,
      InputPorts: [...definition.InputPorts],
      OutputPorts: [...definition.OutputPorts],
      Properties: properties,
    }
    set((state) => ({
      nodes: [...state.nodes, node],
      nextNodeNumber: state.nextNodeNumber + 1,
      selection: { nodeId: node.Id, connectionId: null },
    }))
  },

  moveNode: (nodeId, position) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.Id === nodeId ? { ...n, X: position.x, Y: position.y } : n,
      ),
    }))
  },

  updateNodeProperty: (nodeId, key, value) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.Id === nodeId ? { ...n, Properties: { ...n.Properties, [key]: value } } : n,
      ),
    }))
  },

  deleteNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.Id !== nodeId),
      connections: state.connections.filter(
        (c) => c.FromNodeId !== nodeId && c.ToNodeId !== nodeId,
      ),
      selection:
        state.selection.nodeId === nodeId
          ? { nodeId: null, connectionId: null }
          : state.selection,
    }))
  },

  deleteConnection: (id) => {
    set((state) => ({
      connections: state.connections.filter((c) => connectionId(c) !== id),
      selection:
        state.selection.connectionId === id
          ? { nodeId: null, connectionId: null }
          : state.selection,
    }))
  },

  connect: (connection) => {
    set((state) => ({
      // An output port drives exactly one outgoing wire: connecting a new
      // one replaces whatever it was previously wired to. Input ports may
      // receive from multiple sources, so no filtering on the target side.
      connections: [
        ...state.connections.filter(
          (c) =>
            !(c.FromNodeId === connection.FromNodeId && c.FromPort === connection.FromPort),
        ),
        connection,
      ],
    }))
  },

  selectNode: (nodeId) => set({ selection: { nodeId, connectionId: null } }),
  selectConnection: (id) => set({ selection: { nodeId: null, connectionId: id } }),
}))
