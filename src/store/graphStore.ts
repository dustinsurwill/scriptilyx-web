import { create } from 'zustand'
import type { GraphSaveData, NodeConnection, NodeDefinition, ScriptNode } from '../types/graph'

interface Selection {
  nodeId: string | null
  connectionId: string | null
}

/** Describes one "router"-shaped node's output-port naming convention, so
 * addOutputCase/removeOutputCase can stay generic across Switch, Command
 * Router, Number Greater Router, and any future node shaped like them —
 * one input, N user-manageable "case" output ports, one fixed terminal
 * fallback port that always stays last. Built by the UI (PropertyPanel),
 * not the store — the store has no per-ActionType knowledge of its own. */
export interface OutputCaseConfig {
  /** The fixed fallback output port (Switch's "Default", Command Router's
   * "unknown", ...) that must always stay last and is never itself
   * addable/removable. */
  terminalPort: string
  /** Given the case ports already present (terminal excluded), returns the
   * next port name to append. */
  nextPort: (casePorts: string[]) => string
  /** True if this case port is one addSwitchCase/removeOutputCase manage —
   * false for a node's fixed/built-in cases that predate this mechanism
   * (Command Router's "startup"/"dock"/... , Number Greater Router's
   * "Greater2".."Greater6") and must never be removed. */
  isRemovable: (port: string) => boolean
  /** Property key holding this port's match value/threshold. */
  propertyKey: (port: string) => string
  /** Default value for a newly-added port's property. */
  defaultValue: (port: string) => string
}

export function connectionId(c: NodeConnection): string {
  return `${c.FromNodeId}::${c.FromPort}->${c.ToNodeId}::${c.ToPort}`
}

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

export interface GraphState {
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
  /** Appends one more output port to a "router"-shaped node instance
   * (Switch, Command Router, Number Greater Router, ...) ahead of its
   * fixed terminal/fallback port, plus whatever property that new port's
   * match value lives under — see PropertyPanel's per-node `OutputCaseConfig`
   * and the matching emitter in src/games/space-engineers/codegen. The
   * store knows nothing about any specific node's naming convention; the
   * caller supplies it. */
  addOutputCase: (nodeId: string, config: OutputCaseConfig) => void
  /** Removes the most-recently-added removable output port (per
   * `config.isRemovable`) from a router-shaped node instance — a no-op if
   * none are removable — dropping its match-value property and any wire
   * connected from that port. */
  removeOutputCase: (nodeId: string, config: OutputCaseConfig) => void
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

export interface CreateGraphStoreOptions {
  /** localStorage key this store instance autosaves to/from — one per
   * active game, so switching games can't clobber another game's graph. */
  autosaveKey: string
  /** Pre-rename/pre-multi-game localStorage key to fall back to once, if
   * `autosaveKey` has nothing saved yet. Space Engineers only. */
  legacyAutosaveKey?: string
  /** Rewrites a loaded/autosaved graph onto this game's current node
   * catalog (Space Engineers' `.segraph` legacy import). Other games omit
   * this and loaded data passes through unchanged. */
  remapLegacyGraph?: (data: GraphSaveData) => GraphSaveData
}

/** Creates one independent graph store instance (state + autosave-backed
 * persistence) for a single game session. A fresh instance per active game
 * keeps undo history, selection, and autosave fully isolated between
 * games — see `GraphStoreContext.tsx` for how the editor provides one of
 * these per mounted game. */
export function createGraphStore(options: CreateGraphStoreOptions) {
  const { autosaveKey, legacyAutosaveKey, remapLegacyGraph } = options

  function readAutosave(): HistorySnapshot | null {
    if (typeof localStorage === 'undefined') return null
    try {
      const raw =
        localStorage.getItem(autosaveKey) ?? (legacyAutosaveKey ? localStorage.getItem(legacyAutosaveKey) : null)
      if (!raw) return null
      const parsed = JSON.parse(raw) as GraphSaveData
      if (!Array.isArray(parsed.Nodes) || !Array.isArray(parsed.Connections)) return null
      const remapped = remapLegacyGraph ? remapLegacyGraph(parsed) : parsed
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
      localStorage.setItem(autosaveKey, JSON.stringify(data))
    } catch {
      // Storage full/unavailable (e.g. private browsing) — autosave is a
      // convenience, not a guarantee, so just skip this write.
    }
  }

  const restored = readAutosave()

  const store = create<GraphState>((set, get) => ({
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

    addOutputCase: (nodeId, config) => {
      get().checkpoint()
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.Id !== nodeId) return n
          const casePorts = n.OutputPorts.filter((p) => p !== config.terminalPort)
          const newPort = config.nextPort(casePorts)
          return {
            ...n,
            OutputPorts: [...casePorts, newPort, config.terminalPort],
            Properties: { ...n.Properties, [config.propertyKey(newPort)]: config.defaultValue(newPort) },
          }
        }),
      }))
    },

    removeOutputCase: (nodeId, config) => {
      get().checkpoint()
      set((state) => {
        const node = state.nodes.find((n) => n.Id === nodeId)
        const removable = node?.OutputPorts.filter((p) => p !== config.terminalPort && config.isRemovable(p)) ?? []
        if (!node || removable.length === 0) return state
        const lastCase = removable[removable.length - 1]
        const propKey = config.propertyKey(lastCase)
        const { [propKey]: _removed, ...restProperties } = node.Properties
        return {
          nodes: state.nodes.map((n) =>
            n.Id === nodeId
              ? { ...n, OutputPorts: n.OutputPorts.filter((p) => p !== lastCase), Properties: restProperties }
              : n,
          ),
          connections: state.connections.filter((c) => !(c.FromNodeId === nodeId && c.FromPort === lastCase)),
        }
      })
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
    store.subscribe((state) => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => writeAutosave(snapshotOf(state)), 500)
    })
  }

  return store
}
