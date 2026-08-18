import type { ScriptNode } from '../../../types/graph'
import { interpolatedTextExpr, resolvableNumber, resolvableText } from './factories'
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
  const elapsedKey = stringLiteral(`runEvery_${node.Number}`)
  const dueKey = stringLiteral(`runEveryDue_${node.Number}`)
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
  statements: [`Echo(${interpolatedTextExpr(node, ctx)});`, ctx.next(node, 'Next')],
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
  const key = stringLiteral(`wait_${node.Number}`)
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

/** Routes to one of a user-managed number of `CaseN` outputs by matching
 * `Value` against each case's literal (`CaseNValue`), falling through to
 * `Default` if nothing matches — the dynamic-output-count counterpart to
 * `commandRouterEmitter`'s fixed case set. `node.OutputPorts` is the
 * per-instance array (mutated by the store's addSwitchCase/removeSwitchCase
 * actions), not the catalog definition's, so however many cases this
 * particular node instance has is exactly how many `case` labels get
 * emitted — see ScriptGraphNode/PropertyPanel for how the port count is
 * managed on the canvas. */
export const switchEmitter: NodeEmitter = (node, ctx) => {
  const value = resolvableText(node, 'Value', ctx)
  const casePorts = node.OutputPorts.filter((p) => p !== 'Default')
  const lines: string[] = [`switch (${value}) {`]
  for (const port of casePorts) {
    lines.push(`  case ${stringLiteral(prop(node, `${port}Value`))}: ${ctx.next(node, port)} break;`)
  }
  lines.push(`  default: ${ctx.next(node, 'Default')} break;`)
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
  const key = stringLiteral(`repeat_${node.Number}`)
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

const NUMBER_MATH_OPERATORS = new Set(['+', '-', '*', '/'])

/** Replaces Add/Subtract/Multiply/Divide Number Variable with one node —
 * `Name <Operator>= Value` — preserving Divide's guard against a zero
 * divisor (silently no-op-ing the update, same as the retired node did,
 * rather than crashing the script on a bad Value). */
export const numberMathEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const name = stringLiteral(prop(node, 'Name'))
  const operator = prop(node, 'Operator')
  const op = NUMBER_MATH_OPERATORS.has(operator) ? operator : '+'
  const value = resolvableNumber(node, 'Value', ctx)
  if (op === '/') {
    return {
      kind: 'raw',
      statements: [
        `if ((${value}) == 0) { Echo("Divide by zero: " + ${name}); }`,
        `else { _num[${name}] = GetNum(${name}) / (${value}); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
  return {
    kind: 'action',
    statements: [`_num[${name}] = GetNum(${name}) ${op} (${value});`, ctx.next(node, 'Next')],
  }
}

/** Maps a formula's bare-word function/constant names to their C# `Math.*`
 * equivalent. Anything else that looks like an identifier is treated as a
 * number-variable reference. */
const FORMULA_FUNCTIONS: Record<string, string> = {
  sqrt: 'Math.Sqrt',
  abs: 'Math.Abs',
  min: 'Math.Min',
  max: 'Math.Max',
  floor: 'Math.Floor',
  ceil: 'Math.Ceiling',
  round: 'Math.Round',
  sin: 'Math.Sin',
  cos: 'Math.Cos',
  tan: 'Math.Tan',
  pow: 'Math.Pow',
  pi: 'Math.PI',
}

/** Only arithmetic, parens, commas, and identifiers/numbers are allowed — a
 * Formula property feeds directly into generated C# source, so anything
 * outside this charset (semicolons, braces, quotes...) must be rejected
 * rather than passed through. */
const SAFE_FORMULA = /^[A-Za-z0-9_\s+\-*/().,%]*$/

function compileFormula(raw: string): { expr: string; safe: boolean } {
  const trimmed = raw.trim()
  if (!trimmed) return { expr: '0', safe: true }
  if (!SAFE_FORMULA.test(trimmed)) return { expr: '0', safe: false }
  const expr = trimmed.replace(
    /[A-Za-z_][A-Za-z0-9_]*/g,
    (ident) => FORMULA_FUNCTIONS[ident.toLowerCase()] ?? `GetNum(${stringLiteral(ident)})`,
  )
  return { expr, safe: true }
}

export const calculateEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const formula = prop(node, 'Formula')
  const { expr, safe } = compileFormula(formula)
  const statements = safe
    ? []
    : [`// WARNING: formula ${stringLiteral(formula)} has unsupported characters; using 0`]
  statements.push(`_num[${stringLiteral(prop(node, 'Name'))}] = ${expr};`, ctx.next(node, 'Next'))
  return { kind: 'action', statements }
}

export const setTextVariableEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  return {
    kind: 'action',
    statements: [
      `_text[${stringLiteral(prop(node, 'Name'))}] = ${interpolatedTextExpr(node, ctx, 'Value')};`,
      ctx.next(node, 'Next'),
    ],
  }
}

/** `Name += Value` for text variables — Value supports the same `{name}`
 * interpolation as Set Text Variable/Echo, so this can build up a string
 * from other variables too, not just literal text. */
export const appendTextVariableEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const name = stringLiteral(prop(node, 'Name'))
  return {
    kind: 'action',
    statements: [`_text[${name}] = GetText(${name}) + ${interpolatedTextExpr(node, ctx, 'Value')};`, ctx.next(node, 'Next')],
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

const NUMBER_COMPARE_OPERATORS = new Set(['>', '<', '>=', '<=', '==', '!='])

export const numberCompareEmitter: NodeEmitter = (node, ctx) => {
  ctx.useHelper('Vars')
  const operator = prop(node, 'Operator')
  const op = NUMBER_COMPARE_OPERATORS.has(operator) ? operator : '>'
  const left = `GetNum(${stringLiteral(prop(node, 'Name'))})`
  const right = resolvableNumber(node, 'Value', ctx)
  // Tolerance only makes sense for equality — floats are rarely exactly
  // equal, which is exactly what the retired "Number Equals" node existed
  // to work around (see docs/PLAN.md -> "Native catalog cleanup").
  if (op === '==' || op === '!=') {
    const tolerance = resolvableNumber(node, 'Tolerance', ctx)
    const within = `Math.Abs(${left} - (${right})) <= (${tolerance})`
    return { kind: 'condition', expression: op === '==' ? within : `!(${within})` }
  }
  return { kind: 'condition', expression: `${left} ${op} ${right}` }
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
