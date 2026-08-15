import type { NodeConnection, ScriptNode } from '../types/graph'

export function findStartNodes(nodes: ScriptNode[]): ScriptNode[] {
  return nodes.filter((n) => n.ActionType === 'Start')
}

/** Nodes reachable from the first Start node, following connections in any port. */
export function getReachableNodeIds(
  nodes: ScriptNode[],
  connections: NodeConnection[],
): Set<string> {
  const [start] = findStartNodes(nodes)
  const visited = new Set<string>()
  if (!start) return visited

  const outgoingByNode = new Map<string, NodeConnection[]>()
  for (const c of connections) {
    const list = outgoingByNode.get(c.FromNodeId) ?? []
    list.push(c)
    outgoingByNode.set(c.FromNodeId, list)
  }

  const stack = [start.Id]
  while (stack.length > 0) {
    const nodeId = stack.pop()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    for (const c of outgoingByNode.get(nodeId) ?? []) {
      if (!visited.has(c.ToNodeId)) stack.push(c.ToNodeId)
    }
  }
  return visited
}
