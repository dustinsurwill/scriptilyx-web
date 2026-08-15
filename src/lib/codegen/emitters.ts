import type { ScriptNode } from '../../types/graph'
import type { NodeEmitter } from './types'
import { boolLiteral, numberLiteral, stringLiteral } from './format'

function prop(node: ScriptNode, key: string): string {
  return node.Properties[key] ?? ''
}

// ---------------------------------------------------------------------------
// Factories — each returns a NodeEmitter for a family of ActionTypes that
// share the same C# shape and differ only in which SE interface/member they
// touch. Wrapping each statement in its own `{ }` scope lets every emitter
// reuse short local names (`v`, `blk`) without collisions when a method
// contains more than one such statement.
// ---------------------------------------------------------------------------

/** `{ if (GetBlock(name) is IFace v) v.Member = <value>; }` then advance via Next. */
function blockPropertySetter(
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
function blockMethodCall(iface: string, method: string, nameKey = 'BlockName'): NodeEmitter {
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
function groupPropertySetter(
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

/** Boolean condition: `GetBlock(name) is IFace v && v.Member <op> <compare>`. */
function blockCondition(
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

const enabledValue = (node: ScriptNode) => boolLiteral(prop(node, 'Enabled'))
const lockedValue = (node: ScriptNode) => boolLiteral(prop(node, 'Locked'))

// ---------------------------------------------------------------------------
// Generic terminal-block property access — works for every block/PB feature
// registered in the terminal system (SE's ModAPI `GetValue<T>`/`SetValue<T>`/
// `ApplyAction`), independent of whether a strongly-typed interface exists.
// Used both for the user-facing "generic" nodes and for AI Block / Event
// Controller nodes, whose interesting state (enabled aside) is exposed only
// through named terminal properties rather than bespoke C# interfaces.
// ---------------------------------------------------------------------------

function terminalPropertySetter<T extends string>(
  csharpType: T,
  valueExpr: (node: ScriptNode) => string,
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.SetValue<${csharpType}>(${stringLiteral(prop(node, 'PropertyId'))}, ${valueExpr(node)});`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

function terminalPropertyCondition<T extends string>(
  csharpType: T,
  compare: (getExpr: string, node: ScriptNode) => string,
): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    const getExpr = `(GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.GetValue<${csharpType}>(${stringLiteral(prop(node, 'PropertyId'))}) ?? default(${csharpType}))`
    return { kind: 'condition', expression: compare(getExpr, node) }
  }
}

function terminalAction(nameKey = 'BlockName'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `GetBlock(${stringLiteral(prop(node, nameKey))})?.ApplyAction(${stringLiteral(prop(node, 'ActionId'))});`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

function isWorkingCondition(negate = false): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    const expr = `GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.IsWorking ?? false`
    return { kind: 'condition', expression: negate ? `!(${expr})` : expr }
  }
}

// ---------------------------------------------------------------------------
// LCD / text-panel writer, reused by every "write status to an LCD" node.
// ---------------------------------------------------------------------------

function lcdWrite(textExpr: (node: ScriptNode) => string, nameKey = 'BlockName'): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, nameKey))}) is IMyTextSurface v) v.WriteText(${textExpr(node)}); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

function lcdGroupWrite(textExpr: (node: ScriptNode) => string): NodeEmitter {
  return (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'action',
      statements: [
        `foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})) { if (blk is IMyTextSurface v) v.WriteText(${textExpr(node)}); }`,
        ctx.next(node, 'Next'),
      ],
    }
  }
}

const statusLcd: NodeEmitter = lcdWrite(
  (node) =>
    `${stringLiteral(prop(node, 'BlockName') + ': ')} + ((GetBlock(${stringLiteral(prop(node, 'BlockName'))})?.IsWorking ?? false) ? "OK" : "Fault")`,
  'LcdName',
)

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const genericEmitters: Record<string, NodeEmitter> = {
  // --- Generic terminal block property access -----------------------------
  SetTerminalBool: terminalPropertySetter('bool', (n) => boolLiteral(prop(n, 'Value'))),
  SetTerminalFloat: terminalPropertySetter('float', (n) => numberLiteral(prop(n, 'Value'))),
  SetTerminalInt: terminalPropertySetter('long', (n) => `(long)${numberLiteral(prop(n, 'Value'))}`),
  SetTerminalString: terminalPropertySetter('string', (n) => stringLiteral(prop(n, 'Value'))),
  ApplyTerminalAction: terminalAction(),

  // --- Generic on/off ------------------------------------------------------
  SetBlockEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  SetGroupEnabled: groupPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),

  // --- Doors / lights / LCD / connectors -----------------------------------
  OpenDoor: blockMethodCall('IMyDoor', 'OpenDoor'),
  CloseDoor: blockMethodCall('IMyDoor', 'CloseDoor'),
  OpenDoorGroup: (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'action',
      statements: [
        `foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})) { if (blk is IMyDoor v) v.OpenDoor(); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  CloseDoorGroup: (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    return {
      kind: 'action',
      statements: [
        `foreach (var blk in GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))})) { if (blk is IMyDoor v) v.CloseDoor(); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  SetLightColor: blockPropertySetter(
    'IMyLightingBlock',
    'Color',
    (n) =>
      `new Color((int)${numberLiteral(prop(n, 'Red'))}, (int)${numberLiteral(prop(n, 'Green'))}, (int)${numberLiteral(prop(n, 'Blue'))})`,
  ),
  SetLcdText: lcdWrite((n) => stringLiteral(prop(n, 'Text'))),
  SetLcdGroupText: lcdGroupWrite((n) => stringLiteral(prop(n, 'Text'))),
  ConnectorConnect: blockMethodCall('IMyShipConnector', 'Connect'),
  ConnectorDisconnect: blockMethodCall('IMyShipConnector', 'Disconnect'),

  // --- Flight / thrusters / gyros ------------------------------------------
  SetThrusterOverridePercent: blockPropertySetter(
    'IMyThrust',
    'ThrustOverridePercentage',
    (n) => `(float)(${numberLiteral(prop(n, 'Percent'))} / 100.0)`,
  ),
  SetGyroOverride: blockPropertySetter('IMyGyro', 'GyroOverride', enabledValue),
  SetGyroYawPitchRoll: (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${name}) is IMyGyro v) { v.Yaw = ${numberLiteral(prop(node, 'Yaw'))}f; v.Pitch = ${numberLiteral(prop(node, 'Pitch'))}f; v.Roll = ${numberLiteral(prop(node, 'Roll'))}f; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },

  // --- Mechanical: pistons ---------------------------------------------------
  SetPistonVelocity: blockPropertySetter('IMyPistonBase', 'Velocity', (n) =>
    `(float)${numberLiteral(prop(n, 'Velocity'))}`,
  ),

  // --- Mechanical: rotors & hinges (both IMyMotorStator) --------------------
  SetRotorVelocity: blockPropertySetter('IMyMotorStator', 'TargetVelocityRPM', (n) =>
    `(float)${numberLiteral(prop(n, 'VelocityRPM'))}`,
  ),
  SetHingeVelocity: blockPropertySetter('IMyMotorStator', 'TargetVelocityRPM', (n) =>
    `(float)${numberLiteral(prop(n, 'VelocityRPM'))}`,
  ),
  SetRotorEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  SetHingeEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  SetRotorLock: blockPropertySetter('IMyMotorStator', 'RotorLock', lockedValue),
  SetHingeRotorLock: blockPropertySetter('IMyMotorStator', 'RotorLock', lockedValue),
  SetRotorTorque: blockPropertySetter('IMyMotorStator', 'Torque', (n) => `(float)${numberLiteral(prop(n, 'Torque'))}`),
  SetHingeTorque: blockPropertySetter('IMyMotorStator', 'Torque', (n) => `(float)${numberLiteral(prop(n, 'Torque'))}`),
  SetRotorBrakingTorque: blockPropertySetter('IMyMotorStator', 'BrakingTorque', (n) =>
    `(float)${numberLiteral(prop(n, 'BrakingTorque'))}`,
  ),
  SetHingeBrakingTorque: blockPropertySetter('IMyMotorStator', 'BrakingTorque', (n) =>
    `(float)${numberLiteral(prop(n, 'BrakingTorque'))}`,
  ),
  SetRotorDisplacement: blockPropertySetter('IMyMotorStator', 'Displacement', (n) =>
    `(float)${numberLiteral(prop(n, 'Displacement'))}`,
  ),
  SetHingeDisplacement: blockPropertySetter('IMyMotorStator', 'Displacement', (n) =>
    `(float)${numberLiteral(prop(n, 'Displacement'))}`,
  ),
  SetRotorShareInertiaTensor: blockPropertySetter('IMyMotorStator', 'ShareInertiaTensor', enabledValue),
  RotorAttach: blockMethodCall('IMyMotorStator', 'Attach'),
  RotorDetach: blockMethodCall('IMyMotorStator', 'Detach'),
  HingeAttach: blockMethodCall('IMyMotorStator', 'Attach'),
  HingeDetach: blockMethodCall('IMyMotorStator', 'Detach'),
  SetRotorLimits: (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${name}) is IMyMotorStator v) { v.LowerLimitDeg = (float)${numberLiteral(prop(node, 'LowerLimitDeg'))}; v.UpperLimitDeg = (float)${numberLiteral(prop(node, 'UpperLimitDeg'))}; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  SetHingeLimits: (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${name}) is IMyMotorStator v) { v.LowerLimitDeg = (float)${numberLiteral(prop(node, 'LowerLimitDeg'))}; v.UpperLimitDeg = (float)${numberLiteral(prop(node, 'UpperLimitDeg'))}; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  ClearRotorLimits: (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${name}) is IMyMotorStator v) { v.LowerLimitDeg = float.MinValue; v.UpperLimitDeg = float.MaxValue; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  ClearHingeLimits: (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${name}) is IMyMotorStator v) { v.LowerLimitDeg = float.MinValue; v.UpperLimitDeg = float.MaxValue; } }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  SetRotorStatusLcd: statusLcd,
  IfRotorLocked: blockCondition('IMyMotorStator', (v) => `${v}.RotorLock`),
  IfRotorAttached: blockCondition('IMyMotorStator', (v) => `${v}.TopGrid != null`),
  IfHingeAttached: blockCondition('IMyMotorStator', (v) => `${v}.TopGrid != null`),
  IfRotorAngleAbove: blockCondition(
    'IMyMotorStator',
    (v, n) => `${v}.Angle * 180.0 / Math.PI > ${numberLiteral(prop(n, 'AngleDeg'))}`,
  ),
  IfRotorAngleBelow: blockCondition(
    'IMyMotorStator',
    (v, n) => `${v}.Angle * 180.0 / Math.PI < ${numberLiteral(prop(n, 'AngleDeg'))}`,
  ),
  IfHingeAngleAbove: blockCondition(
    'IMyMotorStator',
    (v, n) => `${v}.Angle * 180.0 / Math.PI > ${numberLiteral(prop(n, 'AngleDeg'))}`,
  ),
  IfHingeAngleBelow: blockCondition(
    'IMyMotorStator',
    (v, n) => `${v}.Angle * 180.0 / Math.PI < ${numberLiteral(prop(n, 'AngleDeg'))}`,
  ),

  // --- Power / air / utility --------------------------------------------------
  TimerTrigger: blockMethodCall('IMyTimerBlock', 'Trigger'),
  TimerStart: blockMethodCall('IMyTimerBlock', 'StartCountdown'),
  TimerStop: blockMethodCall('IMyTimerBlock', 'StopCountdown'),
  SoundPlay: blockMethodCall('IMySoundBlock', 'Play'),
  SoundStop: blockMethodCall('IMySoundBlock', 'Stop'),
  SetGasTankStockpile: blockPropertySetter('IMyGasTank', 'Stockpile', enabledValue),
  SetAirVentDepressurize: blockPropertySetter('IMyAirVent', 'Depressurize', enabledValue),
  SetJumpDriveEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  SetJumpDriveRecharge: blockPropertySetter('IMyJumpDrive', 'Recharge', enabledValue),
  SetJumpDriveDistancePercent: (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    return {
      kind: 'action',
      statements: [
        `GetBlock(${name})?.SetValue<float>("JumpDistance", (float)(${numberLiteral(prop(node, 'Percent'))} / 100.0));`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  SetJumpDriveDistanceKm: (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'BlockName'))
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${name}) is IMyJumpDrive v) v.SetValue<float>("JumpDistance", (float)(${numberLiteral(prop(node, 'Kilometers'))} * 1000.0 / v.GetMaximumDistance())); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  SetJumpDriveStatusLcd: statusLcd,
  IfJumpDriveReady: blockCondition(
    'IMyJumpDrive',
    (v) => `${v}.Status == Sandbox.ModAPI.Ingame.MyJumpDriveStatus.Ready`,
  ),
  IfJumpDriveChargeAbove: blockCondition(
    'IMyJumpDrive',
    (v, n) => `${v}.CurrentStoredPower / ${v}.MaxStoredPower * 100.0 > ${numberLiteral(prop(n, 'Percent'))}`,
  ),
  IfJumpDriveChargeBelow: blockCondition(
    'IMyJumpDrive',
    (v, n) => `${v}.CurrentStoredPower / ${v}.MaxStoredPower * 100.0 < ${numberLiteral(prop(n, 'Percent'))}`,
  ),

  // --- Production / tools: on/off is SetBlockEnabled (registered once above) --

  // --- Checks: battery / cargo ------------------------------------------------
  BatteryBelow: blockCondition(
    'IMyBatteryBlock',
    (v, n) => `${v}.CurrentStoredPower / ${v}.MaxStoredPower * 100.0 < ${numberLiteral(prop(n, 'Percent'))}`,
  ),
  CargoPercentBelow: blockCondition(
    'IMyCargoContainer',
    (v, n) =>
      `(double)${v}.GetInventory(0).CurrentVolume / (double)${v}.GetInventory(0).MaxVolume * 100.0 < ${numberLiteral(prop(n, 'Percent'))}`,
  ),
  IfDoorState: blockCondition('IMyDoor', (v, n) => `${v}.Status.ToString() == ${stringLiteral(prop(n, 'State'))}`),
  IfGroupBlockState: (node, ctx) => {
    ctx.useHelper('GetGroupBlocks')
    const matchAll = prop(node, 'MatchMode').trim().toLowerCase() === 'all'
    const wantEnabled = boolLiteral(prop(node, 'State')) === 'true'
    const combinator = matchAll ? 'All' : 'Any'
    return {
      kind: 'condition',
      expression: `GetGroupBlocks(${stringLiteral(prop(node, 'GroupName'))}).${combinator}(blk => blk is IMyFunctionalBlock fb && fb.Enabled == ${wantEnabled})`,
    }
  },
  IfMergeBlockConnected: blockCondition('IMyShipMergeBlock', (v) => `${v}.IsConnected`),
  SetMergeBlockEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  SetSensorEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  IfSensorActive: blockCondition('IMySensorBlock', (v) => `${v}.IsActive`),

  // --- Conveyor sorter: confidently-typed subset -------------------------------
  SetConveyorSorterEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue, 'SorterName'),
  SetConveyorSorterDrainAll: blockPropertySetter('IMyConveyorSorter', 'DrainAll', enabledValue, 'SorterName'),
  IfConveyorSorterDrainAll: blockCondition('IMyConveyorSorter', (v) => `${v}.DrainAll`, 'SorterName'),
  SetConveyorSorterMode: blockPropertySetter(
    'IMyConveyorSorter',
    'Mode',
    (n) =>
      `Sandbox.ModAPI.Ingame.MyConveyorSorterMode.${prop(n, 'Mode').trim() === 'Blacklist' ? 'Blacklist' : 'Whitelist'}`,
    'SorterName',
  ),
  IfConveyorSorterModeIs: blockCondition(
    'IMyConveyorSorter',
    (v, n) => `${v}.Mode.ToString() == ${stringLiteral(prop(n, 'Mode'))}`,
    'SorterName',
  ),
  SetConveyorSorterStatusLcd: lcdWrite(
    (n) =>
      `${stringLiteral(prop(n, 'SorterName') + ': ')} + ((GetBlock(${stringLiteral(prop(n, 'SorterName'))})?.IsWorking ?? false) ? "OK" : "Fault")`,
    'LcdName',
  ),
  // IMyConveyorSorter.AddItem/RemoveItem/SetFilter/IsAllowed are real,
  // scriptable methods (see docs/codegen-api-notes.md) — items are matched
  // by a "TypeId/SubtypeId" string, e.g. "MyObjectBuilder_Ore/Iron".
  SetConveyorSorterFilter: (node, ctx) => {
    ctx.useHelper('GetBlock')
    const name = stringLiteral(prop(node, 'SorterName'))
    const mode = prop(node, 'Mode').trim() === 'Blacklist' ? 'Blacklist' : 'Whitelist'
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${name}) is IMyConveyorSorter s) {`,
        `    var filter = new List<MyInventoryItemFilter>();`,
        `    foreach (var line in (${stringLiteral(prop(node, 'FilterItems'))}).Split('\\n')) { var t = line.Trim(); if (t.Length > 0) filter.Add(new MyInventoryItemFilter(t, false)); }`,
        `    s.SetFilter(MyConveyorSorterMode.${mode}, filter);`,
        `    s.DrainAll = ${boolLiteral(prop(node, 'DrainAll'))};`,
        `} }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  ClearConveyorSorterFilter: (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'SorterName'))}) is IMyConveyorSorter s) s.SetFilter(s.Mode, new List<MyInventoryItemFilter>()); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  AddConveyorSorterFilterItem: (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'SorterName'))}) is IMyConveyorSorter s) s.AddItem(new MyInventoryItemFilter(${stringLiteral(prop(node, 'ItemId'))}, false)); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  RemoveConveyorSorterFilterItem: (node, ctx) => {
    ctx.useHelper('GetBlock')
    return {
      kind: 'action',
      statements: [
        `{ if (GetBlock(${stringLiteral(prop(node, 'SorterName'))}) is IMyConveyorSorter s) s.RemoveItem(new MyInventoryItemFilter(${stringLiteral(prop(node, 'ItemId'))}, false)); }`,
        ctx.next(node, 'Next'),
      ],
    }
  },
  IfConveyorSorterAllowsItem: blockCondition(
    'IMyConveyorSorter',
    (v, n) => `${v}.IsAllowed(MyDefinitionId.Parse(${stringLiteral(prop(n, 'ItemId'))}))`,
    'SorterName',
  ),

  // --- AI Blocks: enabled/apply-action/property access reuse the generic ------
  // terminal-property shapes (see module comment above).
  SetAiBlockEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  SetAiGroupEnabled: groupPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  AiBlockApplyAction: terminalAction(),
  SetAiBlockBool: terminalPropertySetter('bool', (n) => boolLiteral(prop(n, 'Value'))),
  SetAiBlockFloat: terminalPropertySetter('float', (n) => numberLiteral(prop(n, 'Value'))),
  SetAiBlockString: terminalPropertySetter('string', (n) => stringLiteral(prop(n, 'Value'))),
  SetAiBlockInt: terminalPropertySetter('long', (n) => `(long)${numberLiteral(prop(n, 'Value'))}`),
  SetAiStatusLcd: statusLcd,
  IfAiBlockEnabled: blockCondition('IMyFunctionalBlock', (v) => `${v}.Enabled`),
  IfAiBlockWorking: isWorkingCondition(),
  IfAiOffensiveHasTarget: terminalPropertyCondition('bool', (get) => get),
  IfAiBlockBoolTrue: terminalPropertyCondition('bool', (get) => get),
  IfAiBlockBoolFalse: terminalPropertyCondition('bool', (get) => `!${get}`),
  IfAiBlockFloatAbove: terminalPropertyCondition('float', (get, n) => `${get} > ${numberLiteral(prop(n, 'Value'))}`),
  IfAiBlockFloatBelow: terminalPropertyCondition('float', (get, n) => `${get} < ${numberLiteral(prop(n, 'Value'))}`),

  // --- Event Controller: same generic shapes as AI Blocks ----------------------
  SetEventControllerEnabled: blockPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  SetEventControllerGroupEnabled: groupPropertySetter('IMyFunctionalBlock', 'Enabled', enabledValue),
  EventControllerApplyAction: terminalAction(),
  SetEventControllerBool: terminalPropertySetter('bool', (n) => boolLiteral(prop(n, 'Value'))),
  SetEventControllerFloat: terminalPropertySetter('float', (n) => numberLiteral(prop(n, 'Value'))),
  SetEventControllerString: terminalPropertySetter('string', (n) => stringLiteral(prop(n, 'Value'))),
  SetEventControllerInt: terminalPropertySetter('long', (n) => `(long)${numberLiteral(prop(n, 'Value'))}`),
  SetEventControllerStatusLcd: statusLcd,
  IfEventControllerEnabled: blockCondition('IMyFunctionalBlock', (v) => `${v}.Enabled`),
  IfEventControllerWorking: isWorkingCondition(),
  IfEventControllerTriggered: terminalPropertyCondition('bool', (get) => get),
  IfEventControllerBoolTrue: terminalPropertyCondition('bool', (get) => get),
  IfEventControllerBoolFalse: terminalPropertyCondition('bool', (get) => `!${get}`),
  IfEventControllerFloatAbove: terminalPropertyCondition(
    'float',
    (get, n) => `${get} > ${numberLiteral(prop(n, 'Value'))}`,
  ),
  IfEventControllerFloatBelow: terminalPropertyCondition(
    'float',
    (get, n) => `${get} < ${numberLiteral(prop(n, 'Value'))}`,
  ),
}
