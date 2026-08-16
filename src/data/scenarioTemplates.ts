import type { GraphSaveData, NodeConnection, NodeDefinition, ScriptNode } from '../types/graph'

/** One node in a template, addressed by a template-local `ref` (not the
 * final ScriptNode.Id, which is randomly generated at build time so a
 * template can be inserted more than once without id collisions). */
interface TemplateNode {
  ref: string
  definitionId: string
  /** Overrides for this definition's default property values; unlisted
   * properties fall back to NodeDefinition.Properties[key].DefaultValue,
   * same as a freshly-dragged-in node. */
  properties?: Record<string, string>
}

interface TemplateEdge {
  from: string
  fromPort: string
  to: string
  toPort: string
}

export interface ScenarioTemplate {
  id: string
  title: string
  tier: 'Beginner' | 'Advanced' | 'Unified'
  description: string
  nodes: TemplateNode[]
  edges: TemplateEdge[]
}

const COLUMN_WIDTH = 260
const ROW_HEIGHT = 160

/** Turns a template's ref-addressed nodes/edges into a real GraphSaveData —
 * fresh node ids, sequential Numbers, a simple left-to-right/wrapping
 * layout (same spacing convention as App.tsx's "drag a node in" layout). */
export function buildScenarioGraph(
  template: ScenarioTemplate,
  definitionsById: Map<string, NodeDefinition>,
): GraphSaveData {
  const idByRef = new Map<string, string>()
  const nodes: ScriptNode[] = template.nodes.map((templateNode, index) => {
    const definition = definitionsById.get(templateNode.definitionId)
    if (!definition) {
      throw new Error(`Scenario template "${template.id}" references unknown node id "${templateNode.definitionId}"`)
    }
    const id = crypto.randomUUID()
    idByRef.set(templateNode.ref, id)
    const properties: Record<string, string> = {}
    for (const [key, propDef] of Object.entries(definition.Properties)) {
      properties[key] = templateNode.properties?.[key] ?? propDef.DefaultValue
    }
    return {
      Id: id,
      Number: index + 1,
      DefinitionId: definition.Id,
      ActionType: definition.ActionType,
      Title: definition.Title,
      Description: definition.Description,
      X: 60 + (index % 4) * COLUMN_WIDTH,
      Y: 60 + Math.floor(index / 4) * ROW_HEIGHT,
      InputPorts: [...definition.InputPorts],
      OutputPorts: [...definition.OutputPorts],
      Properties: properties,
    }
  })

  const connections: NodeConnection[] = template.edges.map((edge) => {
    const fromId = idByRef.get(edge.from)
    const toId = idByRef.get(edge.to)
    if (!fromId || !toId) {
      throw new Error(`Scenario template "${template.id}" has an edge referencing an unknown node ref`)
    }
    return { FromNodeId: fromId, FromPort: edge.fromPort, ToNodeId: toId, ToPort: edge.toPort }
  })

  return { Nodes: nodes, Connections: connections, NextNodeNumber: nodes.length + 1, Zoom: 1 }
}

export const scenarioTemplates: ScenarioTemplate[] = [
  {
    id: 'beginner.auto_door',
    title: 'Auto Door',
    tier: 'Beginner',
    description:
      'Checks a sensor once a second; when it trips, opens a door, waits, then closes it again. A first look at Start, a repeating trigger, a check, and two block actions.',
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '1' } },
      { ref: 'sensor', definitionId: 'sensor.if_active', properties: { BlockName: 'Door Sensor' } },
      { ref: 'open', definitionId: 'block.door_open', properties: { BlockName: 'Door' } },
      { ref: 'wait', definitionId: 'logic.wait_seconds', properties: { Seconds: '3' } },
      { ref: 'close', definitionId: 'block.door_close', properties: { BlockName: 'Door' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'sensor', toPort: 'In' },
      { from: 'sensor', fromPort: 'True', to: 'open', toPort: 'In' },
      { from: 'open', fromPort: 'Next', to: 'wait', toPort: 'In' },
      { from: 'wait', fromPort: 'Next', to: 'close', toPort: 'In' },
    ],
  },
  {
    id: 'advanced.uptime_lcd',
    title: 'Uptime Counter to LCD',
    tier: 'Advanced',
    description:
      'Initializes a number variable once on world load, then increments it every second and prints it to an LCD using variable interpolation — a look at Run Once On World Load, Number Math, and {name} text substitution.',
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'initOnce', definitionId: 'logic.run_once_on_world_load' },
      { ref: 'initCounter', definitionId: 'var.set_number', properties: { Name: 'uptimeSeconds', Value: '0' } },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '1' } },
      {
        ref: 'increment',
        definitionId: 'var.number_math',
        properties: { Name: 'uptimeSeconds', Operator: '+', Value: '1' },
      },
      {
        ref: 'lcd',
        definitionId: 'block.set_lcd_text',
        properties: { BlockName: 'Status LCD', Text: 'Uptime: {uptimeSeconds}s' },
      },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'initOnce', toPort: 'In' },
      { from: 'initOnce', fromPort: 'Next', to: 'initCounter', toPort: 'In' },
      { from: 'initCounter', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'increment', toPort: 'In' },
      { from: 'increment', fromPort: 'Next', to: 'lcd', toPort: 'In' },
    ],
  },
  {
    id: 'unified.door_and_dashboard',
    title: 'Door Automation + Status Dashboard',
    tier: 'Unified',
    description:
      'Combines the Auto Door and Uptime Counter scenarios into one script: an uptime counter feeds an LCD dashboard, then the same per-second tick checks a door sensor and cycles the door — everything under a single Start.',
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'initOnce', definitionId: 'logic.run_once_on_world_load' },
      { ref: 'initCounter', definitionId: 'var.set_number', properties: { Name: 'uptimeSeconds', Value: '0' } },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '1' } },
      {
        ref: 'increment',
        definitionId: 'var.number_math',
        properties: { Name: 'uptimeSeconds', Operator: '+', Value: '1' },
      },
      {
        ref: 'lcd',
        definitionId: 'block.set_lcd_text',
        properties: { BlockName: 'Status LCD', Text: 'Uptime: {uptimeSeconds}s' },
      },
      { ref: 'sensor', definitionId: 'sensor.if_active', properties: { BlockName: 'Door Sensor' } },
      { ref: 'open', definitionId: 'block.door_open', properties: { BlockName: 'Door' } },
      { ref: 'wait', definitionId: 'logic.wait_seconds', properties: { Seconds: '3' } },
      { ref: 'close', definitionId: 'block.door_close', properties: { BlockName: 'Door' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'initOnce', toPort: 'In' },
      { from: 'initOnce', fromPort: 'Next', to: 'initCounter', toPort: 'In' },
      { from: 'initCounter', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'increment', toPort: 'In' },
      { from: 'increment', fromPort: 'Next', to: 'lcd', toPort: 'In' },
      { from: 'lcd', fromPort: 'Next', to: 'sensor', toPort: 'In' },
      { from: 'sensor', fromPort: 'True', to: 'open', toPort: 'In' },
      { from: 'open', fromPort: 'Next', to: 'wait', toPort: 'In' },
      { from: 'wait', fromPort: 'Next', to: 'close', toPort: 'In' },
    ],
  },
]
