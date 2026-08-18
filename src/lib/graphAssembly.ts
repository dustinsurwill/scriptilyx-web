import type { GraphSaveData, NodeConnection, NodeDefinition, ScriptNode } from '../types/graph'

/** Shared plumbing for both src/data/scenarioTemplates.ts (static example
 * graphs) and src/data/wizardTemplates.ts (parameterized, modal-driven
 * graphs) — the two are deliberately separate systems with separate data
 * and separate menus, but both need "a small hand-authored DAG addressed
 * by local refs" turned into a real GraphSaveData with fresh ids and a
 * readable layout, so that mechanical part is shared rather than
 * duplicated. */

/** One node, addressed by a local `ref` (not the final ScriptNode.Id,
 * which is randomly generated at build time so a graph can be built more
 * than once without id collisions). */
export interface RefNode {
  ref: string
  definitionId: string
  /** Overrides for this definition's default property values; unlisted
   * properties fall back to NodeDefinition.Properties[key].DefaultValue,
   * same as a freshly-dragged-in node. */
  properties?: Record<string, string>
}

export interface RefEdge {
  from: string
  fromPort: string
  to: string
  toPort: string
}

const COLUMN_WIDTH = 300
const ROW_HEIGHT = 170

/** Left-to-right layered ("Sugiyama-style") layout, so branch/merge shaped
 * graphs (a 4-way router split, several branches reconverging on one input
 * port) come in readable rather than needing to be dragged apart by hand:
 *  - column = longest-path distance from a source (no-incoming-edge) node,
 *    so a node always sits strictly right of everything that leads to it.
 *  - row within a column = a barycenter pass over already-placed
 *    predecessor rows, so a merge node centers under its parents and a
 *    branch's children fan out under it, falling back to declaration order
 *    for ties/sourceless nodes.
 * Not a general-purpose graph layout (no crossing minimization beyond the
 * one barycenter pass, no cycle support beyond not infinite-looping) —
 * these are small, hand-authored DAGs, so this is deliberately just enough
 * to avoid a fixed grid's overlap on branches. */
export function computeLayout(nodes: RefNode[], edges: RefEdge[]): Map<string, { x: number; y: number }> {
  const order = new Map(nodes.map((n, i) => [n.ref, i]))
  const predecessors = new Map<string, string[]>()
  for (const n of nodes) predecessors.set(n.ref, [])
  for (const edge of edges) predecessors.get(edge.to)?.push(edge.from)

  const rank = new Map<string, number>()
  const visiting = new Set<string>()
  const rankOf = (ref: string): number => {
    if (rank.has(ref)) return rank.get(ref)!
    if (visiting.has(ref)) return 0 // cycle guard — not expected for these hand-authored DAGs
    visiting.add(ref)
    const preds = predecessors.get(ref) ?? []
    const value = preds.length === 0 ? 0 : 1 + Math.max(...preds.map(rankOf))
    visiting.delete(ref)
    rank.set(ref, value)
    return value
  }
  for (const n of nodes) rankOf(n.ref)

  const columns = new Map<number, string[]>()
  for (const n of nodes) {
    const col = rank.get(n.ref)!
    if (!columns.has(col)) columns.set(col, [])
    columns.get(col)!.push(n.ref)
  }

  const row = new Map<string, number>()
  for (const col of Array.from(columns.keys()).sort((a, b) => a - b)) {
    const refs = columns.get(col)!
    refs.sort((a, b) => {
      const preds = (ref: string) => predecessors.get(ref) ?? []
      const barycenter = (ref: string) => {
        const parentRows = preds(ref).map((p) => row.get(p)!)
        return parentRows.length > 0 ? parentRows.reduce((s, v) => s + v, 0) / parentRows.length : order.get(ref)!
      }
      return barycenter(a) - barycenter(b) || order.get(a)! - order.get(b)!
    })
    refs.forEach((ref, i) => row.set(ref, i))
  }

  const positions = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    positions.set(n.ref, { x: 60 + rank.get(n.ref)! * COLUMN_WIDTH, y: 60 + row.get(n.ref)! * ROW_HEIGHT })
  }
  return positions
}

/** Turns ref-addressed nodes/edges into a real GraphSaveData — fresh node
 * ids, sequential Numbers, and a layered layout (see computeLayout) driven
 * by the edges. `sourceLabel` is only used in error messages (e.g. the
 * template/wizard id) to help track down a bad ref if one slips in. */
export function assembleGraph(
  nodes: RefNode[],
  edges: RefEdge[],
  definitionsById: Map<string, NodeDefinition>,
  sourceLabel: string,
): GraphSaveData {
  const layout = computeLayout(nodes, edges)
  const idByRef = new Map<string, string>()
  const scriptNodes: ScriptNode[] = nodes.map((refNode, index) => {
    const definition = definitionsById.get(refNode.definitionId)
    if (!definition) {
      throw new Error(`"${sourceLabel}" references unknown node id "${refNode.definitionId}"`)
    }
    const id = crypto.randomUUID()
    idByRef.set(refNode.ref, id)
    const properties: Record<string, string> = {}
    for (const [key, propDef] of Object.entries(definition.Properties)) {
      properties[key] = refNode.properties?.[key] ?? propDef.DefaultValue
    }
    const position = layout.get(refNode.ref)!
    return {
      Id: id,
      Number: index + 1,
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
  })

  const connections: NodeConnection[] = edges.map((edge) => {
    const fromId = idByRef.get(edge.from)
    const toId = idByRef.get(edge.to)
    if (!fromId || !toId) {
      throw new Error(`"${sourceLabel}" has an edge referencing an unknown node ref`)
    }
    return { FromNodeId: fromId, FromPort: edge.fromPort, ToNodeId: toId, ToPort: edge.toPort }
  })

  return { Nodes: scriptNodes, Connections: connections, NextNodeNumber: scriptNodes.length + 1, Zoom: 1 }
}
