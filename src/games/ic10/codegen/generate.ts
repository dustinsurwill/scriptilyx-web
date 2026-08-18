import type { NodeConnection, ScriptNode } from '../../../types/graph'
import type { GenerateOptions, GenerateResult } from '../../../types/game'
import { findStartNodes, getReachableNodeIds } from '../../../lib/graph'
import { prefabHashFor } from '../deviceLogicTypes'

const MAX_LINES = 128
const MAX_LINE_LENGTH = 90
const MAX_REGISTERS = 16

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED_NAMES = new Set([
  'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15',
  'sp', 'ra',
  'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'db',
])

/** ActionTypes whose `Name` property declares a new register-backed
 * variable (see allocateRegisters). */
const DECLARING_ACTION_TYPES = new Set([
  'ReadDevice', 'ReadDeviceById', 'SetNumber', 'NumberMath', 'Select',
  'DeviceConnectedValue', 'ReadDeviceReagent', 'ReagentItemHash',
  'BatchReadDevice', 'BatchReadDeviceSlot', 'Pop', 'Peek', 'GetStack', 'GetStackById',
])

/** One reachable node's compiled output: an optional debug comment, the
 * `Lx:` label line, and its instruction line(s) — kept separate (rather
 * than flattened straight into the final line array) so a later pass can
 * drop the label if nothing ever jumps to it, and drop a trailing
 * unconditional jump if the node it targets already falls through
 * naturally (see elideRedundantControlFlow). */
interface Block {
  node: ScriptNode
  comment?: string
  content: string[]
}

function label(node: ScriptNode): string {
  return `L${node.Number}`
}

function isNumeric(raw: string): boolean {
  return raw.trim() !== '' && Number.isFinite(Number(raw.trim()))
}

function stringLiteral(raw: string): string {
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** IC10's compile-time `HASH("name")` expression, for the batch/reagent
 * instructions that address a prefab or reagent by name rather than by a
 * literal hash number we'd otherwise have to look up ourselves. */
function hashExpr(name: string): string {
  return name ? `HASH(${stringLiteral(name)})` : '0'
}

const BATCH_MODE_NUM: Record<string, number> = { Average: 0, Sum: 1, Minimum: 2, Maximum: 3 }
const REAGENT_MODE_NUM: Record<string, number> = { Contents: 0, Required: 1, Recipe: 2 }

// Number Math: one node, ~50 instructions worth of operators — grouped by
// operand count (arity), each mapped to its real IC10 mnemonic.
const NUMBER_MATH_OPCODE: Record<string, string> = {
  Add: 'add', Subtract: 'sub', Multiply: 'mul', Divide: 'div', Modulo: 'mod', Min: 'min', Max: 'max',
  Round: 'round', Floor: 'floor', Ceil: 'ceil', Abs: 'abs', Sqrt: 'sqrt', Trunc: 'trunc', Sgn: 'sgn',
  Sin: 'sin', Cos: 'cos', Tan: 'tan', Asin: 'asin', Acos: 'acos', Atan: 'atan', Atan2: 'atan2',
  Exp: 'exp', Log: 'log', Pow: 'pow',
  And: 'and', Or: 'or', Xor: 'xor', Nor: 'nor', Not: 'not',
  RotateLeft: 'rol', RotateRight: 'ror',
  ShiftLeftArithmetic: 'sla', ShiftLeftLogical: 'sll', ShiftRightArithmetic: 'sra', ShiftRightLogical: 'srl',
  Equal: 'seq', NotEqual: 'sne', LessThan: 'slt', LessOrEqual: 'sle', GreaterThan: 'sgt', GreaterOrEqual: 'sge',
  ApproxEqual: 'sap', NotApproxEqual: 'sna', IsNaN: 'snan', IsNotNaN: 'snanz',
  Clamp: 'clamp', Lerp: 'lerp', ExtractBits: 'ext', InsertBits: 'ins', Random: 'rand',
}
const NULLARY_MATH_OPS = new Set(['Random'])
const UNARY_MATH_OPS = new Set([
  'Round', 'Floor', 'Ceil', 'Abs', 'Sqrt', 'Trunc', 'Sgn',
  'Sin', 'Cos', 'Tan', 'Asin', 'Acos', 'Atan', 'Exp', 'Log', 'Not', 'IsNaN', 'IsNotNaN',
])
const TERNARY_MATH_OPS = new Set(['Clamp', 'Lerp', 'ApproxEqual', 'NotApproxEqual', 'ExtractBits', 'InsertBits'])

// Compare: base two-operand branch mnemonics. IC10 also has zero-compare
// ("z") and call-and-link ("al") variants of each of these — rather than
// separate nodes, generateScript picks the shorter mnemonic automatically
// (see the Compare case below) since the string concatenation happens to
// match IC10's actual naming (beq + z + al = "beqzal", a real mnemonic).
const COMPARE_BASE_OPCODE: Record<string, string> = {
  Equal: 'beq', NotEqual: 'bne', LessThan: 'blt', LessOrEqual: 'ble', GreaterThan: 'bgt', GreaterOrEqual: 'bge',
}

/** Collects every name a node declares via its `Name` property, in
 * first-appearance order among reachable nodes, and assigns each one a
 * general-purpose register (r0-r15 — only 16 exist, `sp`/`ra` are
 * reserved). Returns the alias lines to emit plus a lookup of which names
 * actually got a register. */
function allocateRegisters(reachable: ScriptNode[]): { aliasLines: string[]; declared: Set<string>; warnings: string[] } {
  const order: string[] = []
  const seen = new Set<string>()
  for (const node of reachable) {
    if (DECLARING_ACTION_TYPES.has(node.ActionType)) {
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

/** IC10 has no implicit fallthrough concept of its own — every node here
 * still compiles as if it needs its own label and an explicit jump to
 * whatever comes next. But physically, a block emitted immediately after
 * the block it jumps to doesn't need that jump at all (the processor just
 * runs into it), and a label nothing ever jumps to doesn't need to exist.
 * This trims both, purely as a peephole pass over the already-generated
 * blocks — it changes nothing about *which* instructions run, only how
 * many label/jump lines it costs to express that, which matters given
 * IC10's hard 128-line cap. Node emission order is left as-is (the order
 * nodes were authored/wired in, typically already close to execution
 * order for hand-built graphs) rather than reordered for maximum
 * adjacency, so this can't change what a jump resolves to — only whether
 * that jump line still needs to be written out. */
function elideRedundantControlFlow(blocks: Block[]): void {
  for (let i = 0; i < blocks.length - 1; i++) {
    const content = blocks[i].content
    const last = content[content.length - 1]
    if (last !== undefined && last === `j ${label(blocks[i + 1].node)}`) {
      content.pop()
    }
  }
}

function usedLabels(blocks: Block[]): Set<string> {
  const used = new Set<string>()
  for (const block of blocks) {
    for (const line of block.content) {
      for (const match of line.matchAll(/\bL\d+\b/g)) used.add(match[0])
    }
  }
  return used
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

  const blocks: Block[] = []

  for (const node of reachable) {
    const ctx = `${node.Title} #${node.Number}`
    const resolve = (key: string, label: string, fallback = '0') =>
      resolveValue(node.Properties[key] ?? fallback, declared, `${ctx} ${label}`, warnings)
    const target = (node.Properties.Name ?? '').trim() || 'r15'
    const next = () => `j ${label(targetOf(node, 'Next'))}`
    const content: string[] = []

    switch (node.ActionType) {
      case 'Start': {
        content.push(`j ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'Sleep': {
        content.push(`sleep ${resolve('Seconds', 'Seconds', '1')}`)
        content.push(next())
        break
      }
      case 'Yield': {
        content.push('yield')
        content.push(next())
        break
      }
      case 'LoopToStart': {
        content.push(`j ${label(start)}`)
        break
      }
      case 'CallSubroutine': {
        content.push(`jal ${label(targetOf(node, 'Next'))}`)
        break
      }
      case 'ReturnFromSubroutine': {
        content.push('j ra')
        break
      }

      case 'ReadDevice': {
        const device = node.Properties.Device ?? 'd0'
        const logicType = (node.Properties.LogicType ?? 'On').trim()
        content.push(`l ${target} ${device} ${logicType}`)
        content.push(next())
        break
      }
      case 'WriteDevice': {
        const device = node.Properties.Device ?? 'd0'
        const logicType = (node.Properties.LogicType ?? 'On').trim()
        content.push(`s ${device} ${logicType} ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }
      case 'ReadDeviceById': {
        const deviceId = resolve('DeviceId', 'Device ID', 'id')
        const logicType = (node.Properties.LogicType ?? 'On').trim()
        content.push(`ld ${target} ${deviceId} ${logicType}`)
        content.push(next())
        break
      }
      case 'WriteDeviceById': {
        const deviceId = resolve('DeviceId', 'Device ID', 'id')
        const logicType = (node.Properties.LogicType ?? 'On').trim()
        content.push(`sd ${deviceId} ${logicType} ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }
      case 'IfDeviceConnected': {
        const device = node.Properties.Device ?? 'd0'
        const callOnTrue = (node.Properties.CallOnTrue ?? 'false') === 'true'
        const opcode = 'bdse' + (callOnTrue ? 'al' : '')
        content.push(`${opcode} ${device} ${label(targetOf(node, 'True'))}`)
        content.push(`j ${label(targetOf(node, 'False'))}`)
        break
      }
      case 'DeviceConnectedValue': {
        const device = node.Properties.Device ?? 'd0'
        content.push(`sdse ${target} ${device}`)
        content.push(next())
        break
      }
      case 'CheckDeviceLogicType': {
        const device = node.Properties.Device ?? 'd0'
        const logicType = (node.Properties.LogicType ?? 'On').trim()
        const opcode = (node.Properties.Mode ?? 'Load') === 'Store' ? 'bdnvs' : 'bdnvl'
        content.push(`${opcode} ${device} ${logicType} ${label(targetOf(node, 'NotSupported'))}`)
        content.push(`j ${label(targetOf(node, 'Supported'))}`)
        break
      }
      case 'ReadDeviceReagent': {
        const device = node.Properties.Device ?? 'd0'
        const modeNum = REAGENT_MODE_NUM[node.Properties.ReagentMode ?? 'Contents'] ?? 0
        const reagent = hashExpr((node.Properties.ReagentName ?? '').trim())
        content.push(`lr ${target} ${device} ${modeNum} ${reagent}`)
        content.push(next())
        break
      }
      case 'ReagentItemHash': {
        const device = node.Properties.Device ?? 'd0'
        const reagent = hashExpr((node.Properties.ReagentName ?? '').trim())
        content.push(`rmap ${target} ${device} ${reagent}`)
        content.push(next())
        break
      }

      case 'BatchReadDevice':
      case 'BatchWriteDevice': {
        const deviceType = node.Properties.DeviceType ?? ''
        const hash = prefabHashFor(deviceType)
        if (hash === undefined) warnings.push(`${ctx}: no known prefab hash for device type "${deviceType}".`)
        // '(none)' is the DefaultValue rather than '' so the generic
        // empty-property validation (getGraphIssues) doesn't flag this
        // genuinely-optional field as an error.
        const deviceName = (node.Properties.DeviceName ?? '').trim()
        const deviceNameFilter = deviceName === '(none)' ? '' : deviceName
        const logicType = (node.Properties.LogicType ?? 'On').trim()
        if (node.ActionType === 'BatchReadDevice') {
          const batchMode = BATCH_MODE_NUM[node.Properties.BatchMode ?? 'Average'] ?? 0
          content.push(
            deviceNameFilter
              ? `lbn ${target} ${hash ?? 0} ${hashExpr(deviceNameFilter)} ${logicType} ${batchMode}`
              : `lb ${target} ${hash ?? 0} ${logicType} ${batchMode}`,
          )
        } else {
          const value = resolve('Value', 'Value')
          content.push(
            deviceNameFilter
              ? `sbn ${hash ?? 0} ${hashExpr(deviceNameFilter)} ${logicType} ${value}`
              : `sb ${hash ?? 0} ${logicType} ${value}`,
          )
        }
        content.push(next())
        break
      }
      case 'BatchReadDeviceSlot': {
        const deviceType = node.Properties.DeviceType ?? ''
        const hash = prefabHashFor(deviceType)
        if (hash === undefined) warnings.push(`${ctx}: no known prefab hash for device type "${deviceType}".`)
        const deviceName = (node.Properties.DeviceName ?? '').trim()
        const deviceNameFilter = deviceName === '(none)' ? '' : deviceName
        const slotIndex = resolve('SlotIndex', 'Slot Index', '0')
        const logicSlotType = (node.Properties.LogicSlotType ?? 'Occupied').trim()
        const batchMode = BATCH_MODE_NUM[node.Properties.BatchMode ?? 'Average'] ?? 0
        content.push(
          deviceNameFilter
            ? `lbns ${target} ${hash ?? 0} ${hashExpr(deviceNameFilter)} ${slotIndex} ${logicSlotType} ${batchMode}`
            : `lbs ${target} ${hash ?? 0} ${slotIndex} ${logicSlotType} ${batchMode}`,
        )
        content.push(next())
        break
      }
      case 'BatchWriteDeviceSlot': {
        const deviceType = node.Properties.DeviceType ?? ''
        const hash = prefabHashFor(deviceType)
        if (hash === undefined) warnings.push(`${ctx}: no known prefab hash for device type "${deviceType}".`)
        const slotIndex = resolve('SlotIndex', 'Slot Index', '0')
        const logicSlotType = (node.Properties.LogicSlotType ?? 'Occupied').trim()
        content.push(`sbs ${hash ?? 0} ${slotIndex} ${logicSlotType} ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }
      case 'ReadSlot': {
        const device = node.Properties.Device ?? 'd0'
        const slotIndex = resolve('SlotIndex', 'Slot Index', '0')
        const logicSlotType = (node.Properties.LogicSlotType ?? 'Occupied').trim()
        content.push(`ls ${target} ${device} ${slotIndex} ${logicSlotType}`)
        content.push(next())
        break
      }
      case 'WriteSlot': {
        const device = node.Properties.Device ?? 'd0'
        const slotIndex = resolve('SlotIndex', 'Slot Index', '0')
        const logicSlotType = (node.Properties.LogicSlotType ?? 'Occupied').trim()
        content.push(`ss ${device} ${slotIndex} ${logicSlotType} ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }

      case 'SetNumber': {
        content.push(`move ${target} ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }
      case 'NumberMath': {
        const operator = node.Properties.Operator ?? 'Add'
        const opcode = NUMBER_MATH_OPCODE[operator] ?? 'add'
        if (NULLARY_MATH_OPS.has(operator)) {
          content.push(`${opcode} ${target}`)
        } else if (UNARY_MATH_OPS.has(operator)) {
          content.push(`${opcode} ${target} ${resolve('ValueA', 'Value A')}`)
        } else if (TERNARY_MATH_OPS.has(operator)) {
          content.push(`${opcode} ${target} ${resolve('ValueA', 'Value A')} ${resolve('ValueB', 'Value B')} ${resolve('ValueC', 'Value C')}`)
        } else {
          content.push(`${opcode} ${target} ${resolve('ValueA', 'Value A')} ${resolve('ValueB', 'Value B')}`)
        }
        content.push(next())
        break
      }
      case 'Select': {
        content.push(
          `select ${target} ${resolve('Condition', 'Condition')} ${resolve('IfTrue', 'If True', '1')} ${resolve('IfFalse', 'If False')}`,
        )
        content.push(next())
        break
      }
      case 'Compare': {
        const operator = node.Properties.Operator ?? 'Equal'
        const callOnTrue = (node.Properties.CallOnTrue ?? 'false') === 'true'
        const a = resolve('ValueA', 'Value A')
        const trueLabel = label(targetOf(node, 'True'))
        const falseLabel = label(targetOf(node, 'False'))
        if (operator === 'IsNaN') {
          content.push(`bnan ${a} ${trueLabel}`)
        } else if (operator === 'ApproxEqual' || operator === 'NotApproxEqual') {
          const base = operator === 'ApproxEqual' ? 'bap' : 'bna'
          const b = resolve('ValueB', 'Value B')
          const c = resolve('ValueC', 'Value C (tolerance)', '0.001')
          const isZero = b === '0'
          const opcode = base + (isZero ? 'z' : '') + (callOnTrue ? 'al' : '')
          content.push(isZero ? `${opcode} ${a} ${c} ${trueLabel}` : `${opcode} ${a} ${b} ${c} ${trueLabel}`)
        } else {
          const base = COMPARE_BASE_OPCODE[operator] ?? 'beq'
          const b = resolve('ValueB', 'Value B')
          const isZero = b === '0'
          const opcode = base + (isZero ? 'z' : '') + (callOnTrue ? 'al' : '')
          content.push(isZero ? `${opcode} ${a} ${trueLabel}` : `${opcode} ${a} ${b} ${trueLabel}`)
        }
        content.push(`j ${falseLabel}`)
        break
      }

      case 'Push': {
        content.push(`push ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }
      case 'Pop': {
        content.push(`pop ${target}`)
        content.push(next())
        break
      }
      case 'Peek': {
        content.push(`peek ${target}`)
        content.push(next())
        break
      }
      case 'Poke': {
        content.push(`poke ${resolve('Address', 'Address', '0')} ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }
      case 'GetStack': {
        const device = node.Properties.Device ?? 'db'
        content.push(`get ${target} ${device} ${resolve('Address', 'Address', '0')}`)
        content.push(next())
        break
      }
      case 'GetStackById': {
        const deviceId = resolve('DeviceId', 'Device ID', 'id')
        content.push(`getd ${target} ${deviceId} ${resolve('Address', 'Address', '0')}`)
        content.push(next())
        break
      }
      case 'PutStack': {
        const device = node.Properties.Device ?? 'db'
        content.push(`put ${device} ${resolve('Address', 'Address', '0')} ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }
      case 'PutStackById': {
        const deviceId = resolve('DeviceId', 'Device ID', 'id')
        content.push(`putd ${deviceId} ${resolve('Address', 'Address', '0')} ${resolve('Value', 'Value')}`)
        content.push(next())
        break
      }
      case 'ClearStack': {
        content.push(`clr ${node.Properties.Device ?? 'db'}`)
        content.push(next())
        break
      }
      case 'ClearStackById': {
        content.push(`clrd ${resolve('DeviceId', 'Device ID', 'id')}`)
        content.push(next())
        break
      }

      default: {
        content.push(`# TODO codegen: ${node.ActionType} ("${node.Title}") not yet implemented.`)
        content.push(`j ${label(start)}`)
      }
    }

    blocks.push({
      node,
      comment: options.professionalComments ? `# #${node.Number} ${node.Title}` : undefined,
      content,
    })
  }

  elideRedundantControlFlow(blocks)
  const used = usedLabels(blocks)

  const lines: string[] = [...aliasLines]
  for (const block of blocks) {
    if (block.comment) lines.push(block.comment)
    if (used.has(label(block.node))) lines.push(`${label(block.node)}:`)
    lines.push(...block.content)
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
