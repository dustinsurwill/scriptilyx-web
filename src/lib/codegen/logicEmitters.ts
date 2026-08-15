import type { ScriptNode } from '../../types/graph'
import { sanitizeIdentifier, stringLiteral } from './format'
import type { NodeEmitter } from './types'

function prop(node: ScriptNode, key: string): string {
  return node.Properties[key] ?? ''
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

export const startEmitter: NodeEmitter = (node, ctx) => ({
  kind: 'raw',
  statements: [ctx.next(node, 'Next')],
})

export const runOnceOnWorldLoadEmitter: NodeEmitter = (node, ctx) => ({
  kind: 'action',
  statements: [ctx.next(node, 'Next')],
})

export const ifArgumentEqualsEmitter: NodeEmitter = (node) => ({
  kind: 'condition',
  expression: `_argument == ${stringLiteral(prop(node, 'Argument'))}`,
})

export const runEverySecondsEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const elapsedKey = stringLiteral(`__runEvery_${node.Id}`)
  const dueKey = stringLiteral(`__runEveryDue_${node.Id}`)
  const seconds = prop(node, 'Seconds') || '0'
  return {
    kind: 'condition',
    statements: [
      `_num[${elapsedKey}] = GetNum(${elapsedKey}) + Runtime.TimeSinceLastRun.TotalSeconds;`,
      `_bool[${dueKey}] = GetNum(${elapsedKey}) >= ${seconds};`,
      `if (GetBool(${dueKey})) _num[${elapsedKey}] = 0;`,
    ],
    expression: `GetBool(${dueKey})`,
  }
}

export const echoEmitter: NodeEmitter = (node, ctx) => ({
  kind: 'action',
  statements: [`Echo(${stringLiteral(prop(node, 'Text'))});`, ctx.next(node, 'Next')],
})

export const setRuntimeUpdateEmitter: NodeEmitter = (node, ctx) => ({
  kind: 'action',
  statements: [
    `Runtime.UpdateFrequency = UpdateFrequency.${prop(node, 'Frequency').trim() || 'None'};`,
    ctx.next(node, 'Next'),
  ],
})

export const noteEmitter: NodeEmitter = (node, ctx) => ({
  kind: 'action',
  statements: [ctx.next(node, 'Next')],
})

export const waitSecondsEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const key = stringLiteral(`__wait_${node.Id}`)
  return {
    kind: 'raw',
    statements: [
      `_num[${key}] = GetNum(${key}) + Runtime.TimeSinceLastRun.TotalSeconds;`,
      `if (GetNum(${key}) < ${prop(node, 'Seconds')}) return;`,
      `_num[${key}] = 0;`,
      ctx.next(node, 'Next'),
    ],
  }
}

export const stopScriptEmitter: NodeEmitter = () => ({
  kind: 'raw',
  statements: [`Runtime.UpdateFrequency = UpdateFrequency.None;`, `return;`],
})

const COMMAND_ROUTER_PORTS = [
  ['StartupArgument', 'startup'],
  ['ShutdownArgument', 'shutdown'],
  ['DockArgument', 'dock'],
  ['UndockArgument', 'undock'],
  ['MineArgument', 'mine'],
  ['StopArgument', 'stop'],
  ['StatusArgument', 'status'],
  ['OpenAirlockArgument', 'open_airlock'],
  ['CloseAirlockArgument', 'close_airlock'],
  ['OpenHangarArgument', 'open_hangar'],
  ['CloseHangarArgument', 'close_hangar'],
] as const

export const commandRouterEmitter: NodeEmitter = (node, ctx) => {
  const lines: string[] = ['switch (_argument) {']
  for (const [propKey, port] of COMMAND_ROUTER_PORTS) {
    const argument = prop(node, propKey)
    if (!argument.trim()) continue
    lines.push(`  case ${stringLiteral(argument)}: ${ctx.next(node, port)} break;`)
  }
  lines.push(`  default: ${ctx.next(node, 'unknown')} break;`)
  lines.push('}')
  return { kind: 'raw', statements: lines }
}

export const numberGreaterRouterEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const name = stringLiteral(prop(node, 'Name'))
  const thresholds: [string, string][] = [
    ['Threshold6', 'Greater6'],
    ['Threshold5', 'Greater5'],
    ['Threshold4', 'Greater4'],
    ['Threshold3', 'Greater3'],
    ['Threshold2', 'Greater2'],
  ]
  const lines: string[] = []
  let opened = 0
  for (const [propKey, port] of thresholds) {
    const value = prop(node, propKey)
    if (!value.trim()) continue
    lines.push(`if (GetNum(${name}) > ${value}) { ${ctx.next(node, port)} }`)
    lines.push(`else {`)
    opened++
  }
  lines.push(ctx.next(node, 'Else'))
  lines.push('}'.repeat(opened))
  return { kind: 'raw', statements: lines }
}

export const repeatTimesEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const key = stringLiteral(`__repeat_${node.Id}`)
  const times = prop(node, 'Times')
  return {
    kind: 'raw',
    statements: [
      `if (GetNum(${key}) < ${times}) { _num[${key}] = GetNum(${key}) + 1; ${ctx.next(node, 'Loop')} }`,
      `else { _num[${key}] = 0; ${ctx.next(node, 'Done')} }`,
    ],
  }
}

export const customCodeEmitter: NodeEmitter = (node, ctx) => ({
  kind: 'raw',
  statements: [prop(node, 'Code') || '// (empty custom code)', ctx.next(node, 'Next')],
})

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

export const setNumberVariableEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  return {
    kind: 'action',
    statements: [`_num[${stringLiteral(prop(node, 'Name'))}] = ${prop(node, 'Value') || '0'};`, ctx.next(node, 'Next')],
  }
}

export const addNumberVariableEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const name = stringLiteral(prop(node, 'Name'))
  return {
    kind: 'action',
    statements: [`_num[${name}] = GetNum(${name}) + (${prop(node, 'AddValue') || '0'});`, ctx.next(node, 'Next')],
  }
}

export const setTextVariableEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  return {
    kind: 'action',
    statements: [
      `_text[${stringLiteral(prop(node, 'Name'))}] = ${stringLiteral(prop(node, 'Value'))};`,
      ctx.next(node, 'Next'),
    ],
  }
}

export const ifNumberLessThanEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  return { kind: 'condition', expression: `GetNum(${stringLiteral(prop(node, 'Name'))}) < ${prop(node, 'Value') || '0'}` }
}

export const ifNumberGreaterThanEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  return { kind: 'condition', expression: `GetNum(${stringLiteral(prop(node, 'Name'))}) > ${prop(node, 'Value') || '0'}` }
}

export const ifTextEqualsEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  return {
    kind: 'condition',
    expression: `GetText(${stringLiteral(prop(node, 'Name'))}) == ${stringLiteral(prop(node, 'Value'))}`,
  }
}

// ---------------------------------------------------------------------------
// Sections / subroutines
// ---------------------------------------------------------------------------

export function sectionMethodName(sectionName: string): string {
  return sanitizeIdentifier('Section', sectionName.replace(/[^a-zA-Z0-9]/g, '_'))
}

export const startSectionEmitter: NodeEmitter = (node, ctx) => ({
  kind: 'raw',
  statements: [ctx.next(node, 'Next')],
})

export const callSectionEmitter: NodeEmitter = (node, ctx) => ({
  kind: 'raw',
  statements: [ctx.callSection(prop(node, 'SectionName'))],
})

export const returnEmitter: NodeEmitter = () => ({ kind: 'raw', statements: ['return;'] })

/** Section nodes are entry points reachable both by normal graph wiring and
 * by name from any CallSection node elsewhere in the graph, so the traversal
 * seeds them as extra roots alongside Start. */
export function findSectionStartNodes(nodes: ScriptNode[]): ScriptNode[] {
  return nodes.filter((n) => n.ActionType === 'StartSection')
}
