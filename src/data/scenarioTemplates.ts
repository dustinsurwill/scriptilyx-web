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

const COLUMN_WIDTH = 300
const ROW_HEIGHT = 170

/** Left-to-right layered ("Sugiyama-style") layout, so branch/merge shaped
 * templates (Battery Charge Router's 4-way split, the Unified template's
 * reconvergence on one input port) come in readable rather than needing to
 * be dragged apart by hand:
 *  - column = longest-path distance from a source (no-incoming-edge) node,
 *    so a node always sits strictly right of everything that leads to it.
 *  - row within a column = a barycenter pass over already-placed
 *    predecessor rows, so a merge node centers under its parents and a
 *    branch's children fan out under it, falling back to template
 *    declaration order for ties/sourceless nodes.
 * Not a general-purpose graph layout (no crossing minimization beyond the
 * one barycenter pass, no cycle support beyond not infinite-looping) —
 * template graphs are small, hand-authored DAGs, so this is deliberately
 * just enough to avoid the old fixed 4-per-row grid's overlap on branches. */
function computeLayout(templateNodes: TemplateNode[], edges: TemplateEdge[]): Map<string, { x: number; y: number }> {
  const order = new Map(templateNodes.map((n, i) => [n.ref, i]))
  const predecessors = new Map<string, string[]>()
  for (const n of templateNodes) predecessors.set(n.ref, [])
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
  for (const n of templateNodes) rankOf(n.ref)

  const columns = new Map<number, string[]>()
  for (const n of templateNodes) {
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
  for (const n of templateNodes) {
    positions.set(n.ref, { x: 60 + rank.get(n.ref)! * COLUMN_WIDTH, y: 60 + row.get(n.ref)! * ROW_HEIGHT })
  }
  return positions
}

/** Turns a template's ref-addressed nodes/edges into a real GraphSaveData —
 * fresh node ids, sequential Numbers, and a layered layout (see
 * computeLayout) driven by the template's own edges. */
export function buildScenarioGraph(
  template: ScenarioTemplate,
  definitionsById: Map<string, NodeDefinition>,
): GraphSaveData {
  const layout = computeLayout(template.nodes, template.edges)
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
    const position = layout.get(templateNode.ref)!
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
