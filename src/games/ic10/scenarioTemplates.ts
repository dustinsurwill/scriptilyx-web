import type { NodeDefinition, GraphSaveData } from '../../types/graph'
import { assembleGraph, type RefEdge, type RefNode } from '../../lib/graphAssembly'

export interface ScenarioTemplate {
  id: string
  title: string
  tier: 'Beginner' | 'Advanced'
  description: string
  nodes: RefNode[]
  edges: RefEdge[]
}

/** Turns a template's ref-addressed nodes/edges into a real GraphSaveData
 * as-is — no parameters, no modal. Mirrors
 * src/games/space-engineers/scenarioTemplates.ts's role for this game. */
export function buildScenarioGraph(
  template: ScenarioTemplate,
  definitionsById: Map<string, NodeDefinition>,
): GraphSaveData {
  return assembleGraph(template.nodes, template.edges, definitionsById, `Scenario template "${template.id}"`)
}

export const scenarioTemplates: ScenarioTemplate[] = [
  {
    id: 'beginner.solar_tracker',
    title: 'Solar Tracker',
    tier: 'Beginner',
    description:
      'Copies a Daylight Sensor\'s Horizontal/Vertical angle onto every Solar Panel on the network, once a second. Uses Batch Write (network-wide by device type) instead of per-panel pins, so this works unchanged whether there\'s 1 panel or 50 — no per-panel wiring or parameters needed. In-game, set the Daylight Sensor\'s own Mode to tracking so its Horizontal/Vertical actually follow the sun.',
    nodes: [
      { ref: 'start', definitionId: 'ic10.start' },
      {
        ref: 'readH',
        definitionId: 'ic10.device.read',
        properties: {
          Device: 'd0',
          DeviceType: 'Sensors: Daylight Sensor',
          LogicType: 'Horizontal',
          Name: 'sunHorizontal',
        },
      },
      {
        ref: 'readV',
        definitionId: 'ic10.device.read',
        properties: {
          Device: 'd0',
          DeviceType: 'Sensors: Daylight Sensor',
          LogicType: 'Vertical',
          Name: 'sunVertical',
        },
      },
      {
        ref: 'writeH',
        definitionId: 'ic10.batch.write',
        properties: { DeviceType: 'Solar Panel', LogicType: 'Horizontal', Value: 'sunHorizontal' },
      },
      {
        ref: 'writeV',
        definitionId: 'ic10.batch.write',
        properties: { DeviceType: 'Solar Panel', LogicType: 'Vertical', Value: 'sunVertical' },
      },
      { ref: 'pause', definitionId: 'ic10.sleep', properties: { Seconds: '1' } },
      { ref: 'loop', definitionId: 'ic10.loop_to_start' },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'readH', toPort: 'In' },
      { from: 'readH', fromPort: 'Next', to: 'readV', toPort: 'In' },
      { from: 'readV', fromPort: 'Next', to: 'writeH', toPort: 'In' },
      { from: 'writeH', fromPort: 'Next', to: 'writeV', toPort: 'In' },
      { from: 'writeV', fromPort: 'Next', to: 'pause', toPort: 'In' },
      { from: 'pause', fromPort: 'Next', to: 'loop', toPort: 'In' },
    ],
  },
  {
    id: 'beginner.pressure_alarm',
    title: 'Habitat Pressure Alarm',
    tier: 'Beginner',
    description:
      'Reads a Gas Sensor\'s Pressure once a second; below the safe threshold it turns on a Flashing Light and an Active Vent to repressurize, otherwise turns both off. A first look at a Compare node\'s True/False branches converging back onto one shared Sleep before looping.',
    nodes: [
      { ref: 'start', definitionId: 'ic10.start' },
      {
        ref: 'readPressure',
        definitionId: 'ic10.device.read',
        properties: { Device: 'd0', DeviceType: 'Sensors: Gas Sensor', LogicType: 'Pressure', Name: 'pressure' },
      },
      {
        ref: 'checkPressure',
        definitionId: 'ic10.compare',
        properties: { ValueA: 'pressure', Operator: 'LessThan', ValueB: '80' },
      },
      {
        ref: 'alarmOn',
        definitionId: 'ic10.device.write',
        properties: { Device: 'd1', DeviceType: 'Flashing Light', LogicType: 'On', Value: '1' },
      },
      {
        ref: 'ventOn',
        definitionId: 'ic10.device.write',
        properties: { Device: 'd2', DeviceType: 'Active Vent', LogicType: 'On', Value: '1' },
      },
      {
        ref: 'alarmOff',
        definitionId: 'ic10.device.write',
        properties: { Device: 'd1', DeviceType: 'Flashing Light', LogicType: 'On', Value: '0' },
      },
      {
        ref: 'ventOff',
        definitionId: 'ic10.device.write',
        properties: { Device: 'd2', DeviceType: 'Active Vent', LogicType: 'On', Value: '0' },
      },
      { ref: 'pause', definitionId: 'ic10.sleep', properties: { Seconds: '1' } },
      { ref: 'loop', definitionId: 'ic10.loop_to_start' },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'readPressure', toPort: 'In' },
      { from: 'readPressure', fromPort: 'Next', to: 'checkPressure', toPort: 'In' },
      { from: 'checkPressure', fromPort: 'True', to: 'alarmOn', toPort: 'In' },
      { from: 'alarmOn', fromPort: 'Next', to: 'ventOn', toPort: 'In' },
      { from: 'ventOn', fromPort: 'Next', to: 'pause', toPort: 'In' },
      { from: 'checkPressure', fromPort: 'False', to: 'alarmOff', toPort: 'In' },
      { from: 'alarmOff', fromPort: 'Next', to: 'ventOff', toPort: 'In' },
      { from: 'ventOff', fromPort: 'Next', to: 'pause', toPort: 'In' },
      { from: 'pause', fromPort: 'Next', to: 'loop', toPort: 'In' },
    ],
  },
]
