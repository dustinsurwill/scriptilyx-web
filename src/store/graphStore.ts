import { create } from 'zustand'
import type { GraphSaveData, NodeConnection, NodeDefinition, ScriptNode } from '../types/graph'
import { remapLegacyGraph } from '../lib/legacyImport'

interface Selection {
  nodeId: string | null
  connectionId: string | null
}

export function connectionId(c: NodeConnection): string {
  return `${c.FromNodeId}::${c.FromPort}->${c.ToNodeId}::${c.ToPort}`
}

const AUTOSAVE_KEY = 'scriptilyx-web:graph'
const HISTORY_LIMIT = 100

/** The three fields that make up an undo/redo checkpoint (and, separately,
 * a saved/autosaved graph). Nodes/connections arrays are always replaced
 * wholesale rather than mutated in place, so keeping a reference to them
 * here is a safe, cheap snapshot — no deep clone needed. */
interface HistorySnapshot {
  nodes: ScriptNode[]
  connections: NodeConnection[]
  nextNodeNumber: number
}

function readAutosave(): HistorySnapshot | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GraphSaveData
    if (!Array.isArray(parsed.Nodes) || !Array.isArray(parsed.Connections)) return null
    const remapped = remapLegacyGraph(parsed)
    return {
      nodes: remapped.Nodes,
      connections: remapped.Connections,
      nextNodeNumber: remapped.NextNodeNumber ?? 1,
    }
  } catch {
    return null
  }
}

function writeAutosave(snapshot: HistorySnapshot) {
  if (typeof localStorage === 'undefined') return
  const data: GraphSaveData = {
    Nodes: snapshot.nodes,
    Connections: snapshot.connections,
    NextNodeNumber: snapshot.nextNodeNumber,
    Zoom: 1,
  }
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data))
  } catch {
    // Storage full/unavailable (e.g. private browsing) — autosave is a
    // convenience, not a guarantee, so just skip this write.
  }
}

const restored = readAutosave()

interface GraphState {
  nodes: ScriptNode[]
  connections: NodeConnection[]
  nextNodeNumber: number
  selection: Selection
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  /** Script-preview display toggles. Shared between ScriptPreview (which
   * owns the checkboxes) and Toolbar (whose Copy/Export buttons need to
   * know which text is on screen) — UI state, not graph state, so it's
   * deliberately outside HistorySnapshot/autosave. */
  detailedComments: boolean
  minify: boolean
  setDetailedComments: (value: boolean) => void
  setMinify: (value: boolean) => void

  addNode: (definition: NodeDefinition, position: { x: number; y: number }) => void
  moveNode: (nodeId: string, position: { x: number; y: number }) => void
  updateNodeProperty: (nodeId: string, key: string, value: string) => void
  deleteNode: (nodeId: string) => void
  deleteConnection: (id: string) => void
  connect: (connection: NodeConnection) => void
  selectNode: (nodeId: string | null) => void
  selectConnection: (id: string | null) => void
  /** Records the current state as an undo point without changing anything —
   * call before a batch of continuous edits (a node drag, a property field's
   * keystrokes) that should collapse into a single undo step. */
  checkpoint: () => void
  undo: () => void
  redo: () => void
  /** Replaces the whole graph (Open file, restoring an autosave) as one
   * undoable step. */
  loadGraph: (data: GraphSaveData) => void
}

function snapshotOf(state: GraphState): HistorySnapshot {
  return { nodes: state.nodes, connections: state.connections, nextNodeNumber: state.nextNodeNumber }
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: restored?.nodes ?? [],
  connections: restored?.connections ?? [],
  nextNodeNumber: restored?.nextNodeNumber ?? 1,
  selection: { nodeId: null, connectionId: null },
  past: [],
  future: [],
  detailedComments: false,
  minify: false,
  setDetailedComments: (value) => set({ detailedComments: value }),
  setMinify: (value) => set({ minify: value }),

  addNode: (definition, position) => {
    get().checkpoint()
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
    // Same double-invoke guard as connect() below — React Flow's
    // onNodesChange can report the same 'remove' change more than once.
    if (!get().nodes.some((n) => n.Id === nodeId)) return
    get().checkpoint()
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
    if (!get().connections.some((c) => connectionId(c) === id)) return
    get().checkpoint()
    set((state) => ({
      connections: state.connections.filter((c) => connectionId(c) !== id),
      selection:
        state.selection.connectionId === id
          ? { nodeId: null, connectionId: null }
          : state.selection,
    }))
  },

  connect: (connection) => {
    const state = get()
    const isDuplicate = state.connections.some(
      (c) =>
        c.FromNodeId === connection.FromNodeId &&
        c.FromPort === connection.FromPort &&
        c.ToNodeId === connection.ToNodeId &&
        c.ToPort === connection.ToPort,
    )
    // React Flow (at least combined with React 18 StrictMode in dev) can
    // invoke onConnect twice for a single drag gesture. Without this guard
    // the second call would push a second, redundant checkpoint whose
    // snapshot already contains the just-added wire — corrupting undo so
    // the first Undo click silently restores that same state and only the
    // second click visibly removes the wire.
    if (isDuplicate) return
    get().checkpoint()
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

  checkpoint: () => {
    set((state) => ({
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    }))
  },

  undo: () => {
    set((state) => {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future],
        selection: { nodeId: null, connectionId: null },
      }
    })
  },

  redo: () => {
    set((state) => {
      if (state.future.length === 0) return state
      const [next, ...rest] = state.future
      return {
        ...next,
        past: [...state.past, snapshotOf(state)],
        future: rest,
        selection: { nodeId: null, connectionId: null },
      }
    })
  },

  loadGraph: (data) => {
    get().checkpoint()
    set({
      nodes: data.Nodes,
      connections: data.Connections,
      nextNodeNumber: data.NextNodeNumber,
      selection: { nodeId: null, connectionId: null },
    })
  },
}))

if (typeof window !== 'undefined') {
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  useGraphStore.subscribe((state) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => writeAutosave(snapshotOf(state)), 500)
  })
}
