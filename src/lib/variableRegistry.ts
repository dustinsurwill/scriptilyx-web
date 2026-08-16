import type { ScriptNode } from '../types/graph'

export type VarKind = 'num' | 'text' | 'bool'

interface RoleSpec {
  /** Property key(s) on this node that hold a variable name. */
  keys: string[]
  /** Fixed kind, or derived from the node's own properties (e.g. Save/Load
   * Variable's `Type` combo). */
  kind: VarKind | ((node: ScriptNode) => VarKind)
  /** True if this node establishes the name's type (Set X Variable, Save/
   * Load Variable's Type combo) rather than just referencing an existing
   * one (If Number Less Than, Echo Text Variable). Declaring roles win
   * ties when more than one kind is seen for the same name. */
  declares: boolean
}

function storageKind(node: ScriptNode): VarKind {
  const type = (node.Properties.Type ?? '').toLowerCase()
  return type === 'text' ? 'text' : type === 'bool' ? 'bool' : 'num'
}

/** Keyed by ActionType, for nodes dispatched directly (not through
 * ExtendedBuiltin) — see registry.ts's resolveEmitter. */
const BY_ACTION_TYPE: Record<string, RoleSpec> = {
  SetNumberVariable: { keys: ['Name'], kind: 'num', declares: true },
  NumberMath: { keys: ['Name'], kind: 'num', declares: true },
  CalculateFormula: { keys: ['Name'], kind: 'num', declares: true },
  SetTextVariable: { keys: ['Name'], kind: 'text', declares: true },
  AppendTextVariable: { keys: ['Name'], kind: 'text', declares: true },
  IfNumberLessThan: { keys: ['Name'], kind: 'num', declares: false },
  IfNumberGreaterThan: { keys: ['Name'], kind: 'num', declares: false },
  IfTextEquals: { keys: ['Name'], kind: 'text', declares: false },
  NumberGreaterRouter: { keys: ['Name'], kind: 'num', declares: false },
  NumberCompare: { keys: ['Name'], kind: 'num', declares: false },
}

/** Keyed by DefinitionId, for ExtendedBuiltin nodes (dispatched by node id,
 * not ActionType — see registry.ts). */
const BY_DEFINITION_ID: Record<string, RoleSpec> = {
  'ext.var.clamp': { keys: ['Name'], kind: 'num', declares: true },
  'ext.var.round': { keys: ['Name'], kind: 'num', declares: true },
  'ext.var.absolute': { keys: ['Name'], kind: 'num', declares: true },
  'ext.var.between': { keys: ['Name'], kind: 'num', declares: false },
  'ext.var.copy': { keys: ['SourceName', 'DestinationName'], kind: 'num', declares: true },
  'ext.bool.set': { keys: ['Name'], kind: 'bool', declares: true },
  'ext.bool.if': { keys: ['Name'], kind: 'bool', declares: false },
  'ext.bool.toggle': { keys: ['Name'], kind: 'bool', declares: true },
  'ext.storage.save': { keys: ['VariableName'], kind: storageKind, declares: true },
  'ext.storage.load': { keys: ['VariableName'], kind: storageKind, declares: true },
  'ext.generic.get_float': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.generic.get_bool': { keys: ['VariableName'], kind: 'bool', declares: true },
  'ext.generic.get_int': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.generic.get_text': { keys: ['VariableName'], kind: 'text', declares: true },
  'ext.projector.get_remaining': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.projector.get_buildable': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.tank.get_fill': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.vent.get_oxygen': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.battery.get_charge': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.cargo.get_fill': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.inventory.get_item_amount': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.sensor.get_count': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.group.count': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.lcd.progress_bar': { keys: ['VariableName'], kind: 'num', declares: false },
  'ext.lcd.number_variable': { keys: ['VariableName'], kind: 'num', declares: false },
  'ext.ship.get_speed': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.ship.get_mass': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.ship.get_natural_gravity': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.ship.get_artificial_gravity': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.ship.get_elevation': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.input.get_roll': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.action_relay.get_channel': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.action_relay.get_accept_from': { keys: ['VariableName'], kind: 'num', declares: true },
  'ext.diag.echo_number': { keys: ['VariableName'], kind: 'num', declares: false },
  'ext.diag.echo_text': { keys: ['VariableName'], kind: 'text', declares: false },
}

function roleFor(node: ScriptNode): RoleSpec | undefined {
  if (node.ActionType === 'ExtendedBuiltin') return BY_DEFINITION_ID[node.DefinitionId]
  return BY_ACTION_TYPE[node.ActionType]
}

export interface VariableConflict {
  name: string
  kinds: VarKind[]
}

export interface VariableRegistry {
  /** name -> resolved kind, preferring a declaring node's kind over a
   * merely-referencing one when both exist. */
  kindOf: Map<string, VarKind>
  /** All known variable names, grouped by resolved kind, each sorted —
   * the shape a picker UI wants directly. */
  namesByKind: Record<VarKind, string[]>
  /** Names seen with more than one kind across the graph (e.g. a
   * `Set Number Variable "x"` alongside a `Set Bool Variable "x"`). */
  conflicts: VariableConflict[]
}

const EMPTY_REGISTRY: VariableRegistry = {
  kindOf: new Map(),
  namesByKind: { num: [], text: [], bool: [] },
  conflicts: [],
}

/** Derives every known variable name and its type from the nodes that
 * create or reference it (Set Number/Text/Bool Variable, Calculate, the
 * Get-X-into-a-variable family, Save/Load Variable's Type combo, ...).
 * Used to let interpolation holes drop the `num:`/`text:`/`bool:` prefix
 * (resolved from here instead) and to power a variable picker / duplicate-
 * type-use warning in the UI. Not exhaustive — nodes not in the role
 * tables above simply don't contribute to the registry; unregistered
 * `{name}` references still work, just fall back to their call site's
 * default kind (usually "num"). */
export function buildVariableRegistry(nodes: ScriptNode[]): VariableRegistry {
  if (nodes.length === 0) return EMPTY_REGISTRY

  const declaredKinds = new Map<string, Set<VarKind>>()
  const allKinds = new Map<string, Set<VarKind>>()

  for (const node of nodes) {
    const role = roleFor(node)
    if (!role) continue
    const kind = typeof role.kind === 'function' ? role.kind(node) : role.kind
    for (const key of role.keys) {
      const name = (node.Properties[key] ?? '').trim()
      if (!name) continue
      if (!allKinds.has(name)) allKinds.set(name, new Set())
      allKinds.get(name)!.add(kind)
      if (role.declares) {
        if (!declaredKinds.has(name)) declaredKinds.set(name, new Set())
        declaredKinds.get(name)!.add(kind)
      }
    }
  }

  const kindOf = new Map<string, VarKind>()
  const conflicts: VariableConflict[] = []
  for (const [name, kinds] of allKinds) {
    const declared = declaredKinds.get(name)
    const preferred = declared && declared.size > 0 ? declared : kinds
    kindOf.set(name, [...preferred][0])
    if (kinds.size > 1) conflicts.push({ name, kinds: [...kinds].sort() })
  }

  const namesByKind: Record<VarKind, string[]> = { num: [], text: [], bool: [] }
  for (const [name, kind] of kindOf) namesByKind[kind].push(name)
  for (const kind of ['num', 'text', 'bool'] as const) namesByKind[kind].sort()

  return { kindOf, namesByKind, conflicts: conflicts.sort((a, b) => a.name.localeCompare(b.name)) }
}
