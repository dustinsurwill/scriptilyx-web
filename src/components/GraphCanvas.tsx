import { useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Connection,
  type Edge,
  type NodeMouseHandler,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '../store/graphStoreContext'
import { connectionId } from '../store/graphStore'
import type { NodeDefinition } from '../types/graph'
import { ScriptGraphNode, type ScriptGraphNodeType } from './ScriptGraphNode'

const nodeTypes = { scriptNode: ScriptGraphNode }

export function GraphCanvas({ definitionsById }: { definitionsById: Map<string, NodeDefinition> }) {
  const nodes = useGraphStore((s) => s.nodes)
  const connections = useGraphStore((s) => s.connections)
  const selection = useGraphStore((s) => s.selection)
  const moveNode = useGraphStore((s) => s.moveNode)
  const deleteNode = useGraphStore((s) => s.deleteNode)
  const deleteConnection = useGraphStore((s) => s.deleteConnection)
  const connect = useGraphStore((s) => s.connect)
  const selectNode = useGraphStore((s) => s.selectNode)
  const selectConnection = useGraphStore((s) => s.selectConnection)
  const checkpoint = useGraphStore((s) => s.checkpoint)
  // React Flow reports a position change on every frame of a drag, not just
  // at the end. Tracking which node IDs are mid-drag lets us take one undo
  // checkpoint per drag gesture instead of one per pixel.
  const draggingNodeIds = useRef(new Set<string>())

  const flowNodes: ScriptGraphNodeType[] = useMemo(
    () =>
      nodes.map((scriptNode) => ({
        id: scriptNode.Id,
        type: 'scriptNode',
        position: { x: scriptNode.X, y: scriptNode.Y },
        // Top-level `selected` drives React Flow's own behavior (e.g. the
        // Backspace/Delete handler only acts on framework-selected nodes);
        // data.selected is what ScriptGraphNode reads to style the border.
        selected: selection.nodeId === scriptNode.Id,
        data: {
          scriptNode,
          definition: definitionsById.get(scriptNode.DefinitionId),
          selected: selection.nodeId === scriptNode.Id,
        },
      })),
    [nodes, selection.nodeId, definitionsById],
  )

  const flowEdges: Edge[] = useMemo(
    () =>
      connections.map((c) => {
        const id = connectionId(c)
        return {
          id,
          source: c.FromNodeId,
          sourceHandle: c.FromPort,
          target: c.ToNodeId,
          targetHandle: c.ToPort,
          selected: selection.connectionId === id,
        }
      }),
    [connections, selection.connectionId],
  )

  const onNodesChange: OnNodesChange<ScriptGraphNodeType> = (changes) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        if (change.dragging) {
          if (!draggingNodeIds.current.has(change.id)) {
            draggingNodeIds.current.add(change.id)
            checkpoint()
          }
        } else {
          draggingNodeIds.current.delete(change.id)
        }
        moveNode(change.id, change.position)
      } else if (change.type === 'remove') {
        deleteNode(change.id)
      }
    }
  }

  const onEdgesChange: OnEdgesChange = (changes) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        deleteConnection(change.id)
      }
    }
  }

  const onConnect = (params: Connection) => {
    if (!params.sourceHandle || !params.targetHandle) return
    connect({
      FromNodeId: params.source,
      FromPort: params.sourceHandle,
      ToNodeId: params.target,
      ToPort: params.targetHandle,
    })
  }

  const onNodeClick: NodeMouseHandler<ScriptGraphNodeType> = (_, node) => selectNode(node.id)
  const onEdgeClick = (_: unknown, edge: Edge) => selectConnection(edge.id)
  const onPaneClick = () => {
    selectNode(null)
  }

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      deleteKeyCode={['Backspace', 'Delete']}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  )
}
