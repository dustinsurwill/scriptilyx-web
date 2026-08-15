import type { ScriptNode } from '../../types/graph'
import { boolLiteral, numberLiteral, stringLiteral } from './format'
import {
  blockCondition,
  blockMethodCall,
  blockPropertySetter,
  enabledValue,
  groupCondition,
  groupMethodCall,
  isWorkingCondition,
  lcdAppend,
  lcdGroupWrite,
  lcdWrite,
  prop,
  terminalActionByNameContains,
  terminalPropertyCondition,
} from './factories'
import type { NodeEmitter } from './types'

// Every ExtendedBuiltin node id -> emitter. See docs/codegen-api-notes.md for
// the API research this is built against.

function setVar(kind: 'num' | 'text' | 'bool', varKey: string, valueExpr: (node: ScriptNode) => string): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [`_${kind}[${stringLiteral(prop(node, varKey))}] = ${valueExpr(node)};`, ctx.next(node, 'Next')],
    }
  }
}

/** `block?.SetValue<T>(fixedPropertyId, value)` — for nodes that always
 * target one specific terminal property (not a user-chosen PropertyId). */
function fixedTerminalPropertySetter<T extends string>(
  csharpType: T,
  propertyId: string,
  valueExpr: (node: ScriptNode) => string,
  nameKey = 'BlockName',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `GetBlock(${stringLiteral(prop(node, nameKey))})?.SetValue<${csharpType}>(${stringLiteral(propertyId)}, ${valueExpr(node)});`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

/** Condition variant of `fixedTerminalPropertySetter`. */
function fixedTerminalPropertyCondition<T extends string>(
  csharpType: T,
  propertyId: string,
  compare: (getExpr: string, node: ScriptNode) => string,
  nameKey = 'BlockName',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    const getExpr = `(GetBlock(${stringLiteral(prop(node, nameKey))})?.GetValue<${csharpType}>(${stringLiteral(propertyId)}) ?? default(${csharpType}))`
    return { kind: 'condition', expression: compare(getExpr, node) }
  }
}

function getBlockMemberIntoVar(
  kind: 'num' | 'text',
  iface: string,
  memberExpr: (v: string, node: ScriptNode) => string,
  nameKey = 'BlockName',
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    const varName = stringLiteral(prop(node, 'VariableName'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, nameKey))}) is ${iface} v) _${kind}[${varName}] = ${memberExpr('v', node)}; }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

export const extendedEmitters: Record<string, NodeEmitter> = {
  // --- All Blocks / Generic --------------------------------------------------
  'ext.generic.get_float': terminalPropertySetterGetter('float'),
  'ext.generic.get_bool': terminalPropertySetterGetter('bool'),
  'ext.generic.get_int': terminalPropertySetterGetter('long'),
  'ext.generic.get_text': terminalPropertySetterGetter('string'),
  'ext.generic.if_float_above': terminalPropertyCondition('float', (get, n) => `${get} > ${numberLiteral(prop(n, 'Value'))}`),
  'ext.generic.if_float_below': terminalPropertyCondition('float', (get, n) => `${get} < ${numberLiteral(prop(n, 'Value'))}`),
  'ext.generic.if_bool_true': terminalPropertyCondition('bool', (get) => get),
  'ext.generic.if_bool_false': terminalPropertyCondition('bool', (get) => `!${get}`),
  'ext.generic.block_exists': (node, ctx) => {
    ctx.useHelper('GetBlock')
    return { kind: 'condition', expression: `GetBlock(${stringLiteral(prop(node, 'BlockName'))}) != null` }
  },
  'ext.generic.group_exists': (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return { kind: 'condition', expression: `GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))}).Count > 0` }
  },
  'ext.generic.if_working': isWorkingCondition(),
  'ext.generic.if_functional': (node, ctx) => {
    ctx.useHelper('GetBlock')
    return { kind: 'condition', expression: `GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.IsFunctional ?? false` }
  },
  'ext.generic.if_enabled': blockCondition('IMyFunctionalBlock', (v) => `${v}.Enabled`),
  'ext.generic.if_damaged': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const b = `GetBlock(${stringLiteral(prop(node, 'BlockName'))})`
    return { kind: 'condition', expression: `${b} != null && !${b}.IsFunctional` }
  },
  'ext.generic.status_router': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const b = `GetBlock(${stringLiteral(prop(node, 'BlockName'))})`
    const missing = ctx.next(node, 'Missing')
    const damaged = ctx.next(node, 'Damaged')
    const disabled = ctx.next(node, 'Disabled')
    const notWorking = ctx.next(node, 'NotWorking')
    const working = ctx.next(node, 'Working')
    return {
      kind: 'raw',
      statements: [
        `{`,
        `    var b = ${b};`,
        `    if (b == null) { ${missing} }`,
        `    else if (!b.IsFunctional) { ${damaged} }`,
        `    else if (b is IMyFunctionalBlock fb && !fb.Enabled) { ${disabled} }`,
        `    else if (!b.IsWorking) { ${notWorking} }`,
        `    else { ${working} }`,
        `}`,
      ],
    }
  },

  // --- Projector --------------------------------------------------------------
  'ext.projector.if_complete': (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'condition',
      expression: `GetBlock(${stringLiteral(prop(node, 'BlockName'))}) is IMyProjector v && v.IsProjecting && v.RemainingBlocks == 0`,
    }
  },
  'ext.projector.if_has_projection': blockCondition('IMyProjector', (v) => `${v}.IsProjecting`),
  'ext.projector.if_remaining_below': blockCondition(
    'IMyProjector',
    (v, n) => `${v}.RemainingBlocks < ${numberLiteral(prop(n, 'Blocks'))}`,
  ),
  'ext.projector.get_remaining': getBlockMemberIntoVar('num', 'IMyProjector', (v) => `${v}.RemainingBlocks`),
  'ext.projector.get_buildable': getBlockMemberIntoVar('num', 'IMyProjector', (v) => `${v}.BuildableBlocksCount`),
  'ext.projector.progress_lcd': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const projector = stringLiteral(prop(node, 'ProjectorName'))
    const lcd = stringLiteral(prop(node, 'LcdName'))
    const title = stringLiteral(prop(node, 'Title'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${projector}) is IMyProjector p && GetBlock(${lcd}) is IMyTextSurface s) {`,
        `    double pct = p.TotalBlocks == 0 ? 0 : 100.0 * (p.TotalBlocks - p.RemainingBlocks) / p.TotalBlocks;`,
        `    s.WriteText(${title} + "\\n" + p.TotalBlocks + " total, " + p.RemainingBlocks + " left, " + p.BuildableBlocksCount + " buildable\\n" + pct.ToString("F1") + "%");`,
        `} }`,
        ctx.next(node, 'Next'),
      ],
    }
  },

  // --- Piston -------------------------------------------------------------
  'ext.piston.if_above': blockCondition('IMyPistonBase', (v, n) => `${v}.CurrentPosition > ${numberLiteral(prop(n, 'Meters'))}`),
  'ext.piston.if_below': blockCondition('IMyPistonBase', (v, n) => `${v}.CurrentPosition < ${numberLiteral(prop(n, 'Meters'))}`),
  'ext.piston.if_extended': blockCondition('IMyPistonBase', (v) => `${v}.CurrentPosition >= ${v}.HighestPosition`),
  'ext.piston.if_retracted': blockCondition('IMyPistonBase', (v) => `${v}.CurrentPosition <= ${v}.LowestPosition`),

  // --- Rotor / hinge --------------------------------------------------------
  'ext.rotor.if_rpm_above': blockCondition('IMyMotorStator', (v, n) => `${v}.TargetVelocityRPM > ${numberLiteral(prop(n, 'RPM'))}`),
  'ext.rotor.if_rpm_below': blockCondition('IMyMotorStator', (v, n) => `${v}.TargetVelocityRPM < ${numberLiteral(prop(n, 'RPM'))}`),
  'ext.rotor.if_stopped': blockCondition('IMyMotorStator', (v) => `Math.Abs(${v}.TargetVelocityRPM) < 0.001f`),
  'ext.hinge.if_locked': blockCondition('IMyMotorStator', (v) => `${v}.RotorLock`),
  'ext.hinge.if_moving': blockCondition('IMyMotorStator', (v) => `Math.Abs(${v}.TargetVelocityRPM) >= 0.001f`),
  'ext.hinge.if_stopped': blockCondition('IMyMotorStator', (v) => `Math.Abs(${v}.TargetVelocityRPM) < 0.001f`),
  'ext.hinge.angle_between': blockCondition(
    'IMyMotorStator',
    (v, n) =>
      `${v}.Angle * 180.0 / Math.PI >= ${numberLiteral(prop(n, 'MinimumDeg'))} && ${v}.Angle * 180.0 / Math.PI <= ${numberLiteral(prop(n, 'MaximumDeg'))}`,
  ),
  'ext.rotor.angle_between': blockCondition(
    'IMyMotorStator',
    (v, n) =>
      `${v}.Angle * 180.0 / Math.PI >= ${numberLiteral(prop(n, 'MinimumDeg'))} && ${v}.Angle * 180.0 / Math.PI <= ${numberLiteral(prop(n, 'MaximumDeg'))}`,
  ),

  // --- Connector ------------------------------------------------------------
  'ext.connector.if_connected': blockCondition('IMyShipConnector', (v) => `${v}.Status == MyShipConnectorStatus.Connected`),
  'ext.connector.if_connectable': blockCondition('IMyShipConnector', (v) => `${v}.Status == MyShipConnectorStatus.Connectable`),
  'ext.connector.status_router': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const b = `GetBlock(${stringLiteral(prop(node, 'BlockName'))})`
    return {
      kind: 'raw',
      statements: [
        `{`,
        `    var status = (${b} as IMyShipConnector)?.Status ?? MyShipConnectorStatus.Unconnected;`,
        `    if (status == MyShipConnectorStatus.Connected) { ${ctx.next(node, 'Connected')} }`,
        `    else if (status == MyShipConnectorStatus.Connectable) { ${ctx.next(node, 'Connectable')} }`,
        `    else { ${ctx.next(node, 'Unconnected')} }`,
        `}`,
      ],
    }
  },

  // --- Gas tank ---------------------------------------------------------------
  'ext.tank.if_above': blockCondition('IMyGasTank', (v, n) => `${v}.FilledRatio * 100.0 > ${numberLiteral(prop(n, 'Percent'))}`),
  'ext.tank.if_below': blockCondition('IMyGasTank', (v, n) => `${v}.FilledRatio * 100.0 < ${numberLiteral(prop(n, 'Percent'))}`),
  'ext.tank.get_fill': getBlockMemberIntoVar('num', 'IMyGasTank', (v) => `${v}.FilledRatio * 100.0`),

  // --- Air vent -----------------------------------------------------------
  'ext.vent.if_pressurized': blockCondition('IMyAirVent', (v, n) => `${v}.GetOxygenLevel() * 100.0 >= ${numberLiteral(prop(n, 'Percent'))}`),
  'ext.vent.if_depressurized': blockCondition('IMyAirVent', (v, n) => `${v}.GetOxygenLevel() * 100.0 <= ${numberLiteral(prop(n, 'Percent'))}`),
  'ext.vent.if_oxygen_above': blockCondition('IMyAirVent', (v, n) => `${v}.GetOxygenLevel() * 100.0 > ${numberLiteral(prop(n, 'Percent'))}`),
  'ext.vent.if_oxygen_below': blockCondition('IMyAirVent', (v, n) => `${v}.GetOxygenLevel() * 100.0 < ${numberLiteral(prop(n, 'Percent'))}`),
  'ext.vent.get_oxygen': getBlockMemberIntoVar('num', 'IMyAirVent', (v) => `${v}.GetOxygenLevel() * 100.0`),

  // --- Battery ------------------------------------------------------------
  'ext.battery.if_above': blockCondition(
    'IMyBatteryBlock',
    (v, n) => `${v}.CurrentStoredPower / ${v}.MaxStoredPower * 100.0 > ${numberLiteral(prop(n, 'Percent'))}`,
  ),
  'ext.battery.get_charge': getBlockMemberIntoVar('num', 'IMyBatteryBlock', (v) => `${v}.CurrentStoredPower / ${v}.MaxStoredPower * 100.0`),
  'ext.battery.charge_router': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const b = `GetBlock(${stringLiteral(prop(node, 'BlockName'))})`
    const critical = prop(node, 'CriticalBelow') || '0'
    const low = prop(node, 'LowBelow') || '0'
    const full = prop(node, 'FullAbove') || '100'
    return {
      kind: 'raw',
      statements: [
        `{`,
        `    double pct = (${b} as IMyBatteryBlock)?.CurrentStoredPower / (${b} as IMyBatteryBlock)?.MaxStoredPower * 100.0 ?? 0;`,
        `    if (pct < ${critical}) { ${ctx.next(node, 'Critical')} }`,
        `    else if (pct < ${low}) { ${ctx.next(node, 'Low')} }`,
        `    else if (pct >= ${full}) { ${ctx.next(node, 'Full')} }`,
        `    else { ${ctx.next(node, 'Normal')} }`,
        `}`,
      ],
    }
  },

  // --- Cargo ----------------------------------------------------------------
  'ext.cargo.if_above': blockCondition(
    'IMyCargoContainer',
    (v, n) =>
      `(double)${v}.GetInventory(0).CurrentVolume / (double)${v}.GetInventory(0).MaxVolume * 100.0 > ${numberLiteral(prop(n, 'Percent'))}`,
  ),
  'ext.cargo.get_fill': getBlockMemberIntoVar(
    'num',
    'IMyCargoContainer',
    (v) => `(double)${v}.GetInventory(0).CurrentVolume / (double)${v}.GetInventory(0).MaxVolume * 100.0`,
  ),

  // --- Inventory ------------------------------------------------------------
  'ext.inventory.contains_item': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('GetItemAmount')
    return {
      kind: 'condition',
      expression: `GetItemAmount(GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.GetInventory(0), ${stringLiteral(prop(node, 'ItemType'))}) >= ${numberLiteral(prop(node, 'Amount'))}`,
    }
  },
  'ext.inventory.get_item_amount': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('GetItemAmount')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `_num[${stringLiteral(prop(node, 'VariableName'))}] = GetItemAmount(GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.GetInventory(0), ${stringLiteral(prop(node, 'ItemType'))});`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.inventory.if_item_below': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('GetItemAmount')
    return {
      kind: 'condition',
      expression: `GetItemAmount(GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.GetInventory(0), ${stringLiteral(prop(node, 'ItemType'))}) < ${numberLiteral(prop(node, 'Amount'))}`,
    }
  },

  // --- Sensor -----------------------------------------------------------------
  'ext.sensor.get_count': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'BlockName'))}) is IMySensorBlock v) { var ents = new List<MyDetectedEntityInfo>(); v.DetectedEntities(ents); _num[${stringLiteral(prop(node, 'VariableName'))}] = ents.Count; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },

  // --- Group ------------------------------------------------------------------
  'ext.group.if_any_working': groupCondition('IMyTerminalBlock', 'Any', (v) => `${v}.IsWorking`),
  'ext.group.if_all_working': (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    const list = `GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})`
    return { kind: 'condition', expression: `${list}.Count > 0 && ${list}.All(blk => blk.IsWorking)` }
  },
  'ext.group.if_any_damaged': groupCondition('IMyTerminalBlock', 'Any', (v) => `!${v}.IsFunctional`),
  'ext.group.if_all_enabled': (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    const list = `GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})`
    return {
      kind: 'condition',
      expression: `${list}.Count > 0 && ${list}.All(blk => !(blk is IMyFunctionalBlock fb) || fb.Enabled)`,
    }
  },
  'ext.group.count': (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `_num[${stringLiteral(prop(node, 'VariableName'))}] = GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))}).Count;`,
        ctx.next(node, 'Next'),
      ],
    }
  },

  // --- LCD ----------------------------------------------------------------
  'ext.lcd.append': lcdAppend((n) => stringLiteral(prop(n, 'Text'))),
  'ext.lcd.clear': lcdWrite(() => `""`),
  'ext.lcd.group_append': lcdGroupWrite((n) => stringLiteral(prop(n, 'Text')), true),
  'ext.lcd.progress_bar': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    const varName = stringLiteral(prop(node, 'VariableName'))
    const min = prop(node, 'Minimum') || '0'
    const max = prop(node, 'Maximum') || '100'
    const width = prop(node, 'Width') || '20'
    const title = stringLiteral(prop(node, 'Title'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'BlockName'))}) is IMyTextSurface s) {`,
        `    double frac = ((${min}) == (${max})) ? 0 : (GetNum(${varName}) - (${min})) / ((${max}) - (${min}));`,
        `    frac = Math.Max(0, Math.Min(1, frac));`,
        `    int filled = (int)Math.Round(frac * ${width});`,
        `    s.WriteText(${title} + " [" + new string('#', filled) + new string('-', ${width} - filled) + "]");`,
        `} }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.lcd.number_variable': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    const varName = stringLiteral(prop(node, 'VariableName'))
    const prefix = stringLiteral(prop(node, 'Prefix'))
    const suffix = stringLiteral(prop(node, 'Suffix'))
    const decimals = prop(node, 'Decimals') || '2'
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'BlockName'))}) is IMyTextSurface s) s.WriteText(${prefix} + GetNum(${varName}).ToString("F" + (${decimals})) + ${suffix}); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },

  // --- Number variable helpers ----------------------------------------------
  'ext.var.subtract': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    return { kind: 'action', statements: [`_num[${key}] = GetNum(${key}) - (${prop(node, 'Value') || '0'});`, ctx.next(node, 'Next')] }
  },
  'ext.var.multiply': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    return { kind: 'action', statements: [`_num[${key}] = GetNum(${key}) * (${prop(node, 'Value') || '0'});`, ctx.next(node, 'Next')] }
  },
  'ext.var.divide': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    const value = prop(node, 'Value') || '0'
    return {
      kind: 'raw',
      statements: [
        `if ((${value}) == 0) { Echo("Divide by zero: " + ${key}); }`,
        `else { _num[${key}] = GetNum(${key}) / (${value}); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.var.clamp': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    return {
      kind: 'action',
      statements: [
        `_num[${key}] = Math.Max(${prop(node, 'Minimum') || '0'}, Math.Min(${prop(node, 'Maximum') || '0'}, GetNum(${key})));`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.var.round': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    return {
      kind: 'action',
      statements: [`_num[${key}] = Math.Round(GetNum(${key}), ${prop(node, 'Decimals') || '0'});`, ctx.next(node, 'Next')],
    }
  },
  'ext.var.absolute': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    return { kind: 'action', statements: [`_num[${key}] = Math.Abs(GetNum(${key}));`, ctx.next(node, 'Next')] }
  },
  'ext.var.random': (node, ctx) => {
    ctx.useHelper('Vars')
    ctx.useHelper('Rng')
    const key = stringLiteral(prop(node, 'Name'))
    const min = prop(node, 'Minimum') || '0'
    const max = prop(node, 'Maximum') || '0'
    return {
      kind: 'action',
      statements: [`_num[${key}] = ${min} + _rng.NextDouble() * ((${max}) - (${min}));`, ctx.next(node, 'Next')],
    }
  },
  'ext.var.equals': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    return {
      kind: 'condition',
      expression: `Math.Abs(GetNum(${key}) - (${prop(node, 'Value') || '0'})) <= (${prop(node, 'Tolerance') || '0'})`,
    }
  },
  'ext.var.between': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    return {
      kind: 'condition',
      expression: `GetNum(${key}) >= ${prop(node, 'Minimum') || '0'} && GetNum(${key}) <= ${prop(node, 'Maximum') || '0'}`,
    }
  },
  'ext.var.copy': (node, ctx) => {
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `_num[${stringLiteral(prop(node, 'DestinationName'))}] = GetNum(${stringLiteral(prop(node, 'SourceName'))});`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.bool.set': setVar('bool', 'Name', (n) => boolLiteral(prop(n, 'Value'))),
  'ext.bool.if_true': (node, ctx) => {
    ctx.useHelper('Vars')
    return { kind: 'condition', expression: `GetBool(${stringLiteral(prop(node, 'Name'))})` }
  },
  'ext.bool.if_false': (node, ctx) => {
    ctx.useHelper('Vars')
    return { kind: 'condition', expression: `!GetBool(${stringLiteral(prop(node, 'Name'))})` }
  },
  'ext.bool.toggle': (node, ctx) => {
    ctx.useHelper('Vars')
    const key = stringLiteral(prop(node, 'Name'))
    return { kind: 'action', statements: [`_bool[${key}] = !GetBool(${key});`, ctx.next(node, 'Next')] }
  },
  'ext.storage.save': (node, ctx) => {
    ctx.useHelper('Vars')
    const varName = stringLiteral(prop(node, 'VariableName'))
    const storageKey = prop(node, 'StorageKey')
    const type = prop(node, 'Type').trim()
    const valueExpr = type === 'text' ? `GetText(${varName})` : type === 'bool' ? `GetBool(${varName}).ToString()` : `GetNum(${varName}).ToString()`
    return {
      kind: 'raw',
      statements: [
        `{ var kv = ${storageKey ? stringLiteral(storageKey) : '""'} + "=" + (${valueExpr}); Storage = string.Join(";", System.Array.FindAll((Storage ?? "").Split(';'), s => !s.StartsWith(${storageKey ? stringLiteral(storageKey + '=') : '""'}))).Trim(';') + (string.IsNullOrEmpty(Storage) ? "" : ";") + kv; }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.storage.load': (node, ctx) => {
    ctx.useHelper('Vars')
    const varName = stringLiteral(prop(node, 'VariableName'))
    const storageKey = stringLiteral(prop(node, 'StorageKey'))
    const type = prop(node, 'Type').trim()
    const target = type === 'text' ? '_text' : type === 'bool' ? '_bool' : '_num'
    const parse = type === 'text' ? 'raw' : type === 'bool' ? 'bool.Parse(raw)' : 'double.Parse(raw, System.Globalization.CultureInfo.InvariantCulture)'
    return {
      kind: 'raw',
      statements: [
        `foreach (var kv in (Storage ?? "").Split(';')) {`,
        `    var idx = kv.IndexOf('=');`,
        `    if (idx > 0 && kv.Substring(0, idx) == ${storageKey}) { var raw = kv.Substring(idx + 1); ${target}[${varName}] = ${parse}; break; }`,
        `}`,
        ctx.next(node, 'Next'),
      ],
    }
  },

  // --- Programmable block ----------------------------------------------------
  'ext.pb.run': (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `(GetBlock(${stringLiteral(prop(node, 'BlockName'))}) as IMyProgrammableBlock)?.TryRun(${stringLiteral(prop(node, 'Argument'))});`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.pb.run_group': (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'action',
      statements: [
        `foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})) { if (blk is IMyProgrammableBlock pb) pb.TryRun(${stringLiteral(prop(node, 'Argument'))}); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },

  // --- Timer --------------------------------------------------------------
  'ext.timer.if_counting': blockCondition('IMyTimerBlock', (v) => `${v}.IsCountingDown`),
  'ext.timer.if_enabled': blockCondition('IMyFunctionalBlock', (v) => `${v}.Enabled`),
  'ext.timer.start_delay': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${name}) is IMyTimerBlock v) { v.TriggerDelay = (float)${numberLiteral(prop(node, 'Seconds'))}; v.StartCountdown(); } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },

  // --- Landing gear --------------------------------------------------------
  'ext.gear.lock': blockMethodCall('IMyLandingGear', 'Lock'),
  'ext.gear.unlock': blockMethodCall('IMyLandingGear', 'Unlock'),
  'ext.gear.if_locked': blockCondition('IMyLandingGear', (v) => `${v}.IsLocked`),
  // No scriptable "ready to lock" flag exists; approximated as "not locked
  // but something is in range to attach to" — see docs/codegen-api-notes.md.
  'ext.gear.if_ready': blockCondition('IMyLandingGear', (v) => `!${v}.IsLocked && ${v}.GetAttachedEntity() != null`),
  'ext.gear.group_lock': groupMethodCall('IMyLandingGear', 'Lock'),
  'ext.gear.group_unlock': groupMethodCall('IMyLandingGear', 'Unlock'),

  // --- Parachute ------------------------------------------------------------
  'ext.parachute.open': blockMethodCall('IMyDoor', 'OpenDoor'),
  'ext.parachute.close': blockMethodCall('IMyDoor', 'CloseDoor'),
  'ext.parachute.if_open': blockCondition('IMyDoor', (v) => `${v}.Status.ToString() == "Open"`),

  // --- Ship controller (cockpit / remote control) -----------------------------
  'ext.ship.get_speed': getBlockMemberIntoVar('num', 'IMyShipController', (v) => `${v}.GetShipSpeed()`),
  'ext.ship.if_speed_above': blockCondition('IMyShipController', (v, n) => `${v}.GetShipSpeed() > ${numberLiteral(prop(n, 'Speed'))}`),
  'ext.ship.if_speed_below': blockCondition('IMyShipController', (v, n) => `${v}.GetShipSpeed() < ${numberLiteral(prop(n, 'Speed'))}`),
  'ext.ship.get_mass': getBlockMemberIntoVar('num', 'IMyShipController', (v) => `${v}.CalculateShipMass().PhysicalMass`),
  'ext.ship.get_natural_gravity': getBlockMemberIntoVar('num', 'IMyShipController', (v) => `${v}.GetNaturalGravity().Length()`),
  'ext.ship.get_artificial_gravity': getBlockMemberIntoVar('num', 'IMyShipController', (v) => `${v}.GetArtificialGravity().Length()`),
  'ext.ship.get_elevation': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'BlockName'))}) is IMyShipController v) { double elev; v.TryGetPlanetElevation(MyPlanetElevation.Sealevel, out elev); _num[${stringLiteral(prop(node, 'VariableName'))}] = elev; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.ship.if_under_control': blockCondition('IMyShipController', (v) => `${v}.IsUnderControl`),

  // --- Pilot input ----------------------------------------------------------
  'ext.input.get_move': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'BlockName'))}) is IMyShipController v) { var m = v.MoveIndicator; _num[${stringLiteral(prop(node, 'XVariable'))}] = m.X; _num[${stringLiteral(prop(node, 'YVariable'))}] = m.Y; _num[${stringLiteral(prop(node, 'ZVariable'))}] = m.Z; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.input.get_rotation': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'BlockName'))}) is IMyShipController v) { var r = v.RotationIndicator; _num[${stringLiteral(prop(node, 'PitchVariable'))}] = r.X; _num[${stringLiteral(prop(node, 'YawVariable'))}] = r.Y; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.input.get_roll': getBlockMemberIntoVar('num', 'IMyShipController', (v) => `${v}.RollIndicator`),
  'ext.input.if_handbrake': blockCondition('IMyShipController', (v) => `${v}.HandBrake`),

  // --- Camera -----------------------------------------------------------------
  'ext.camera.raycast': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    const name = stringLiteral(prop(node, 'BlockName'))
    const distance = numberLiteral(prop(node, 'Distance'))
    const pitch = numberLiteral(prop(node, 'Pitch'))
    const yaw = numberLiteral(prop(node, 'Yaw'))
    const distVar = stringLiteral(prop(node, 'DistanceVariable'))
    const nameVar = stringLiteral(prop(node, 'NameVariable'))
    const typeVar = stringLiteral(prop(node, 'TypeVariable'))
    return {
      kind: 'raw',
      statements: [
        `{`,
        `    var cam = GetBlock(${name}) as IMyCameraBlock;`,
        `    var hit = default(MyDetectedEntityInfo);`,
        `    bool found = false;`,
        `    if (cam != null && cam.CanScan(${distance})) {`,
        `        cam.EnableRaycast = true;`,
        `        hit = cam.Raycast(${distance}, (float)${pitch}, (float)${yaw});`,
        `        found = hit.EntityId != 0;`,
        `    }`,
        `    if (found) {`,
        `        _num[${distVar}] = (hit.HitPosition.HasValue && cam != null) ? Vector3D.Distance(cam.GetPosition(), hit.HitPosition.Value) : 0;`,
        `        _text[${nameVar}] = hit.Name;`,
        `        _text[${typeVar}] = hit.Type.ToString();`,
        `        ${ctx.next(node, 'Detected')}`,
        `    } else { ${ctx.next(node, 'NotDetected')} }`,
        `}`,
      ],
    }
  },
  'ext.camera.if_detects': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    const distance = numberLiteral(prop(node, 'Distance'))
    const pitch = numberLiteral(prop(node, 'Pitch'))
    const yaw = numberLiteral(prop(node, 'Yaw'))
    const id = sanitize(node.Id)
    return {
      kind: 'condition',
      statements: [
        `var cam_${id} = GetBlock(${name}) as IMyCameraBlock;`,
        `var hit_${id} = default(MyDetectedEntityInfo);`,
        `if (cam_${id} != null && cam_${id}.CanScan(${distance})) { cam_${id}.EnableRaycast = true; hit_${id} = cam_${id}.Raycast(${distance}, (float)${pitch}, (float)${yaw}); }`,
      ],
      expression: `hit_${id}.EntityId != 0`,
    }
  },

  // --- Antenna / beacon -------------------------------------------------------
  'ext.antenna.set_range': blockPropertySetter('IMyRadioAntenna', 'Radius', (n) => `(float)${numberLiteral(prop(n, 'Meters'))}`),
  'ext.antenna.set_broadcasting': blockPropertySetter('IMyRadioAntenna', 'EnableBroadcasting', enabledValue),
  'ext.antenna.set_name': blockPropertySetter('IMyTerminalBlock', 'CustomName', (n) => stringLiteral(prop(n, 'NewName'))),
  // IMyBeacon.Radius is get-only in the strongly-typed interface, but the
  // same GUI slider is reachable through the generic terminal property API.
  'ext.beacon.set_range': fixedTerminalPropertySetter('float', 'Radius', (n) => `(float)${numberLiteral(prop(n, 'Meters'))}`),
  'ext.beacon.set_name': blockPropertySetter('IMyTerminalBlock', 'CustomName', (n) => stringLiteral(prop(n, 'NewName'))),

  // --- Broadcast Controller (Message0..Message7 terminal properties) ----------
  'ext.broadcast.message_x': terminalActionByNameContains('Message'),
  'ext.broadcast.set_message_x': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const slot = Math.max(0, (Number(prop(node, 'MessageNumber')) || 1) - 1)
    return {
      kind: 'action',
      statements: [
        `GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.SetValue<string>(${stringLiteral(`Message${slot}`)}, ${stringLiteral(prop(node, 'MessageText'))});`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.broadcast.random': terminalActionByNameContains('Random'),
  'ext.broadcast.gps': terminalActionByNameContains('GPS'),

  // --- Action Relay (real terminal props: Channel, ReceiveFrom; Send action found by name) --
  'ext.action_relay.send_signal': terminalActionByNameContains('Send'),
  'ext.action_relay.set_channel': fixedTerminalPropertySetter('float', 'Channel', (n) => `(float)${numberLiteral(prop(n, 'Channel'))}`),
  'ext.action_relay.get_channel': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `_text[${stringLiteral(prop(node, 'VariableName'))}] = (GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.GetValue<float>("Channel") ?? 0).ToString();`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.action_relay.if_channel_equals': fixedTerminalPropertyCondition(
    'float',
    'Channel',
    (get, n) => `Math.Abs(${get} - ${numberLiteral(prop(n, 'Channel'))}) < 0.001f`,
  ),
  'ext.action_relay.set_accept_from': (node, ctx) => {
    ctx.useHelper('GetBlock')
    const mode = prop(node, 'AcceptFrom').trim()
    const index = mode === 'Owner' ? 0 : mode === 'Faction' ? 1 : 2
    return {
      kind: 'action',
      statements: [
        `GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.SetValue<long>("ReceiveFrom", ${index}L);`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.action_relay.get_accept_from': (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `{`,
        `    long recv = GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.GetValue<long>("ReceiveFrom") ?? 0;`,
        `    _text[${stringLiteral(prop(node, 'VariableName'))}] = recv == 0 ? "Owner" : recv == 1 ? "Faction" : "Everyone";`,
        `}`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.action_relay.send_group': (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    ctx.useHelper('ApplyActionNamed')
    return {
      kind: 'action',
      statements: [
        `foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})) ApplyActionNamed(blk, "Send");`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.action_relay.list_actions': listActions(),
  'ext.action_relay.list_properties': listProperties(),

  // --- Diagnostics (write to this PB's own Custom Data / Echo) ------------------
  'ext.diag.write_variables': (node, ctx) => {
    ctx.useHelper('Vars')
    const header = stringLiteral(prop(node, 'Header'))
    return {
      kind: 'action',
      statements: [
        `{`,
        `    var sb = new System.Text.StringBuilder();`,
        `    sb.AppendLine(${header});`,
        `    foreach (var kv in _num) sb.AppendLine(kv.Key + " = " + kv.Value);`,
        `    foreach (var kv in _text) sb.AppendLine(kv.Key + " = \\"" + kv.Value + "\\"");`,
        `    foreach (var kv in _bool) sb.AppendLine(kv.Key + " = " + kv.Value);`,
        `    Me.CustomData = sb.ToString();`,
        `}`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.diag.block_status': (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ var b = GetBlock(${stringLiteral(prop(node, 'BlockName'))}); Me.CustomData = b == null ? "Block not found" : (b.CustomName + ": Working=" + b.IsWorking + " Functional=" + b.IsFunctional + " Enabled=" + ((b as IMyFunctionalBlock)?.Enabled ?? true)); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.diag.list_group': (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'action',
      statements: [
        `{ var sb = new System.Text.StringBuilder(); foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})) sb.AppendLine(blk.CustomName); Me.CustomData = sb.ToString(); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.diag.list_properties': listProperties(),
  'ext.diag.list_actions': listActions(),
  'ext.diag.echo_number': (node, ctx) => {
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `Echo(${stringLiteral(prop(node, 'Prefix'))} + GetNum(${stringLiteral(prop(node, 'VariableName'))}));`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.diag.echo_text': (node, ctx) => {
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `Echo(${stringLiteral(prop(node, 'Prefix'))} + GetText(${stringLiteral(prop(node, 'VariableName'))}));`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  'ext.diag.runtime_stats': (node, ctx) => ({
    kind: 'action',
    statements: [
      `Echo("Last run: " + Runtime.LastRunTimeMs + "ms, instructions: " + Runtime.CurrentInstructionCount + "/" + Runtime.MaxInstructionCount);`,
      ctx.next(node, 'Next'),
    ],
  }),
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '')
}

function terminalPropertySetterGetter(csharpType: 'float' | 'bool' | 'long' | 'string'): NodeEmitter {
  const kind = csharpType === 'string' ? 'text' : csharpType === 'bool' ? 'bool' : 'num'
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    ctx.useHelper('Vars')
    return {
      kind: 'action',
      statements: [
        `_${kind}[${stringLiteral(prop(node, 'VariableName'))}] = GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.GetValue<${csharpType}>(${stringLiteral(prop(node, 'PropertyId'))}) ?? default(${csharpType});`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

function listActions(): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ var b = GetBlock(${stringLiteral(prop(node, 'BlockName'))}); var actions = new List<ITerminalAction>(); b?.GetActions(actions); var sb = new System.Text.StringBuilder(); foreach (var a in actions) sb.AppendLine(a.Id + " (" + a.Name + ")"); Me.CustomData = sb.ToString(); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

function listProperties(): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ var b = GetBlock(${stringLiteral(prop(node, 'BlockName'))}); var props = new List<ITerminalProperty>(); b?.GetProperties(props); var sb = new System.Text.StringBuilder(); foreach (var p in props) sb.AppendLine(p.Id + " : " + p.TypeName); Me.CustomData = sb.ToString(); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}
