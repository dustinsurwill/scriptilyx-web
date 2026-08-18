import type { NodeConnection, ScriptNode } from '../../../types/graph'
import type { GenerateOptions, GenerateResult } from '../../../types/game'
import { findStartNodes, getReachableNodeIds } from '../../../lib/graph'

const MAX_LINES = 128
const MAX_LINE_LENGTH = 90
const MAX_REGISTERS = 16

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED_NAMES = new Set([
  'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15',
  'sp', 'ra',
  'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'db',
])

function label(node: ScriptNode): string {
  return `L${node.Number}`
}

function isNumeric(raw: string): boolean {
  return raw.trim() !== '' && Number.isFinite(Number(raw.trim()))
}

const MATH_OPCODE: Record<string, string> = {
  Add: 'add', Subtract: 'sub', Multiply: 'mul', Divide: 'div', Modulo: 'mod',
  Min: 'min', Max: 'max', Round: 'round', Floor: 'floor', Ceil: 'ceil', Abs: 'abs', Sqrt: 'sqrt',
}
const UNARY_MATH_OPS = new Set(['Round', 'Floor', 'Ceil', 'Abs', 'Sqrt'])

const BRANCH_OPCODE: Record<string, string> = {
  Equal: 'beq', NotEqual: 'bne', LessThan: 'blt', LessOrEqual: 'ble', GreaterThan: 'bgt', GreaterOrEqual: 'bge',
}

/** Collects every name a node declares via its `Name` property (Read
 * Device, Set Number, Number Math), in first-appearance order among
 * reachable nodes, and assigns each one a general-purpose register
 * (r0-r15 — only 16 exist, `sp`/`ra` are reserved). Returns the alias
 * lines to emit plus a lookup of which names actually got a register. */
function allocateRegisters(reachable: ScriptNode[]): { aliasLines: string[]; declared: Set<string>; warnings: string[] } {
  const order: string[] = []
  const seen = new Set<string>()
  for (const node of reachable) {
    if (node.ActionType === 'ReadDevice' || node.ActionType === 'SetNumber' || node.ActionType === 'NumberMath') {
      const name = (node.Properties.Name ?? '').trim()
      if (name && !seen.has(name)) {
        seen.add(name)
        order.push(name)
      }
    }
  }

  const warnings: string[] = []
  if (order.length > MAX_REGISTERS) {
    warnings.push(
      `This graph declares ${order.length} variables, but IC10 only has ${MAX_REGISTERS} general-purpose registers ` +
        `(r0-r15). Only the first ${MAX_REGISTERS} ("${order.slice(0, MAX_REGISTERS).join('", "')}") got a register — ` +
        `the rest will fail to assemble in-game. Remove or reuse variable names.`,
    )
  }

  const declared = new Set(order.slice(0, MAX_REGISTERS))
  const aliasLines = [...declared].map((name, i) => `alias ${name} r${i}`)
  return { aliasLines, declared, warnings }
}

/** A property value is either a literal number or a reference to an
 * already-declared variable name — both are emitted verbatim, since IC10
 * accepts a register/alias and an immediate literal in the same operand
 * position. Anything else is a likely typo, surfaced as a warning rather
 * than blocking (matches this app's general "generate best-effort, warn"
 * posture for unresolvable references). */
function resolveValue(raw: string, declared: Set<string>, context: string, warnings: string[]): string {
  const value = raw.trim()
  if (isNumeric(value)) return value
  if (declared.has(value)) return value
  if (!IDENTIFIER_RE.test(value)) {
    warnings.push(`${context}: "${raw}" isn't a number or a valid variable name.`)
  } else if (RESERVED_NAMES.has(value)) {
    warnings.push(`${context}: "${value}" is a register/device name, not a declared variable — did you mean to Read/Set it first?`)
  } else {
    warnings.push(`${context}: "${value}" is never set by a Read Device/Set Number/Number Math node — it won't assemble.`)
  }
  return value
}

export function generateScript(
  nodes: ScriptNode[],
  connections: NodeConnection[],
  options: GenerateOptions = {},
): GenerateResult {
  const warnings: string[] = []
  const [start] = findStartNodes(nodes)
  if (!start) {
    return { source: '# No Start node in the graph.', warnings }
  }

  const reachableIds = getReachableNodeIds(nodes, connections)
  const reachable = nodes.filter((n) => reachableIds.has(n.Id))
  const byId = new Map(nodes.map((n) => [n.Id, n]))

  const targetOf = (node: ScriptNode, port: string): ScriptNode => {
    const wire = connections.find((c) => c.FromNodeId === node.Id && c.FromPort === port)
    const target = wire ? byId.get(wire.ToNodeId) : undefined
    return target ?? start
  }

  const { aliasLines, declared, warnings: registerWarnings } = allocateRegisters(reachable)
  warnings.push(...registerWarnings)

  const lines: string[] = [...aliasLines]

  for (const node of reachable) {
    const ctx = `${node.Title} #${node.Number}`
    if (options.professionalComments) lines.push(`# #${node.Number} ${node.Title}`)
    lines.push(`${label(node)}:`)

    switch (node.ActionType) {
      case 'Start': {
        lines.push(`j ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'Sleep': {
        const seconds = resolveValue(node.Properties.Seconds ?? '1', declared, `${ctx} Seconds`, warnings)
        lines.push(`sleep ${seconds}`)
        lines.push(`j ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'Yield': {
        lines.push('yield')
        lines.push(`j ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'LoopToStart': {
        lines.push(`j ${label(start)}`)
        break
      }
      case 'ReadDevice': {
        const device = node.Properties.Device ?? 'd0'
        const logicType = (node.Properties.LogicType ?? 'On').trim()
        const name = (node.Properties.Name ?? '').trim()
        lines.push(`l ${name || 'r15'} ${device} ${logicType}`)
        lines.push(`j ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'WriteDevice': {
        const device = node.Properties.Device ?? 'd0'
        const logicType = (node.Properties.LogicType ?? 'On').trim()
        const value = resolveValue(node.Properties.Value ?? '0', declared, `${ctx} Value`, warnings)
        lines.push(`s ${device} ${logicType} ${value}`)
        lines.push(`j ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'SetNumber': {
        const name = (node.Properties.Name ?? '').trim()
        const value = resolveValue(node.Properties.Value ?? '0', declared, `${ctx} Value`, warnings)
        lines.push(`move ${name || 'r15'} ${value}`)
        lines.push(`j ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'NumberMath': {
        const name = (node.Properties.Name ?? '').trim()
        const operator = node.Properties.Operator ?? 'Add'
        const opcode = MATH_OPCODE[operator] ?? 'add'
        const a = resolveValue(node.Properties.ValueA ?? '0', declared, `${ctx} Value A`, warnings)
        if (UNARY_MATH_OPS.has(operator)) {
          lines.push(`${opcode} ${name || 'r15'} ${a}`)
        } else {
          const b = resolveValue(node.Properties.ValueB ?? '0', declared, `${ctx} Value B`, warnings)
          lines.push(`${opcode} ${name || 'r15'} ${a} ${b}`)
        }
        lines.push(`j ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'Compare': {
        const operator = node.Properties.Operator ?? 'Equal'
        const opcode = BRANCH_OPCODE[operator] ?? 'beq'
        const a = resolveValue(node.Properties.ValueA ?? '0', declared, `${ctx} Value A`, warnings)
        const b = resolveValue(node.Properties.ValueB ?? '0', declared, `${ctx} Value B`, warnings)
        lines.push(`${opcode} ${a} ${b} ${label(targetOf(node, 'True'))}`)
        lines.push(`j ${label(targetOf(node, 'False'))}`)
        break
      }
      default: {
        lines.push(`# TODO codegen: ${node.ActionType} ("${node.Title}") not yet implemented.`)
        lines.push(`j ${label(start)}`)
      }
    }
  }

  if (lines.length > MAX_LINES) {
    warnings.push(`This script is ${lines.length} lines, over IC10's ${MAX_LINES}-line limit. It won't fit in the in-game editor — remove some nodes.`)
  }
  const longLineIndex = lines.findIndex((l) => l.length > MAX_LINE_LENGTH)
  if (longLineIndex !== -1) {
    warnings.push(
      `Line ${longLineIndex + 1} is ${lines[longLineIndex].length} chars, over IC10's ${MAX_LINE_LENGTH}-char-per-line limit: "${lines[longLineIndex]}"`,
    )
  }

  return { source: lines.join('\n'), warnings }
}
