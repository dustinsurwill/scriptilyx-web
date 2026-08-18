import type { GraphSaveData, NodeDefinition } from '../../types/graph'
import { assembleGraph, type RefEdge, type RefNode } from '../../lib/graphAssembly'

/** Practical, ready-to-use scripts an average player would actually want,
 * collected through a short form (see WizardModal.tsx) rather than loaded
 * as-is — deliberately separate from src/data/scenarioTemplates.ts, which
 * is static worked examples showing off what the graph editor/codegen can
 * do. Unlike a scenario template's fixed nodes/edges, a wizard's `build`
 * function constructs the graph from the collected parameter values, so a
 * combo parameter can change which nodes get used (e.g. a single cargo
 * block vs. a whole group), not just which text goes in a property. */
export interface WizardParameter {
  id: string
  label: string
  type: 'text' | 'number' | 'combo'
  default: string
  /** Required when type is 'combo'. */
  options?: string[]
}

export interface WizardTemplate {
  id: string
  title: string
  description: string
  parameters: WizardParameter[]
  build: (values: Record<string, string>) => { nodes: RefNode[]; edges: RefEdge[] }
}

/** Applies the collected parameter values (falling back to each
 * parameter's default for anything blank/missing), builds the wizard's
 * graph, and assembles it the same way a scenario template does. */
export function buildWizardGraph(
  template: WizardTemplate,
  values: Record<string, string>,
  definitionsById: Map<string, NodeDefinition>,
): GraphSaveData {
  const resolved: Record<string, string> = {}
  for (const param of template.parameters) resolved[param.id] = values[param.id]?.trim() || param.default
  const { nodes, edges } = template.build(resolved)
  return assembleGraph(nodes, edges, definitionsById, `Wizard "${template.id}"`)
}

/** A "wait until ready" step used twice by the Airlock Cycler (once
 * depressurizing, once pressurizing) — built differently depending on
 * `mode`:
 *  - 'Time': a plain timed wait (the old fixed-delay behavior).
 *  - 'Pressure': waits on the air vent's own oxygen-level check, no
 *    timeout — correct as long as the vent can actually reach the target
 *    level, but stalls forever if it can't (e.g. a full hydrogen/oxygen
 *    tank preventing full depressurization).
 *  - 'Both': checks pressure first; if not yet there, also runs a timed
 *    wait in parallel (fed by the pressure check's False branch), so
 *    whichever condition is satisfied first — real pressure reached, or
 *    the timeout — lets the sequence continue. This is the "in case the
 *    tank is full" fallback.
 * Every branch here is safe to re-enter every tick (see buildAirlockCycler
 * below for why that matters): the pressure check just reads live state,
 * and Wait Seconds' own persisted elapsed-time key handles being called
 * repeatedly on its own. */
function waitGate(
  refPrefix: string,
  mode: string,
  ventCheckId: 'ext.vent.if_depressurized' | 'ext.vent.if_pressurized',
  vent: string,
  percent: string,
  timeoutSeconds: string,
): { nodes: RefNode[]; edges: RefEdge[]; entryRef: string; exits: { ref: string; port: string }[] } {
  if (mode === 'Time') {
    const ref = `${refPrefix}Wait`
    return {
      nodes: [{ ref, definitionId: 'logic.wait_seconds', properties: { Seconds: timeoutSeconds } }],
      edges: [],
      entryRef: ref,
      exits: [{ ref, port: 'Next' }],
    }
  }
  if (mode === 'Pressure') {
    const ref = `${refPrefix}Check`
    return {
      nodes: [{ ref, definitionId: ventCheckId, properties: { BlockName: vent, Percent: percent } }],
      edges: [],
      entryRef: ref,
      exits: [{ ref, port: 'True' }],
    }
  }
  // 'Both'
  const checkRef = `${refPrefix}Check`
  const waitRef = `${refPrefix}Wait`
  return {
    nodes: [
      { ref: checkRef, definitionId: ventCheckId, properties: { BlockName: vent, Percent: percent } },
      { ref: waitRef, definitionId: 'logic.wait_seconds', properties: { Seconds: timeoutSeconds } },
    ],
    edges: [{ from: checkRef, fromPort: 'False', to: waitRef, toPort: 'In' }],
    entryRef: checkRef,
    exits: [
      { ref: checkRef, port: 'True' },
      { ref: waitRef, port: 'Next' },
    ],
  }
}

/** Cycles a two-door airlock on an argument trigger. The naive design
 * (argument check gating the whole close/wait/open/.../open sequence
 * directly) only half-works: IfArgumentEquals is only true on the single
 * tick the "cycle" argument is actually passed, so anything chained after
 * a Wait Seconds past that point would never get revisited on later ticks
 * and the sequence would stall forever after the first wait. Instead, the
 * argument only flips a persisted "airlockCycling" bool flag; a fast
 * Run Every Seconds heartbeat re-walks the *entire* close/wait/open/.../
 * open chain every tick as long as that flag is set (every step in the
 * chain — closing an already-closed door, re-enabling depressurize that's
 * already enabled, re-checking a wait/pressure gate — is a safe no-op to
 * repeat), and the last step clears the flag to stop. */
function buildAirlockCycler(values: Record<string, string>): { nodes: RefNode[]; edges: RefEdge[] } {
  const { innerDoor, outerDoor, vent, waitMode, ventSeconds, pressurePercent, transitSeconds } = values
  const pressurizePercent = String(Math.max(0, 100 - Number(pressurePercent)))

  const nodes: RefNode[] = [
    { ref: 'start', definitionId: 'logic.start' },
    { ref: 'heartbeat', definitionId: 'logic.run_every_seconds', properties: { Seconds: '0.5' } },
    { ref: 'argCheck', definitionId: 'logic.if_argument_equals', properties: { Argument: 'cycle' } },
    { ref: 'startCycling', definitionId: 'ext.bool.set', properties: { Name: 'airlockCycling', Value: 'true' } },
    { ref: 'dispatch', definitionId: 'ext.bool.if', properties: { Name: 'airlockCycling', Value: 'True' } },
    { ref: 'closeInner', definitionId: 'block.door_close', properties: { BlockName: innerDoor } },
    { ref: 'depressurize', definitionId: 'utility.airvent_depressurize_set', properties: { BlockName: vent, Enabled: 'true' } },
    { ref: 'openOuter', definitionId: 'block.door_open', properties: { BlockName: outerDoor } },
    { ref: 'waitTransit', definitionId: 'logic.wait_seconds', properties: { Seconds: transitSeconds } },
    { ref: 'closeOuter', definitionId: 'block.door_close', properties: { BlockName: outerDoor } },
    { ref: 'pressurize', definitionId: 'utility.airvent_depressurize_set', properties: { BlockName: vent, Enabled: 'false' } },
    { ref: 'openInner', definitionId: 'block.door_open', properties: { BlockName: innerDoor } },
    { ref: 'stopCycling', definitionId: 'ext.bool.set', properties: { Name: 'airlockCycling', Value: 'false' } },
  ]
  const edges: RefEdge[] = [
    { from: 'start', fromPort: 'Next', to: 'heartbeat', toPort: 'In' },
    { from: 'heartbeat', fromPort: 'True', to: 'argCheck', toPort: 'In' },
    { from: 'argCheck', fromPort: 'True', to: 'startCycling', toPort: 'In' },
    { from: 'startCycling', fromPort: 'Next', to: 'dispatch', toPort: 'In' },
    { from: 'argCheck', fromPort: 'False', to: 'dispatch', toPort: 'In' },
    { from: 'dispatch', fromPort: 'True', to: 'closeInner', toPort: 'In' },
    { from: 'closeInner', fromPort: 'Next', to: 'depressurize', toPort: 'In' },
    { from: 'openOuter', fromPort: 'Next', to: 'waitTransit', toPort: 'In' },
    { from: 'waitTransit', fromPort: 'Next', to: 'closeOuter', toPort: 'In' },
    { from: 'closeOuter', fromPort: 'Next', to: 'pressurize', toPort: 'In' },
    { from: 'openInner', fromPort: 'Next', to: 'stopCycling', toPort: 'In' },
  ]

  const depressGate = waitGate('depress', waitMode, 'ext.vent.if_depressurized', vent, pressurePercent, ventSeconds)
  nodes.push(...depressGate.nodes)
  edges.push(...depressGate.edges)
  edges.push({ from: 'depressurize', fromPort: 'Next', to: depressGate.entryRef, toPort: 'In' })
  for (const exit of depressGate.exits) edges.push({ from: exit.ref, fromPort: exit.port, to: 'openOuter', toPort: 'In' })

  const pressGate = waitGate('press', waitMode, 'ext.vent.if_pressurized', vent, pressurizePercent, ventSeconds)
  nodes.push(...pressGate.nodes)
  edges.push(...pressGate.edges)
  edges.push({ from: 'pressurize', fromPort: 'Next', to: pressGate.entryRef, toPort: 'In' })
  for (const exit of pressGate.exits) edges.push({ from: exit.ref, fromPort: exit.port, to: 'openInner', toPort: 'In' })

  return { nodes, edges }
}

function buildCargoFullAlert(values: Record<string, string>): { nodes: RefNode[]; edges: RefEdge[] } {
  const { targetType, targetName, light, lcd, thresholdPercent } = values
  const checkNode: RefNode =
    targetType === 'Group'
      ? { ref: 'full', definitionId: 'ext.cargo.group_threshold', properties: { GroupName: targetName, Direction: 'Above', Percent: thresholdPercent } }
      : { ref: 'full', definitionId: 'ext.cargo.threshold', properties: { BlockName: targetName, Direction: 'Above', Percent: thresholdPercent } }

  return {
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '5' } },
      checkNode,
      { ref: 'lightRed', definitionId: 'block.light_color', properties: { BlockName: light, Red: '255', Green: '0', Blue: '0' } },
      { ref: 'lcdFull', definitionId: 'block.set_lcd_text', properties: { BlockName: lcd, Text: 'Cargo full — return to base' } },
      { ref: 'lightGreen', definitionId: 'block.light_color', properties: { BlockName: light, Red: '0', Green: '255', Blue: '0' } },
      { ref: 'lcdOk', definitionId: 'block.set_lcd_text', properties: { BlockName: lcd, Text: 'Cargo OK' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'full', toPort: 'In' },
      { from: 'full', fromPort: 'True', to: 'lightRed', toPort: 'In' },
      { from: 'lightRed', fromPort: 'Next', to: 'lcdFull', toPort: 'In' },
      { from: 'full', fromPort: 'False', to: 'lightGreen', toPort: 'In' },
      { from: 'lightGreen', fromPort: 'Next', to: 'lcdOk', toPort: 'In' },
    ],
  }
}

/** Lights OFF while piloted, ON while away — e.g. so interior lights don't
 * wash out a dark cockpit HUD while flying, but come back on for walking
 * around the ship. */
function buildAutoCockpitLights(values: Record<string, string>): { nodes: RefNode[]; edges: RefEdge[] } {
  const { cockpit, lightGroup } = values
  return {
    nodes: [
      { ref: 'start', definitionId: 'logic.start' },
      { ref: 'trigger', definitionId: 'logic.run_every_seconds', properties: { Seconds: '1' } },
      { ref: 'piloted', definitionId: 'ext.ship.if_under_control', properties: { BlockName: cockpit } },
      { ref: 'lightsOff', definitionId: 'block.group_set_enabled', properties: { GroupName: lightGroup, Enabled: 'false' } },
      { ref: 'lightsOn', definitionId: 'block.group_set_enabled', properties: { GroupName: lightGroup, Enabled: 'true' } },
    ],
    edges: [
      { from: 'start', fromPort: 'Next', to: 'trigger', toPort: 'In' },
      { from: 'trigger', fromPort: 'True', to: 'piloted', toPort: 'In' },
      { from: 'piloted', fromPort: 'True', to: 'lightsOff', toPort: 'In' },
      { from: 'piloted', fromPort: 'False', to: 'lightsOn', toPort: 'In' },
    ],
  }
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
      {
        id: 'waitMode',
        label: 'How to know depressurize/pressurize is done',
        type: 'combo',
        options: ['Pressure', 'Time', 'Both'],
        default: 'Pressure',
      },
      {
        id: 'pressurePercent',
        label: 'Oxygen % treated as "empty" (Pressure/Both modes; "full" = 100 minus this)',
        type: 'number',
        default: '2',
      },
      {
        id: 'ventSeconds',
        label: 'Depressurize/pressurize time — fixed wait (Time mode) or timeout (Both mode), seconds',
        type: 'number',
        default: '3',
      },
      { id: 'transitSeconds', label: 'Time outer door stays open (s)', type: 'number', default: '5' },
    ],
    build: buildAirlockCycler,
  },
  {
    id: 'cargo_full_alert',
    title: 'Cargo Full Alert',
    description:
      'Watches a cargo container (or a whole group of them) and flips a light red (plus an LCD message) once combined fill crosses a threshold, back to green below it — handy on a mining ship so you know when to head back and unload.',
    parameters: [
      {
        id: 'targetType',
        label: 'Watch a single cargo container or a whole group?',
        type: 'combo',
        options: ['Block', 'Group'],
        default: 'Block',
      },
      { id: 'targetName', label: 'Cargo container/group name (matching the choice above)', type: 'text', default: 'Cargo Container' },
      { id: 'light', label: 'Status light name', type: 'text', default: 'Status Light' },
      { id: 'lcd', label: 'Status LCD name', type: 'text', default: 'Status LCD' },
      { id: 'thresholdPercent', label: 'Full threshold (%)', type: 'number', default: '90' },
    ],
    build: buildCargoFullAlert,
  },
  {
    id: 'auto_cockpit_lights',
    title: 'Auto Cockpit Lights',
    description:
      'Turns an interior light group off while you’re sitting in the cockpit (so it doesn’t wash out a dark HUD), back on once you leave. A small quality-of-life touch vanilla can’t do on its own — block/group actions don’t react to "someone’s piloting".',
    parameters: [
      { id: 'cockpit', label: 'Cockpit name', type: 'text', default: 'Cockpit' },
      { id: 'lightGroup', label: 'Light group name', type: 'text', default: 'Interior Lights' },
    ],
    build: buildAutoCockpitLights,
  },
]
