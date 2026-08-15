import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { NodeDefinition, ScriptNode } from '../types/graph'

export interface ScriptGraphNodeData extends Record<string, unknown> {
  scriptNode: ScriptNode
  definition: NodeDefinition | undefined
  selected: boolean
}

export type ScriptGraphNodeType = Node<ScriptGraphNodeData, 'scriptNode'>

function renderPreview(scriptNode: ScriptNode, definition: NodeDefinition | undefined): string {
  const template = definition?.Preview || scriptNode.Description
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return scriptNode.Properties[key] ?? match
  })
}

export function ScriptGraphNode({ data }: NodeProps<ScriptGraphNodeType>) {
  const { scriptNode, selected } = data

  return (
    <div
      style={{
        width: 220,
        border: `2px solid ${selected ? '#f59e0b' : '#6b7280'}`,
        borderRadius: 8,
        background: 'var(--node-bg, #1f2937)',
        color: 'var(--node-fg, #f3f4f6)',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 8px',
          background: '#374151',
          fontWeight: 600,
        }}
      >
        <span>{scriptNode.Title}</span>
        <span style={{ opacity: 0.7 }}>#{scriptNode.Number}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
        <div style={{ flex: 1 }}>
          {scriptNode.InputPorts.map((port) => (
            <div
              key={port}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 22 }}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={port}
                style={{ position: 'relative', left: 0, transform: 'none' }}
              />
              <span style={{ marginLeft: 4, opacity: 0.85 }}>{port}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          {scriptNode.OutputPorts.map((port) => (
            <div
              key={port}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: 22,
              }}
            >
              <span style={{ marginRight: 4, opacity: 0.85 }}>{port}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={port}
                style={{ position: 'relative', right: 0, transform: 'none' }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '4px 8px 8px', opacity: 0.75 }}>
        {renderPreview(scriptNode, data.definition)}
      </div>
    </div>
  )
}
