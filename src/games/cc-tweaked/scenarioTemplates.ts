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
 * src/games/ic10/scenarioTemplates.ts's role for this game. */
export function buildScenarioGraph(
  template: ScenarioTemplate,
  definitionsById: Map<string, NodeDefinition>,
): GraphSaveData {
  return assembleGraph(template.nodes, template.edges, definitionsById, `Scenario template "${template.id}"`)
}

export const scenarioTemplates: ScenarioTemplate[] = [
  {
    id: 'beginner.tree_farm',
    title: 'Tree Farm',
    tier: 'Beginner',
    description:
      'A turtle sits facing an empty sapling plot. Every 5 seconds it checks whether a tree has grown back; if so, it chops the trunk and replants a sapling from slot 1, otherwise it just waits and checks again. Load slot 1 with saplings before running.',
    nodes: [
      { ref: 'start', definitionId: 'cct.start' },
      { ref: 'wait', definitionId: 'cct.wait_seconds', properties: { Seconds: '5' } },
      { ref: 'detect', definitionId: 'cct.turtle.detect', properties: { Direction: 'Forward' } },
      { ref: 'dig', definitionId: 'cct.turtle.dig', properties: { Direction: 'Forward' } },
      { ref: 'selectSlot', definitionId: 'cct.turtle.select_slot', properties: { Slot: '1' } },
      { ref: 'place', definitionId: 'cct.turtle.place', properties: { Direction: 'Forward' } },
      { ref: 'loop', definitionId: 'cct.loop_to_start' },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'wait', toPort: 'In' },
      { from: 'wait', fromPort: 'Next', to: 'detect', toPort: 'In' },
      { from: 'detect', fromPort: 'True', to: 'dig', toPort: 'In' },
      { from: 'detect', fromPort: 'False', to: 'loop', toPort: 'In' },
      { from: 'dig', fromPort: 'Dug', to: 'selectSlot', toPort: 'In' },
      { from: 'dig', fromPort: 'Empty', to: 'selectSlot', toPort: 'In' },
      { from: 'selectSlot', fromPort: 'Next', to: 'place', toPort: 'In' },
      { from: 'place', fromPort: 'Placed', to: 'loop', toPort: 'In' },
      { from: 'place', fromPort: 'Failed', to: 'loop', toPort: 'In' },
    ],
  },
  {
    id: 'beginner.tunnel_miner',
    title: 'Tunnel Miner',
    tier: 'Beginner',
    description:
      'A turtle digs and moves forward in a straight line forever, checking its fuel level first each cycle. Out of fuel, it prints a warning and keeps rechecking every 10 seconds instead of stopping outright, so refueling it mid-run (from another program, or by hand) picks the tunnel back up automatically.',
    nodes: [
      { ref: 'start', definitionId: 'cct.start' },
      { ref: 'getFuel', definitionId: 'cct.turtle.get_fuel_level', properties: { Name: 'fuel' } },
      { ref: 'compareFuel', definitionId: 'cct.compare', properties: { ValueA: 'fuel', Operator: '>', ValueB: '0' } },
      { ref: 'dig', definitionId: 'cct.turtle.dig', properties: { Direction: 'Forward' } },
      { ref: 'move', definitionId: 'cct.turtle.move_forward' },
      { ref: 'warn', definitionId: 'cct.print', properties: { Text: 'Out of fuel — waiting for a refuel...' } },
      { ref: 'waitLow', definitionId: 'cct.wait_seconds', properties: { Seconds: '10' } },
      { ref: 'loop', definitionId: 'cct.loop_to_start' },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'getFuel', toPort: 'In' },
      { from: 'getFuel', fromPort: 'Next', to: 'compareFuel', toPort: 'In' },
      { from: 'compareFuel', fromPort: 'True', to: 'dig', toPort: 'In' },
      { from: 'compareFuel', fromPort: 'False', to: 'warn', toPort: 'In' },
      { from: 'dig', fromPort: 'Dug', to: 'move', toPort: 'In' },
      { from: 'dig', fromPort: 'Empty', to: 'move', toPort: 'In' },
      { from: 'move', fromPort: 'Moved', to: 'loop', toPort: 'In' },
      { from: 'move', fromPort: 'Blocked', to: 'loop', toPort: 'In' },
      { from: 'warn', fromPort: 'Next', to: 'waitLow', toPort: 'In' },
      { from: 'waitLow', fromPort: 'Next', to: 'loop', toPort: 'In' },
    ],
  },
  {
    id: 'beginner.chest_space_monitor',
    title: 'Chest Space Monitor',
    tier: 'Beginner',
    description:
      'Every 5 seconds, counts how many slots are occupied in a chest (wired peripheral, default side "right") out of its total slot count, and writes "used/total slots used" to a monitor (default side "top"). Counting occupied slots needs a small loop over the chest\'s item list — nothing in the catalog covers that directly, so this is a good first look at the Custom Code node as the escape hatch for the rare gap a dedicated node doesn\'t reach.',
    nodes: [
      { ref: 'start', definitionId: 'cct.start' },
      { ref: 'wait', definitionId: 'cct.wait_seconds', properties: { Seconds: '5' } },
      {
        ref: 'check',
        definitionId: 'cct.custom_code',
        properties: {
          Code: [
            'local items = peripheral.call("right", "list")',
            'local occupied = 0',
            'for _ in pairs(items) do occupied = occupied + 1 end',
            'local total = peripheral.call("right", "size")',
            'peripheral.call("top", "clear")',
            'peripheral.call("top", "setCursorPos", 1, 1)',
            'peripheral.call("top", "write", occupied .. "/" .. total .. " slots used")',
          ].join('\n'),
        },
      },
      { ref: 'loop', definitionId: 'cct.loop_to_start' },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'wait', toPort: 'In' },
      { from: 'wait', fromPort: 'Next', to: 'check', toPort: 'In' },
      { from: 'check', fromPort: 'Next', to: 'loop', toPort: 'In' },
    ],
  },
]
