import type { NodeConnection, ScriptNode } from '../../types/graph'
import { findStartNodes } from '../graph'
import { stringLiteral, titleToIdentifier } from './format'
import { findSectionStartNodes, sectionMethodName } from './logicEmitters'
import { HELPER_SOURCE } from './helpers'
import { resolveEmitter } from './registry'
import type { CodegenOptions, EmitContext } from './types'

/** node.Number is unique within a graph (assigned by an incrementing
 * counter, see GraphState.NextNodeNumber), so "Step_<Number>_<Title>" is
 * both readable and collision-free — unlike the old GUID-derived names,
 * it also lets a reader match generated code back to the node's canvas
 * badge (e.g. the "#6" shown on the node in the editor). */
export function methodName(node: ScriptNode): string {
  const title = titleToIdentifier(node.Title)
  return title ? `Step_${node.Number}_${title}` : `Step_${node.Number}`
}

type VarKind = 'num' | 'text' | 'bool'

const VAR_GETTER_RE = /(GetNum|GetText|GetBool)\("((?:[^"\\]|\\.)*)"\)/g
const VAR_ASSIGN_RE = /_(num|text|bool)\["((?:[^"\\]|\\.)*)"\]/g
const KIND_BY_GETTER: Record<string, VarKind> = { GetNum: 'num', GetText: 'text', GetBool: 'bool' }

/** Reverses format.ts's stringLiteral escaping, just enough to recover a
 * readable raw variable name for building an identifier from it. */
function unescapeStringLiteral(raw: string): string {
  return raw.replace(/\\n/g, ' ').replace(/\\t/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

/** Replaces every `GetNum("x")`/`_num["x"]` (and the Text/Bool equivalents)
 * across all method bodies with a real, readable, typed C# field —
 * `Num_x`/`Text_x`/`Bool_x` — instead of a string-keyed dictionary lookup.
 * Mutates `bodies` in place and returns the field declarations to emit.
 * Only called when at least one emitter actually used a variable (i.e. the
 * 'Vars' helper was requested), so graphs with no variables pay nothing. */
function promoteVariableStorage(bodies: { key: string; node: ScriptNode; statements: string[] }[]): string[] {
  const fieldNameByVar = new Map<string, string>()
  const usedNames = new Set<string>()

  function fieldNameFor(kind: VarKind, rawKeyEscaped: string): string {
    const mapKey = `${kind}:${rawKeyEscaped}`
    const existing = fieldNameByVar.get(mapKey)
    if (existing) return existing
    const base = titleToIdentifier(unescapeStringLiteral(rawKeyEscaped)) || 'v'
    const safeBase = /^[0-9]/.test(base) ? `_${base}` : base
    const kindPrefix = kind === 'num' ? 'Num' : kind === 'text' ? 'Text' : 'Bool'
    let candidate = `${kindPrefix}_${safeBase}`
    let suffix = 2
    while (usedNames.has(candidate)) candidate = `${kindPrefix}_${safeBase}_${suffix++}`
    usedNames.add(candidate)
    fieldNameByVar.set(mapKey, candidate)
    return candidate
  }

  function transform(statement: string): string {
    return statement
      .replace(VAR_GETTER_RE, (_m, getter: string, rawKey: string) => fieldNameFor(KIND_BY_GETTER[getter], rawKey))
      .replace(VAR_ASSIGN_RE, (_m, kind: string, rawKey: string) => fieldNameFor(kind as VarKind, rawKey))
  }

  for (const body of bodies) {
    body.statements = body.statements.map(transform)
  }

  const declarations: string[] = []
  for (const [mapKey, fieldName] of fieldNameByVar) {
    const kind = mapKey.slice(0, mapKey.indexOf(':')) as VarKind
    if (kind === 'num') declarations.push(`double ${fieldName};`)
    else if (kind === 'text') declarations.push(`string ${fieldName} = "";`)
    else declarations.push(`bool ${fieldName};`)
  }
  return declarations
}

/** Every node reachable from Start by following wires, plus every
 * StartSection node (reachable only by name, from a CallSection anywhere). */
function collectReachable(nodes: ScriptNode[], connections: NodeConnection[]): ScriptNode[] {
  const byId = new Map(nodes.map((n) => [n.Id, n]))
  const outgoing = new Map<string, NodeConnection[]>()
  for (const c of connections) {
    const list = outgoing.get(c.FromNodeId) ?? []
    list.push(c)
    outgoing.set(c.FromNodeId, list)
  }

  const visited = new Set<string>()
  const roots = [...findStartNodes(nodes), ...findSectionStartNodes(nodes)]
  const stack = roots.map((n) => n.Id)
  while (stack.length > 0) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    for (const c of outgoing.get(id) ?? []) {
      if (!visited.has(c.ToNodeId)) stack.push(c.ToNodeId)
    }
  }
  return [...visited]
    .map((id) => byId.get(id))
    .filter((n): n is ScriptNode => n != null)
    .sort((a, b) => a.Number - b.Number)
}

export interface GenerateResult {
  source: string
  warnings: string[]
}

export function generateScript(
  nodes: ScriptNode[],
  connections: NodeConnection[],
  options: CodegenOptions = {},
): GenerateResult {
  const warnings: string[] = []
  const [start] = findStartNodes(nodes)
  if (!start) {
    return { source: '// No Start node in the graph.', warnings: ['No Start node found.'] }
  }

  const reachable = collectReachable(nodes, connections)
  const reachableIds = new Set(reachable.map((n) => n.Id))
  const outgoingByPort = new Map<string, NodeConnection>()
  for (const c of connections) {
    outgoingByPort.set(`${c.FromNodeId}::${c.FromPort}`, c)
  }
  const byId = new Map(nodes.map((n) => [n.Id, n]))
  const sectionByName = new Map(
    findSectionStartNodes(nodes)
      .filter((n) => reachableIds.has(n.Id))
      .map((n) => [n.Properties.SectionName ?? '', n]),
  )

  const usedHelpers = new Set<string>()
  const tickBudget = options.multiTickBudget

  function targetKey(node: ScriptNode, port: string): string | null {
    const wire = outgoingByPort.get(`${node.Id}::${port}`)
    if (!wire) return null
    const target = byId.get(wire.ToNodeId)
    if (!target || !reachableIds.has(target.Id)) return null
    return methodName(target)
  }

  function makeContext(): EmitContext {
    return {
      useHelper: (id) => usedHelpers.add(id),
      hasNext: (node, port) => targetKey(node, port) != null,
      next: (node, port) => {
        const key = targetKey(node, port)
        if (tickBudget) {
          return key ? `_nextNode = ${stringLiteral(key)};` : `_nextNode = null;`
        }
        return key ? `${key}();` : `// "${port}" not connected`
      },
      callSection: (sectionName) => {
        const target = sectionByName.get(sectionName)
        if (!target) return `// section "${sectionName}" not found`
        if (tickBudget) return `_nextNode = ${stringLiteral(methodName(target))};`
        return `${sectionMethodName(sectionName)}();`
      },
    }
  }

  const bodies: { key: string; node: ScriptNode; statements: string[] }[] = []
  for (const node of reachable) {
    const ctx = makeContext()
    const emit = resolveEmitter(node)(node, ctx)
    const statements: string[] = []
    if (emit.kind === 'action' || emit.kind === 'raw') {
      statements.push(...emit.statements)
    } else {
      statements.push(...(emit.statements ?? []))
      const trueCall = tickBudget
        ? (targetKey(node, 'True') ? `_nextNode = ${stringLiteral(targetKey(node, 'True')!)};` : '_nextNode = null;')
        : (targetKey(node, 'True') ? `${targetKey(node, 'True')}();` : '// "True" not connected')
      const falseCall = tickBudget
        ? (targetKey(node, 'False') ? `_nextNode = ${stringLiteral(targetKey(node, 'False')!)};` : '_nextNode = null;')
        : (targetKey(node, 'False') ? `${targetKey(node, 'False')}();` : '// "False" not connected')
      statements.push(`if (${emit.expression}) {`, `    ${trueCall}`, `} else {`, `    ${falseCall}`, `}`)
    }
    bodies.push({ key: methodName(node), node, statements })
  }

  const sectionAliases = [...sectionByName.entries()].map(([name, n]) => ({
    alias: sectionMethodName(name),
    target: methodName(n),
  }))

  let varFieldDeclarations: string[] = []
  if (usedHelpers.has('Vars')) {
    usedHelpers.delete('Vars')
    varFieldDeclarations = promoteVariableStorage(bodies)
  }

  const lines: string[] = []
  if (options.professionalComments) {
    lines.push(`// Generated by Scriptilyx Web from a ${nodes.length}-node graph.`)
    lines.push(`// Start node: "${start.Title}" (#${start.Number}).`)
    lines.push('')
  }

  lines.push(`string _argument = "";`)
  if (tickBudget) lines.push(`string _nextNode = null;`)
  for (const decl of varFieldDeclarations) lines.push(decl)
  for (const id of usedHelpers) {
    const source = HELPER_SOURCE[id]
    if (source === undefined) throw new Error(`codegen: unknown helper id "${id}" requested by an emitter`)
    lines.push(source)
  }
  lines.push('')

  lines.push(`public Program() {`)
  lines.push(`}`)
  lines.push('')

  lines.push(`void Main(string argument, UpdateType updateSource) {`)
  lines.push(`    _argument = argument;`)
  if (tickBudget) {
    lines.push(`    if (_nextNode == null) _nextNode = ${stringLiteral(methodName(start))};`)
    lines.push(`    int budget = ${tickBudget.maxNodesPerTick};`)
    lines.push(`    while (_nextNode != null && budget-- > 0) Dispatch();`)
  } else {
    lines.push(`    ${methodName(start)}();`)
  }
  lines.push(`}`)
  lines.push('')

  if (tickBudget) {
    lines.push(`void Dispatch() {`)
    lines.push(`    switch (_nextNode) {`)
    for (const { key, node, statements } of bodies) {
      lines.push(`        // #${node.Number} ${node.Title}`)
      lines.push(`        case ${stringLiteral(key)}: {`)
      for (const s of statements) lines.push(`            ${s}`)
      lines.push(`            break;`)
      lines.push(`        }`)
    }
    lines.push(`        default: _nextNode = null; break;`)
    lines.push(`    }`)
    lines.push(`}`)
  } else {
    for (const { key, node, statements } of bodies) {
      lines.push(`// #${node.Number} ${node.Title}`)
      lines.push(`void ${key}() {`)
      for (const s of statements) lines.push(`    ${s}`)
      lines.push(`}`)
      lines.push('')
    }
    for (const { alias, target } of sectionAliases) {
      lines.push(`void ${alias}() { ${target}(); }`)
    }
  }

  for (const node of nodes) {
    if (!reachableIds.has(node.Id) && node.ActionType !== 'Start') {
      warnings.push(`${node.Title} #${node.Number} is unreachable and was skipped.`)
    }
  }

  return { source: lines.join('\n'), warnings }
}
