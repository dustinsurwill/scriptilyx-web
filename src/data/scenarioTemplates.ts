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
    id: 'beginner.remote_command_panel',
    title: 'Remote Command Panel',
    tier: 'Beginner',
    description:
      'One Programmable Block, run with different toolbar/timer arguments ("startup", "shutdown", "status"), does three different things. Vanilla needs a separate button/timer per action; Command Router dispatches on the run argument instead — a first look at multi-way branching (a node with more than two outputs).',
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'router', definitionId: 'logic.command_router' },
      {
        ref: 'groupOn',
        definitionId: 'block.group_set_enabled',
        properties: { GroupName: 'Thrusters', Enabled: 'true' },
      },
      {
        ref: 'groupOff',
        definitionId: 'block.group_set_enabled',
        properties: { GroupName: 'Thrusters', Enabled: 'false' },
      },
      {
        ref: 'statusLcd',
        definitionId: 'block.set_lcd_text',
        properties: { BlockName: 'Status LCD', Text: 'Systems OK' },
      },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'router', toPort: 'In' },
      { from: 'router', fromPort: 'startup', to: 'groupOn', toPort: 'In' },
      { from: 'router', fromPort: 'shutdown', to: 'groupOff', toPort: 'In' },
      { from: 'router', fromPort: 'status', to: 'statusLcd', toPort: 'In' },
    ],
  },
  {
    id: 'advanced.door_traffic_counter',
    title: 'Door Traffic Counter',
    tier: 'Advanced',
    description:
      'A sensor alone can already open/close a door in vanilla — this does something a sensor can\'t: it counts how many times the door has opened, keeps that count across world saves/reloads (Save/Load Variable), and guards against re-counting the same visit every tick the sensor stays tripped by checking the door is actually Closed first. Shows Storage persistence and a debounce branch (two real outcomes: open-and-count vs. already-open-so-skip).',
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'initOnce', definitionId: 'logic.run_once_on_world_load' },
      {
        ref: 'loadCounter',
        definitionId: 'ext.storage.load',
        properties: { VariableName: 'doorOpens', StorageKey: 'doorOpens', Type: 'Number' },
      },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '1' } },
      { ref: 'sensor', definitionId: 'sensor.if_active', properties: { BlockName: 'Door Sensor' } },
      { ref: 'doorClosed', definitionId: 'check.door_state', properties: { BlockName: 'Door', State: 'Closed' } },
      { ref: 'open', definitionId: 'block.door_open', properties: { BlockName: 'Door' } },
      {
        ref: 'increment',
        definitionId: 'var.number_math',
        properties: { Name: 'doorOpens', Operator: '+', Value: '1' },
      },
      {
        ref: 'saveCounter',
        definitionId: 'ext.storage.save',
        properties: { VariableName: 'doorOpens', StorageKey: 'doorOpens', Type: 'Number' },
      },
      {
        ref: 'lcd',
        definitionId: 'block.set_lcd_text',
        properties: { BlockName: 'Door Counter LCD', Text: 'Door opened {doorOpens} times' },
      },
      { ref: 'wait', definitionId: 'logic.wait_seconds', properties: { Seconds: '5' } },
      { ref: 'close', definitionId: 'block.door_close', properties: { BlockName: 'Door' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'initOnce', toPort: 'In' },
      { from: 'initOnce', fromPort: 'Next', to: 'loadCounter', toPort: 'In' },
      { from: 'loadCounter', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'sensor', toPort: 'In' },
      { from: 'sensor', fromPort: 'True', to: 'doorClosed', toPort: 'In' },
      { from: 'doorClosed', fromPort: 'True', to: 'open', toPort: 'In' },
      { from: 'open', fromPort: 'Next', to: 'increment', toPort: 'In' },
      { from: 'increment', fromPort: 'Next', to: 'saveCounter', toPort: 'In' },
      { from: 'saveCounter', fromPort: 'Next', to: 'lcd', toPort: 'In' },
      { from: 'lcd', fromPort: 'Next', to: 'wait', toPort: 'In' },
      { from: 'wait', fromPort: 'Next', to: 'close', toPort: 'In' },
    ],
  },
  {
    id: 'advanced.battery_alert_dashboard',
    title: 'Battery Alert Dashboard',
    tier: 'Advanced',
    description:
      'Vanilla Event Controllers can each fire one action past one threshold, so a 4-tier "critical/low/normal/full" status light needs three or four of them configured separately. Battery Charge Router does all four tiers as one node with four outputs — a clearer look at multi-way branching than a plain if/else.',
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '2' } },
      {
        ref: 'router',
        definitionId: 'ext.battery.charge_router',
        properties: { BlockName: 'Battery', CriticalBelow: '15', LowBelow: '30', FullAbove: '95' },
      },
      {
        ref: 'lightCritical',
        definitionId: 'block.light_color',
        properties: { BlockName: 'Status Light', Red: '255', Green: '0', Blue: '0' },
      },
      {
        ref: 'lcdCritical',
        definitionId: 'block.set_lcd_text',
        properties: { BlockName: 'Battery LCD', Text: 'CRITICAL: battery low!' },
      },
      {
        ref: 'lightLow',
        definitionId: 'block.light_color',
        properties: { BlockName: 'Status Light', Red: '255', Green: '165', Blue: '0' },
      },
      {
        ref: 'lightNormal',
        definitionId: 'block.light_color',
        properties: { BlockName: 'Status Light', Red: '0', Green: '255', Blue: '0' },
      },
      {
        ref: 'lightFull',
        definitionId: 'block.light_color',
        properties: { BlockName: 'Status Light', Red: '0', Green: '100', Blue: '255' },
      },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'router', toPort: 'In' },
      { from: 'router', fromPort: 'Critical', to: 'lightCritical', toPort: 'In' },
      { from: 'lightCritical', fromPort: 'Next', to: 'lcdCritical', toPort: 'In' },
      { from: 'router', fromPort: 'Low', to: 'lightLow', toPort: 'In' },
      { from: 'router', fromPort: 'Normal', to: 'lightNormal', toPort: 'In' },
      { from: 'router', fromPort: 'Full', to: 'lightFull', toPort: 'In' },
    ],
  },
  {
    id: 'unified.dashboard_and_traffic_counter',
    title: 'Battery Dashboard + Door Traffic Counter',
    tier: 'Unified',
    description:
      'Combines the Battery Alert Dashboard and Door Traffic Counter under one Start and one per-second trigger: every tick, all four battery-status branches reconverge on the same door-sensor check (an input port can take wires from more than one source), which then runs the persisted-counter/debounce door logic. One script, one trigger, two independent behaviors that both branch and merge back together.',
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'initOnce', definitionId: 'logic.run_once_on_world_load' },
      {
        ref: 'loadCounter',
        definitionId: 'ext.storage.load',
        properties: { VariableName: 'doorOpens', StorageKey: 'doorOpens', Type: 'Number' },
      },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '1' } },
      {
        ref: 'router',
        definitionId: 'ext.battery.charge_router',
        properties: { BlockName: 'Battery', CriticalBelow: '15', LowBelow: '30', FullAbove: '95' },
      },
      {
        ref: 'lightCritical',
        definitionId: 'block.light_color',
        properties: { BlockName: 'Status Light', Red: '255', Green: '0', Blue: '0' },
      },
      {
        ref: 'lightLow',
        definitionId: 'block.light_color',
        properties: { BlockName: 'Status Light', Red: '255', Green: '165', Blue: '0' },
      },
      {
        ref: 'lightNormal',
        definitionId: 'block.light_color',
        properties: { BlockName: 'Status Light', Red: '0', Green: '255', Blue: '0' },
      },
      {
        ref: 'lightFull',
        definitionId: 'block.light_color',
        properties: { BlockName: 'Status Light', Red: '0', Green: '100', Blue: '255' },
      },
      { ref: 'sensor', definitionId: 'sensor.if_active', properties: { BlockName: 'Door Sensor' } },
      { ref: 'doorClosed', definitionId: 'check.door_state', properties: { BlockName: 'Door', State: 'Closed' } },
      { ref: 'open', definitionId: 'block.door_open', properties: { BlockName: 'Door' } },
      {
        ref: 'increment',
        definitionId: 'var.number_math',
        properties: { Name: 'doorOpens', Operator: '+', Value: '1' },
      },
      {
        ref: 'saveCounter',
        definitionId: 'ext.storage.save',
        properties: { VariableName: 'doorOpens', StorageKey: 'doorOpens', Type: 'Number' },
      },
      {
        ref: 'lcd',
        definitionId: 'block.set_lcd_text',
        properties: { BlockName: 'Door Counter LCD', Text: 'Door opened {doorOpens} times' },
      },
      { ref: 'wait', definitionId: 'logic.wait_seconds', properties: { Seconds: '5' } },
      { ref: 'close', definitionId: 'block.door_close', properties: { BlockName: 'Door' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'initOnce', toPort: 'In' },
      { from: 'initOnce', fromPort: 'Next', to: 'loadCounter', toPort: 'In' },
      { from: 'loadCounter', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'router', toPort: 'In' },
      { from: 'router', fromPort: 'Critical', to: 'lightCritical', toPort: 'In' },
      { from: 'router', fromPort: 'Low', to: 'lightLow', toPort: 'In' },
      { from: 'router', fromPort: 'Normal', to: 'lightNormal', toPort: 'In' },
      { from: 'router', fromPort: 'Full', to: 'lightFull', toPort: 'In' },
      { from: 'lightCritical', fromPort: 'Next', to: 'sensor', toPort: 'In' },
      { from: 'lightLow', fromPort: 'Next', to: 'sensor', toPort: 'In' },
      { from: 'lightNormal', fromPort: 'Next', to: 'sensor', toPort: 'In' },
      { from: 'lightFull', fromPort: 'Next', to: 'sensor', toPort: 'In' },
      { from: 'sensor', fromPort: 'True', to: 'doorClosed', toPort: 'In' },
      { from: 'doorClosed', fromPort: 'True', to: 'open', toPort: 'In' },
      { from: 'open', fromPort: 'Next', to: 'increment', toPort: 'In' },
      { from: 'increment', fromPort: 'Next', to: 'saveCounter', toPort: 'In' },
      { from: 'saveCounter', fromPort: 'Next', to: 'lcd', toPort: 'In' },
      { from: 'lcd', fromPort: 'Next', to: 'wait', toPort: 'In' },
      { from: 'wait', fromPort: 'Next', to: 'close', toPort: 'In' },
    ],
  },
]
