import type { NodeConnection, NodeDefinition, ScriptNode } from '../types/graph'
import { findStartNodes, getReachableNodeIds } from './graph'

export type IssueSeverity = 'error' | 'warning'

export interface GraphIssue {
  severity: IssueSeverity
  message: string
}

interface GetGraphIssuesArgs {
  nodes: ScriptNode[]
  connections: NodeConnection[]
  definitionsById: Map<string, NodeDefinition>
}

export function getGraphIssues({
  nodes,
  connections,
  definitionsById,
}: GetGraphIssuesArgs): GraphIssue[] {
  const issues: GraphIssue[] = []
  if (nodes.length === 0) return issues

  const startNodes = findStartNodes(nodes)
  if (startNodes.length === 0) {
    issues.push({ severity: 'error', message: 'No Start node found.' })
  } else if (startNodes.length > 1) {
    issues.push({
      severity: 'warning',
      message: `Multiple Start nodes found (${startNodes.length}); only the first will be used.`,
    })
  }

  const nodeIds = new Set(nodes.map((n) => n.Id))
  const reachable = getReachableNodeIds(nodes, connections)

  for (const node of nodes) {
    const label = `${node.Title} #${node.Number}`

    if (node.ActionType !== 'Start' && !reachable.has(node.Id)) {
      issues.push({
        severity: 'warning',
        message: `${label} is not connected to Start and will not be included in the generated script.`,
      })
    }

    const definition = definitionsById.get(node.DefinitionId)
    for (const port of node.OutputPorts) {
      const hasOutgoing = connections.some(
        (c) => c.FromNodeId === node.Id && c.FromPort === port,
      )
      if (!hasOutgoing) {
        issues.push({
          severity: 'warning',
          message: `${label} output port "${port}" is not connected.`,
        })
      }
    }

    for (const [key, value] of Object.entries(node.Properties)) {
      if (value.trim() === '') {
        issues.push({ severity: 'error', message: `${label} property "${key}" is empty.` })
        continue
      }
      const propDef = definition?.Properties[key]
      if (propDef?.Type === 'number' && Number.isNaN(Number(value))) {
        issues.push({
          severity: 'error',
          message: `${label} property "${key}" must be a number.`,
        })
      }
    }
  }

  for (const c of connections) {
    if (!nodeIds.has(c.FromNodeId) || !nodeIds.has(c.ToNodeId)) {
      issues.push({
        severity: 'error',
        message: `Connection references a missing node (${c.FromNodeId} -> ${c.ToNodeId}).`,
      })
    }
  }

  return issues
}
