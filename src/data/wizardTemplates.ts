import type { GraphSaveData, NodeDefinition } from '../types/graph'
import { assembleGraph, type RefEdge, type RefNode } from './graphAssembly'

/** Practical, ready-to-use scripts an average player would actually want,
 * collected through a short form (see WizardModal.tsx) rather than loaded
 * as-is — deliberately separate from src/data/scenarioTemplates.ts, which
 * is static worked examples showing off what the graph editor/codegen can
 * do. A wizard's nodes carry `{param}`-style placeholders in their
 * property overrides; buildWizardGraph substitutes each parameter's
 * collected value in before assembling the graph. */
export interface WizardParameter {
  id: string
  label: string
  type: 'text' | 'number'
  default: string
  help?: string
}

export interface WizardTemplate {
  id: string
  title: string
  description: string
  parameters: WizardParameter[]
  nodes: RefNode[]
  edges: RefEdge[]
}

function substitute(properties: Record<string, string> | undefined, values: Record<string, string>): Record<string, string> | undefined {
  if (!properties) return properties
  const result: Record<string, string> = {}
  for (const [key, raw] of Object.entries(properties)) {
    result[key] = raw.replace(/\{(\w+)\}/g, (match, paramId) => (paramId in values ? values[paramId] : match))
  }
  return result
}

/** Applies the collected parameter values (falling back to each
 * parameter's default for anything not supplied) and assembles the graph
 * the same way a scenario template does. */
export function buildWizardGraph(
  template: WizardTemplate,
  values: Record<string, string>,
  definitionsById: Map<string, NodeDefinition>,
): GraphSaveData {
  const resolved: Record<string, string> = {}
  for (const param of template.parameters) resolved[param.id] = values[param.id]?.trim() || param.default
  const nodes = template.nodes.map((n) => ({ ...n, properties: substitute(n.properties, resolved) }))
  return assembleGraph(nodes, template.edges, definitionsById, `Wizard "${template.id}"`)
}

export const wizardTemplates: WizardTemplate[] = [
  {
    id: 'airlock_cycler',
    title: 'Airlock Cycler',
    description:
      'Cycles a two-door airlock on command: closes the inner door, depressurizes, opens the outer door, then reverses on the way back in. Bind a cockpit/button-panel toolbar slot to "Run this Programmable Block with argument: cycle".',
    parameters: [
      { id: 'innerDoor', label: 'Inner door name', type: 'text', default: 'Inner Door' },
      { id: 'outerDoor', label: 'Outer door name', type: 'text', default: 'Outer Door' },
      { id: 'vent', label: 'Air vent name', type: 'text', default: 'Air Vent' },
      { id: 'ventSeconds', label: 'Depressurize/pressurize time (s)', type: 'number', default: '3' },
      { id: 'transitSeconds', label: 'Time outer door stays open (s)', type: 'number', default: '5' },
    ],
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'trigger', definitionId: 'logic.if_argument_equals', properties: { Argument: 'cycle' } },
      { ref: 'closeInner', definitionId: 'block.door_close', properties: { BlockName: '{innerDoor}' } },
      { ref: 'depressurize', definitionId: 'utility.airvent_depressurize_set', properties: { BlockName: '{vent}', Enabled: 'true' } },
      { ref: 'waitDepress', definitionId: 'logic.wait_seconds', properties: { Seconds: '{ventSeconds}' } },
      { ref: 'openOuter', definitionId: 'block.door_open', properties: { BlockName: '{outerDoor}' } },
      { ref: 'waitTransit', definitionId: 'logic.wait_seconds', properties: { Seconds: '{transitSeconds}' } },
      { ref: 'closeOuter', definitionId: 'block.door_close', properties: { BlockName: '{outerDoor}' } },
      { ref: 'pressurize', definitionId: 'utility.airvent_depressurize_set', properties: { BlockName: '{vent}', Enabled: 'false' } },
      { ref: 'waitPressurize', definitionId: 'logic.wait_seconds', properties: { Seconds: '{ventSeconds}' } },
      { ref: 'openInner', definitionId: 'block.door_open', properties: { BlockName: '{innerDoor}' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'closeInner', toPort: 'In' },
      { from: 'closeInner', fromPort: 'Next', to: 'depressurize', toPort: 'In' },
      { from: 'depressurize', fromPort: 'Next', to: 'waitDepress', toPort: 'In' },
      { from: 'waitDepress', fromPort: 'Next', to: 'openOuter', toPort: 'In' },
      { from: 'openOuter', fromPort: 'Next', to: 'waitTransit', toPort: 'In' },
      { from: 'waitTransit', fromPort: 'Next', to: 'closeOuter', toPort: 'In' },
      { from: 'closeOuter', fromPort: 'Next', to: 'pressurize', toPort: 'In' },
      { from: 'pressurize', fromPort: 'Next', to: 'waitPressurize', toPort: 'In' },
      { from: 'waitPressurize', fromPort: 'Next', to: 'openInner', toPort: 'In' },
    ],
  },
  {
    id: 'cargo_full_alert',
    title: 'Cargo Full Alert',
    description:
      'Watches a cargo container and flips a light red (plus an LCD message) once it crosses a fill threshold, back to green below it — handy on a mining ship so you know when to head back and unload.',
    parameters: [
      { id: 'cargo', label: 'Cargo container name', type: 'text', default: 'Cargo Container' },
      { id: 'light', label: 'Status light name', type: 'text', default: 'Status Light' },
      { id: 'lcd', label: 'Status LCD name', type: 'text', default: 'Status LCD' },
      { id: 'thresholdPercent', label: 'Full threshold (%)', type: 'number', default: '90' },
    ],
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '5' } },
      {
        ref: 'full',
        definitionId: 'ext.cargo.threshold',
        properties: { BlockName: '{cargo}', Direction: 'Above', Percent: '{thresholdPercent}' },
      },
      { ref: 'lightRed', definitionId: 'block.light_color', properties: { BlockName: '{light}', Red: '255', Green: '0', Blue: '0' } },
      { ref: 'lcdFull', definitionId: 'block.set_lcd_text', properties: { BlockName: '{lcd}', Text: 'Cargo full — return to base' } },
      { ref: 'lightGreen', definitionId: 'block.light_color', properties: { BlockName: '{light}', Red: '0', Green: '255', Blue: '0' } },
      { ref: 'lcdOk', definitionId: 'block.set_lcd_text', properties: { BlockName: '{lcd}', Text: 'Cargo OK' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'full', toPort: 'In' },
      { from: 'full', fromPort: 'True', to: 'lightRed', toPort: 'In' },
      { from: 'lightRed', fromPort: 'Next', to: 'lcdFull', toPort: 'In' },
      { from: 'full', fromPort: 'False', to: 'lightGreen', toPort: 'In' },
      { from: 'lightGreen', fromPort: 'Next', to: 'lcdOk', toPort: 'In' },
    ],
  },
  {
    id: 'auto_cockpit_lights',
    title: 'Auto Cockpit Lights',
    description:
      'Turns an interior light group on while you’re sitting in the cockpit, off when you leave. A small quality-of-life touch vanilla can’t do on its own — block/group actions don’t react to "someone’s piloting".',
    parameters: [
      { id: 'cockpit', label: 'Cockpit name', type: 'text', default: 'Cockpit' },
      { id: 'lightGroup', label: 'Light group name', type: 'text', default: 'Interior Lights' },
    ],
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '1' } },
      { ref: 'piloted', definitionId: 'ext.ship.if_under_control', properties: { BlockName: '{cockpit}' } },
      { ref: 'lightsOn', definitionId: 'block.group_set_enabled', properties: { GroupName: '{lightGroup}', Enabled: 'true' } },
      { ref: 'lightsOff', definitionId: 'block.group_set_enabled', properties: { GroupName: '{lightGroup}', Enabled: 'false' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'piloted', toPort: 'In' },
      { from: 'piloted', fromPort: 'True', to: 'lightsOn', toPort: 'In' },
      { from: 'piloted', fromPort: 'False', to: 'lightsOff', toPort: 'In' },
    ],
  },
]
