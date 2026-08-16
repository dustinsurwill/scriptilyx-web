import type { ScriptNode } from '../../types/graph'
import type { EmitContext, NodeEmitter } from './types'
import { boolLiteral, hasInterpolation, interpolatedStringLiteral, numberLiteral, stringLiteral } from './format'

// ---------------------------------------------------------------------------
// Factories — each returns a NodeEmitter for a family of ActionTypes/node ids
// that share the same C# shape and differ only in which SE interface/member
// they touch. Wrapping each statement in its own `{ }` scope lets every
// emitter reuse short local names (`v`, `blk`) without collisions when a
// method contains more than one such statement.
// ---------------------------------------------------------------------------

export function prop(node: ScriptNode, key: string): string {
  return node.Properties[key] ?? ''
}

/** `{ if (GetBlock(name) is IFace v) v.Member = <value>; }` then advance via Next. */
export function blockPropertySetter(
  iface: string,
  member: string,
  valueExpr: (node: ScriptNode) => string,
  nameKey = 'BlockName',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, nameKey))}) is ${iface} v) v.${member} = ${valueExpr(node)}; }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

/** `{ if (GetBlock(name) is IFace v) v.Method(); }` then advance via Next. */
export function blockMethodCall(iface: string, method: string, nameKey = 'BlockName'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, nameKey))}) is ${iface} v) v.${method}(); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

/** foreach over a named group, setting `Member` on every block castable to `iface`. */
export function groupPropertySetter(
  iface: string,
  member: string,
  valueExpr: (node: ScriptNode) => string,
  nameKey = 'GroupName',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'action',
      statements: [
        `foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, nameKey))})) { if (blk is ${iface} v) v.${member} = ${valueExpr(node)}; }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

/** foreach over a named group, calling `Method()` on every block castable to `iface`. */
export function groupMethodCall(iface: string, method: string, nameKey = 'GroupName'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'action',
      statements: [
        `foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, nameKey))})) { if (blk is ${iface} v) v.${method}(); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

/** Boolean condition: `GetBlock(name) is IFace v && v.Member <op> <compare>`. */
export function blockCondition(
  iface: string,
  expr: (varName: string, node: ScriptNode) => string,
  nameKey = 'BlockName',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'condition',
      expression: `GetBlock(${stringLiteral(prop(node, nameKey))}) is ${iface} v && ${expr('v', node)}`,
    }
  }
}

/**
 * Same shape as `blockCondition`, but for the merged Above|Below threshold
 * nodes (battery/gas-tank/cargo/room-oxygen/ship-speed/jump-drive-charge/
 * piston-position): the comparison operator comes from the node's own
 * `Direction` combo property instead of being baked into a separate
 * Above/Below node.
 */
export function blockThresholdCondition(
  iface: string,
  valueExpr: (varName: string) => string,
  valueKey: string,
  nameKey = 'BlockName',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    const operator = prop(node, 'Direction') === 'Below' ? '<' : '>'
    return {
      kind: 'condition',
      expression: `GetBlock(${stringLiteral(prop(node, nameKey))}) is ${iface} v && ${valueExpr('v')} ${operator} ${resolvableNumber(node, valueKey, ctx)}`,
    }
  }
}

/** Boolean condition over every block in a named group: `blocks.All/Any(blk => ...)`. */
export function groupCondition(
  iface: string,
  combinator: 'All' | 'Any',
  expr: (varName: string, node: ScriptNode) => string,
  nameKey = 'GroupName',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'condition',
      expression: `GetGroupBlocks(${stringLiteral(prop(node, nameKey))}).${combinator}(blk => blk is ${iface} v && ${expr('v', node)})`,
    }
  }
}

export const enabledValue = (node: ScriptNode) => boolLiteral(prop(node, 'Enabled'))
export const lockedValue = (node: ScriptNode) => boolLiteral(prop(node, 'Locked'))

// ---------------------------------------------------------------------------
// Variable interpolation — lets any user-facing text field reference a
// variable by writing "{myVar}" (or "{text:myVar}" / "{bool:myVar}" to pick
// a type other than number). Shared by Echo and every LCD-text emitter.
// ---------------------------------------------------------------------------

/** Reads a `{kind:name}` or `{name}` (kind defaults to `defaultKind`)
 * interpolation hole and returns the C# read expression for it. */
function resolveInterpolationHole(expr: string, defaultKind: 'num' | 'text' | 'bool' = 'num'): string {
  const match = /^(num|text|bool)\s*:\s*(.+)$/i.exec(expr.trim())
  const kind = match ? match[1].toLowerCase() : defaultKind
  const name = (match ? match[2] : expr).trim()
  const getter = kind === 'text' ? 'GetText' : kind === 'bool' ? 'GetBool' : 'GetNum'
  return `${getter}(${stringLiteral(name)})`
}

/** Turns a `Text`-style property into a C# string expression: a plain
 * literal if it has no `{...}` holes, otherwise a `$"..."` interpolated
 * string that reads each referenced variable. */
export function interpolatedTextExpr(node: ScriptNode, ctx: EmitContext, key = 'Text'): string {
  const template = prop(node, key)
  if (!hasInterpolation(template)) return stringLiteral(template)
  ctx.useHelper('Vars')
  return interpolatedStringLiteral(template, resolveInterpolationHole)
}

/** True if `raw` is *exactly* one `{...}` interpolation hole (as opposed to
 * embedded inside surrounding text) — the shape a non-text property (a
 * combo/bool/number field, which has no room for a template) needs to
 * opt into reading a variable instead of a fixed literal. */
function isPureInterpolation(raw: string): boolean {
  return /^\{[^{}]+\}$/.test(raw.trim())
}

/**
 * Resolves a bool-typed property (Enabled, Locked, ...) that may be either
 * a literal `"true"`/`"false"` or a single `{myFlag}`/`{bool:myFlag}`
 * variable reference — same interpolation syntax already used by Echo/LCD
 * text, just applied to a whole property value instead of embedded in a
 * string. Lets nodes like SetBlockEnabled be driven by a variable instead
 * of only a fixed combo value.
 */
export function resolvableBool(node: ScriptNode, key: string, ctx: EmitContext): string {
  const raw = prop(node, key)
  if (isPureInterpolation(raw)) {
    ctx.useHelper('Vars')
    return resolveInterpolationHole(raw.trim().slice(1, -1), 'bool')
  }
  return boolLiteral(raw)
}

/** Same as `resolvableBool`, for number-typed properties (Percent, Value, ...). */
export function resolvableNumber(node: ScriptNode, key: string, ctx: EmitContext): string {
  const raw = prop(node, key)
  if (isPureInterpolation(raw)) {
    ctx.useHelper('Vars')
    return resolveInterpolationHole(raw.trim().slice(1, -1), 'num')
  }
  return numberLiteral(raw)
}

// ---------------------------------------------------------------------------
// Generic terminal-block property access — works for every block/PB feature
// registered in the terminal system (SE's ModAPI `GetValue<T>`/`SetValue<T>`/
// `ApplyAction`), independent of whether a strongly-typed interface exists.
// Used both for the user-facing "generic" nodes and for AI Block / Event
// Controller / Action Relay nodes, whose interesting state is exposed only
// through named terminal properties rather than bespoke C# interfaces.
// ---------------------------------------------------------------------------

export function terminalPropertySetter<T extends string>(
  csharpType: T,
  valueExpr: (node: ScriptNode) => string,
  nameKey = 'BlockName',
  propKey = 'PropertyId',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `GetBlock(${stringLiteral(prop(node, nameKey))})?.SetValue<${csharpType}>(${stringLiteral(prop(node, propKey))}, ${valueExpr(node)});`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

export function terminalPropertyCondition<T extends string>(
  csharpType: T,
  compare: (getExpr: string, node: ScriptNode) => string,
  nameKey = 'BlockName',
  propKey = 'PropertyId',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    const getExpr = `(GetBlock(${stringLiteral(prop(node, nameKey))})?.GetValue<${csharpType}>(${stringLiteral(prop(node, propKey))}) ?? default(${csharpType}))`
    return { kind: 'condition', expression: compare(getExpr, node) }
  }
}

export function terminalAction(nameKey = 'BlockName', actionKey = 'ActionId'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `GetBlock(${stringLiteral(prop(node, nameKey))})?.ApplyAction(${stringLiteral(prop(node, actionKey))});`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

/** Applies the first terminal action whose Id/Name contains `substring`
 * (case-insensitive) — for blocks whose action id isn't documented anywhere
 * reachable, but whose purpose is unambiguous (see docs/codegen-api-notes.md
 * "Action Relay and Broadcast Controller"). */
export function terminalActionByNameContains(substring: string, nameKey = 'BlockName'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('ApplyActionNamed')
    return {
      kind: 'action',
      statements: [
        `ApplyActionNamed(GetBlock(${stringLiteral(prop(node, nameKey))}), ${stringLiteral(substring)});`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

export function isWorkingCondition(negate = false, nameKey = 'BlockName'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    const expr = `GetBlock(${stringLiteral(prop(node, nameKey))})?.IsWorking ?? false`
    return { kind: 'condition', expression: negate ? `!(${expr})` : expr }
  }
}

// ---------------------------------------------------------------------------
// LCD / text-panel writer, reused by every "write status to an LCD" node.
// ---------------------------------------------------------------------------

export function lcdWrite(textExpr: (node: ScriptNode, ctx: EmitContext) => string, nameKey = 'BlockName'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, nameKey))}) is IMyTextSurface v) v.WriteText(${textExpr(node, ctx)}); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

export function lcdAppend(textExpr: (node: ScriptNode, ctx: EmitContext) => string, nameKey = 'BlockName'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, nameKey))}) is IMyTextSurface v) v.WriteText(${textExpr(node, ctx)}, true); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

export function lcdGroupWrite(textExpr: (node: ScriptNode, ctx: EmitContext) => string, append = false): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'action',
      statements: [
        `foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})) { if (blk is IMyTextSurface v) v.WriteText(${textExpr(node, ctx)}${append ? ', true' : ''}); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

export const statusLcd: NodeEmitter = lcdWrite(
  (node) =>
    `${stringLiteral(prop(node, 'BlockName') + ': ')} + ((GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.IsWorking ?? false) ? "OK" : "Fault")`,
  'LcdName',
)
