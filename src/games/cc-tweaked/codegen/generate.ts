import type { NodeConnection, ScriptNode } from '../../../types/graph'
import type { GenerateOptions, GenerateResult } from '../../../types/game'
import { findStartNodes, getReachableNodeIds } from '../../../lib/graph'

const LUA_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const LUA_RESERVED = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
  'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
])

/** ActionTypes whose listed properties each declare a new script-wide
 * variable (see collectVariables). Most declare one via `Name`; a few need
 * more than one value out (GPS position, rednet's message+sender, colony
 * stats), so this maps to a list of property keys rather than assuming
 * `Name` everywhere. */
const DECLARING_PROPERTIES: Record<string, string[]> = {
  SetVariable: ['Name'],
  NumberMath: ['Name'],
  JoinText: ['Name'],
  PeripheralCall: ['Name'],
  ReadDigitalInput: ['Name'],
  ReadAnalogInput: ['Name'],
  RednetReceive: ['NameMessage', 'NameSender'],
  GetItemCount: ['Name'],
  GetItemDetail: ['Name'],
  TurtleInspect: ['Name'],
  GetGpsPosition: ['NameX', 'NameY', 'NameZ'],
  GetFuelLevel: ['Name'],
  // Advanced Peripherals addon
  MeListItems: ['Name'],
  MeGetItemCount: ['Name'],
  RsGetItemCount: ['Name'],
  RedstoneIntegratorRead: ['Name'],
  ColonyGetStats: ['NameCitizens', 'NameHappiness'],
  EnvGetTime: ['Name'],
  EnvGetMoonPhase: ['Name'],
  EnvGetLightLevel: ['Name'],
  PlayerGetNearest: ['Name'],
  EnergyGetStored: ['Name'],
  EnergyGetFlow: ['Name'],
}

function isNumeric(raw: string): boolean {
  return raw.trim() !== '' && Number.isFinite(Number(raw.trim()))
}

function stringLiteral(raw: string): string {
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** A property value is a Lua number literal, a Lua boolean literal, a
 * reference to an already-declared variable, or (the fallback) plain text —
 * quoted as a Lua string. Unlike IC10 (numbers-only, register-scarce), Lua
 * is dynamically typed and has no meaningful "invalid value" here short of
 * an actual typo in a variable name, so this never warns — it just picks
 * the most sensible Lua literal for whatever the player typed. */
function resolveValue(raw: string | undefined, declared: Set<string>): string {
  const v = (raw ?? '').trim()
  if (v === '') return '""'
  if (declared.has(v)) return v
  if (v === 'true' || v === 'false') return v
  if (isNumeric(v)) return v
  return stringLiteral(v)
}

function fnName(node: ScriptNode): string {
  return `step${node.Number}`
}

const TURTLE_DIRECTION_SUFFIX: Record<string, string> = { Forward: '', Up: 'Up', Down: 'Down' }

function turtleSuffix(node: ScriptNode): string {
  return TURTLE_DIRECTION_SUFFIX[node.Properties.Direction ?? 'Forward'] ?? ''
}

/** Collects every name a node declares (see DECLARING_PROPERTIES), in
 * first-appearance order among reachable nodes. Unlike IC10 there's no
 * register cap to enforce — Lua locals are free — so this only guards
 * against genuinely invalid Lua identifiers (blank, a reserved word, or not
 * identifier-shaped), warning and simply not declaring those (a reference to
 * an undeclared name still falls through to resolveValue's literal-text
 * fallback, so generation never breaks, just produces a script the player
 * needs to fix). */
function collectVariables(reachable: ScriptNode[]): { names: string[]; declared: Set<string>; warnings: string[] } {
  const names: string[] = []
  const declared = new Set<string>()
  const warnings: string[] = []
  for (const node of reachable) {
    for (const key of DECLARING_PROPERTIES[node.ActionType] ?? []) {
      const name = (node.Properties[key] ?? '').trim()
      // '(none)' is PeripheralCall's DefaultValue for its optional result
      // variable — a genuinely blank/opt-out sentinel, not a typo, so it's
      // skipped silently rather than warned about (same convention IC10
      // uses for its optional DeviceName filter).
      if (!name || name === '(none)' || declared.has(name)) continue
      if (!LUA_IDENTIFIER_RE.test(name) || LUA_RESERVED.has(name)) {
        warnings.push(`${node.Title} #${node.Number}: "${name}" isn't a valid Lua variable name — pick a different one for "${key}".`)
        continue
      }
      declared.add(name)
      names.push(name)
    }
  }
  return { names, declared, warnings }
}

export function generateScript(
  nodes: ScriptNode[],
  connections: NodeConnection[],
  options: GenerateOptions = {},
): GenerateResult {
  const warnings: string[] = []
  const [start] = findStartNodes(nodes)
  if (!start) {
    return { source: '-- No Start node in the graph.', warnings }
  }

  const reachableIds = getReachableNodeIds(nodes, connections)
  const reachable = nodes.filter((n) => reachableIds.has(n.Id))
  const byId = new Map(nodes.map((n) => [n.Id, n]))

  const targetOf = (node: ScriptNode, port: string): ScriptNode => {
    const wire = connections.find((c) => c.FromNodeId === node.Id && c.FromPort === port)
    const target = wire ? byId.get(wire.ToNodeId) : undefined
    return target ?? start
  }

  const { names: variableNames, declared, warnings: variableWarnings } = collectVariables(reachable)
  warnings.push(...variableWarnings)

  const bodies: { node: ScriptNode; lines: string[] }[] = []

  for (const node of reachable) {
    const resolve = (key: string, fallback = '') => resolveValue(node.Properties[key] ?? fallback, declared)
    const side = (key = 'Side') => stringLiteral((node.Properties[key] ?? '').trim())
    const next = () => `return ${fnName(targetOf(node, 'Next'))}()`
    const lines: string[] = []

    switch (node.ActionType) {
      case 'Start': {
        lines.push(next())
        break
      }
      case 'WaitSeconds': {
        lines.push(`os.sleep(${resolve('Seconds', '1')})`)
        lines.push(next())
        break
      }
      case 'LoopToStart': {
        lines.push(`return ${fnName(start)}()`)
        break
      }
      case 'Print': {
        lines.push(`print(${resolve('Text')})`)
        lines.push(next())
        break
      }
      case 'CustomCode': {
        const code = node.Properties.Code ?? ''
        lines.push(...(code.length ? code.split('\n') : ['-- (empty)']))
        lines.push(next())
        break
      }

      case 'Compare': {
        const a = resolve('ValueA', '0')
        const b = resolve('ValueB', '0')
        const op = node.Properties.Operator ?? '=='
        lines.push(...branchNoNext(`${a} ${op} ${b}`, targetOf(node, 'True'), targetOf(node, 'False')))
        break
      }
      case 'TextEquals': {
        lines.push(...branchNoNext(`${resolve('ValueA')} == ${resolve('ValueB')}`, targetOf(node, 'True'), targetOf(node, 'False')))
        break
      }

      case 'SetVariable': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = ${resolve('Value')}` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'NumberMath': {
        const name = (node.Properties.Name ?? '').trim()
        const a = resolve('ValueA', '0')
        const b = resolve('ValueB', '0')
        const expr = NUMBER_MATH_EXPR[node.Properties.Operator ?? 'Add']?.(a, b) ?? `${a} + ${b}`
        lines.push(declared.has(name) ? `${name} = ${expr}` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'JoinText': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = tostring(${resolve('ValueA')}) .. tostring(${resolve('ValueB')})` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }

      case 'PeripheralPresent': {
        lines.push(...branchNoNext(`peripheral.isPresent(${side()})`, targetOf(node, 'True'), targetOf(node, 'False')))
        break
      }
      case 'PeripheralCall': {
        const name = (node.Properties.Name ?? '(none)').trim()
        const args = [node.Properties.Arg1, node.Properties.Arg2, node.Properties.Arg3]
          .filter((a) => (a ?? '').trim() !== '')
          .map((a) => resolveValue(a, declared))
        const call = `peripheral.call(${side()}, ${stringLiteral((node.Properties.Method ?? '').trim())}${args.length ? ', ' + args.join(', ') : ''})`
        lines.push(name && name !== '(none)' && declared.has(name) ? `${name} = ${call}` : call)
        lines.push(next())
        break
      }

      case 'ReadDigitalInput': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = redstone.getInput(${side()})` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'WriteDigitalOutput': {
        lines.push(`redstone.setOutput(${side()}, ${resolve('Value', 'true')})`)
        lines.push(next())
        break
      }
      case 'ReadAnalogInput': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = redstone.getAnalogInput(${side()})` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'WriteAnalogOutput': {
        lines.push(`redstone.setAnalogOutput(${side()}, ${resolve('Value', '15')})`)
        lines.push(next())
        break
      }

      case 'RednetOpen': {
        lines.push(`rednet.open(${side()})`)
        lines.push(next())
        break
      }
      case 'RednetHost': {
        lines.push(`rednet.host(${resolve('Protocol')}, ${resolve('Hostname')})`)
        lines.push(next())
        break
      }
      case 'RednetSend': {
        lines.push(`rednet.send(${resolve('Recipient')}, ${resolve('Message')}, ${resolve('Protocol')})`)
        lines.push(next())
        break
      }
      case 'RednetBroadcast': {
        lines.push(`rednet.broadcast(${resolve('Message')}, ${resolve('Protocol')})`)
        lines.push(next())
        break
      }
      case 'RednetReceive': {
        const msgName = (node.Properties.NameMessage ?? '').trim()
        const senderName = (node.Properties.NameSender ?? '').trim()
        const timeout = resolve('Timeout', '0')
        // Both values land in temp locals first, then get copied into
        // whichever of the two named variables are actually valid — avoids
        // getting rednet's sender/message return order backwards depending
        // on which one (if either) the player named.
        lines.push(`local rnSender, rnMessage = rednet.receive(${resolve('Protocol')}, ${timeout} > 0 and ${timeout} or nil)`)
        if (declared.has(senderName)) lines.push(`if rnSender ~= nil then ${senderName} = rnSender end`)
        if (declared.has(msgName)) lines.push(`if rnSender ~= nil then ${msgName} = rnMessage end`)
        lines.push('if rnSender ~= nil then')
        lines.push(`  return ${fnName(targetOf(node, 'Received'))}()`)
        lines.push('else')
        lines.push(`  return ${fnName(targetOf(node, 'TimedOut'))}()`)
        lines.push('end')
        break
      }

      case 'TurtleMoveForward': lines.push(...branchNoNext('turtle.forward()', targetOf(node, 'Moved'), targetOf(node, 'Blocked'))); break
      case 'TurtleMoveBack': lines.push(...branchNoNext('turtle.back()', targetOf(node, 'Moved'), targetOf(node, 'Blocked'))); break
      case 'TurtleMoveUp': lines.push(...branchNoNext('turtle.up()', targetOf(node, 'Moved'), targetOf(node, 'Blocked'))); break
      case 'TurtleMoveDown': lines.push(...branchNoNext('turtle.down()', targetOf(node, 'Moved'), targetOf(node, 'Blocked'))); break
      case 'TurtleTurnLeft': lines.push('turtle.turnLeft()'); lines.push(next()); break
      case 'TurtleTurnRight': lines.push('turtle.turnRight()'); lines.push(next()); break

      case 'TurtleDig': lines.push(...branchNoNext(`turtle.dig${turtleSuffix(node)}()`, targetOf(node, 'Dug'), targetOf(node, 'Empty'))); break
      case 'TurtlePlace': lines.push(...branchNoNext(`turtle.place${turtleSuffix(node)}()`, targetOf(node, 'Placed'), targetOf(node, 'Failed'))); break
      case 'TurtleDetect': lines.push(...branchNoNext(`turtle.detect${turtleSuffix(node)}()`, targetOf(node, 'True'), targetOf(node, 'False'))); break
      case 'TurtleInspect': {
        const name = (node.Properties.Name ?? '').trim()
        const found = declared.has(name) ? `local ok, data = turtle.inspect${turtleSuffix(node)}()` : `local ok = turtle.inspect${turtleSuffix(node)}()`
        lines.push(found)
        if (declared.has(name)) lines.push(`if ok then ${name} = data.name end`)
        lines.push(`if ok then`)
        lines.push(`  return ${fnName(targetOf(node, 'Found'))}()`)
        lines.push(`else`)
        lines.push(`  return ${fnName(targetOf(node, 'Empty'))}()`)
        lines.push(`end`)
        break
      }

      case 'TurtleSelectSlot': {
        lines.push(`turtle.select(${resolve('Slot', '1')})`)
        lines.push(next())
        break
      }
      case 'GetItemCount': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = turtle.getItemCount(${resolve('Slot', '1')})` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'GetItemDetail': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(`local detail = turtle.getItemDetail(${resolve('Slot', '1')})`)
        if (declared.has(name)) lines.push(`${name} = detail and detail.name or ""`)
        lines.push(next())
        break
      }
      case 'TurtleSuck': lines.push(...branchNoNext(`turtle.suck${turtleSuffix(node)}()`, targetOf(node, 'Sucked'), targetOf(node, 'Empty'))); break
      case 'TurtleDrop': lines.push(...branchNoNext(`turtle.drop${turtleSuffix(node)}(${resolve('Count', '0')})`, targetOf(node, 'Dropped'), targetOf(node, 'Failed'))); break
      case 'TurtleRefuel': lines.push(...branchNoNext(`turtle.refuel(${resolve('Count', '0')})`, targetOf(node, 'Refueled'), targetOf(node, 'NoFuel'))); break

      case 'GetGpsPosition': {
        const nx = (node.Properties.NameX ?? '').trim()
        const ny = (node.Properties.NameY ?? '').trim()
        const nz = (node.Properties.NameZ ?? '').trim()
        lines.push('local gx, gy, gz = gps.locate()')
        if (declared.has(nx)) lines.push(`if gx ~= nil then ${nx} = gx end`)
        if (declared.has(ny)) lines.push(`if gy ~= nil then ${ny} = gy end`)
        if (declared.has(nz)) lines.push(`if gz ~= nil then ${nz} = gz end`)
        lines.push('if gx ~= nil then')
        lines.push(`  return ${fnName(targetOf(node, 'Found'))}()`)
        lines.push('else')
        lines.push(`  return ${fnName(targetOf(node, 'NotFound'))}()`)
        lines.push('end')
        break
      }
      case 'GetFuelLevel': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = turtle.getFuelLevel()` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }

      case 'ClearMonitor': lines.push(`peripheral.call(${side()}, "clear")`); lines.push(next()); break
      case 'WriteToMonitor': {
        lines.push(`peripheral.call(${side()}, "setCursorPos", ${resolve('Column', '1')}, ${resolve('Row', '1')})`)
        lines.push(`peripheral.call(${side()}, "write", ${resolve('Text')})`)
        lines.push(next())
        break
      }
      case 'SetMonitorScale': lines.push(`peripheral.call(${side()}, "setTextScale", ${resolve('Scale', '1')})`); lines.push(next()); break
      case 'SetMonitorColors': {
        lines.push(`peripheral.call(${side()}, "setBackgroundColor", colors.${node.Properties.Background ?? 'black'})`)
        lines.push(`peripheral.call(${side()}, "setTextColor", colors.${node.Properties.Text ?? 'white'})`)
        lines.push(next())
        break
      }

      case 'PlayNote': {
        lines.push(`peripheral.call(${side()}, "playNote", ${stringLiteral((node.Properties.Instrument ?? 'harp').trim())}, ${resolve('Volume', '1')}, ${resolve('Pitch', '12')})`)
        lines.push(next())
        break
      }
      case 'PlaySound': {
        lines.push(`peripheral.call(${side()}, "playSound", ${resolve('Sound')}, ${resolve('Volume', '1')})`)
        lines.push(next())
        break
      }

      case 'IsDiskPresent': lines.push(...branchNoNext(`peripheral.call(${side()}, "isDiskPresent")`, targetOf(node, 'True'), targetOf(node, 'False'))); break
      case 'EjectDisk': lines.push(`peripheral.call(${side()}, "ejectDisk")`); lines.push(next()); break

      // ── Advanced Peripherals addon ──────────────────────────────────
      case 'MeListItems': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(`local items = peripheral.call(${side()}, "listItems")`)
        if (declared.has(name)) lines.push(`${name} = #items`)
        lines.push(next())
        break
      }
      case 'MeGetItemCount':
      case 'RsGetItemCount': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = peripheral.call(${side()}, "getItemCount", ${resolve('Item')})` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'MePushItem':
      case 'RsPushItem': {
        lines.push(...branchNoNext(
          `peripheral.call(${side()}, "pushItem", ${resolve('Item')}, ${resolve('Count', '1')}, ${resolve('ToSide')})`,
          targetOf(node, 'Pushed'),
          targetOf(node, 'Failed'),
        ))
        break
      }
      case 'MePullItem':
      case 'RsPullItem': {
        lines.push(...branchNoNext(
          `peripheral.call(${side()}, "pullItem", ${resolve('Item')}, ${resolve('Count', '1')}, ${resolve('FromSide')})`,
          targetOf(node, 'Pulled'),
          targetOf(node, 'Failed'),
        ))
        break
      }
      case 'MeCraftItem':
      case 'RsCraftItem': {
        lines.push(...branchNoNext(
          `peripheral.call(${side()}, "craftItem", ${resolve('Item')}, ${resolve('Count', '1')})`,
          targetOf(node, 'Started'),
          targetOf(node, 'Failed'),
        ))
        break
      }

      case 'ChatBoxSend': {
        lines.push(`peripheral.call(${side()}, "sendMessage", ${resolve('Message')}, ${resolve('Prefix', '[Computer]')})`)
        lines.push(next())
        break
      }
      case 'ChatBoxSendToPlayer': {
        lines.push(`peripheral.call(${side()}, "sendMessageToPlayer", ${resolve('Message')}, ${resolve('Player')}, ${resolve('Prefix', '[Computer]')})`)
        lines.push(next())
        break
      }

      case 'RedstoneIntegratorRead': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = peripheral.call(${side()}, "getInput", ${resolve('TargetSide')})` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'RedstoneIntegratorWrite': {
        lines.push(`peripheral.call(${side()}, "setOutput", ${resolve('TargetSide')}, ${resolve('Value', 'true')})`)
        lines.push(next())
        break
      }

      case 'ColonyGetStats': {
        const nc = (node.Properties.NameCitizens ?? '').trim()
        const nh = (node.Properties.NameHappiness ?? '').trim()
        lines.push(`local stats = peripheral.call(${side()}, "getColony")`)
        if (declared.has(nc)) lines.push(`${nc} = stats and stats.citizens or 0`)
        if (declared.has(nh)) lines.push(`${nh} = stats and stats.happiness or 0`)
        lines.push(next())
        break
      }
      case 'ColonyIsInColony': lines.push(...branchNoNext(`peripheral.call(${side()}, "isInColony")`, targetOf(node, 'True'), targetOf(node, 'False'))); break

      case 'EnvGetTime': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = peripheral.call(${side()}, "getTime")` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'EnvGetMoonPhase': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = peripheral.call(${side()}, "getMoonPhase")` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'EnvGetLightLevel': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = peripheral.call(${side()}, "getBlockLightLevel")` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }

      case 'PlayerInRange': lines.push(...branchNoNext(`peripheral.call(${side()}, "isPlayerInRange", ${resolve('Player')})`, targetOf(node, 'True'), targetOf(node, 'False'))); break
      case 'PlayerGetNearest': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(`local nearest = peripheral.call(${side()}, "getNearestPlayer")`)
        if (declared.has(name)) lines.push(`if nearest then ${name} = nearest end`)
        lines.push('if nearest then')
        lines.push(`  return ${fnName(targetOf(node, 'Found'))}()`)
        lines.push('else')
        lines.push(`  return ${fnName(targetOf(node, 'NotFound'))}()`)
        lines.push('end')
        break
      }

      case 'EnergyGetStored': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = peripheral.call(${side()}, "getEnergyStored")` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }
      case 'EnergyGetFlow': {
        const name = (node.Properties.Name ?? '').trim()
        lines.push(declared.has(name) ? `${name} = peripheral.call(${side()}, "getTransferRate")` : `-- (invalid variable name "${name}")`)
        lines.push(next())
        break
      }

      default: {
        lines.push(`-- TODO codegen: ${node.ActionType} ("${node.Title}") not yet implemented.`)
        lines.push(next())
      }
    }

    bodies.push({ node, lines })
  }

  const outputLines: string[] = ['-- Generated by WireRig']
  if (variableNames.length) outputLines.push(`local ${variableNames.join(', ')}`)
  outputLines.push(`local ${reachable.map(fnName).join(', ')}`)
  for (const { node, lines } of bodies) {
    if (options.professionalComments) outputLines.push(`-- #${node.Number} ${node.Title}`)
    outputLines.push(`${fnName(node)} = function()`)
    outputLines.push(...lines.map((l) => `  ${l}`))
    outputLines.push('end')
  }
  outputLines.push(`${fnName(start)}()`)

  return { source: outputLines.join('\n'), warnings }
}

/** True/False (or Moved/Blocked, Dug/Empty, ...)-style branch as a tail-call
 * if/else — both arms end in `return stepN()`, a real Lua tail call, so
 * chains of branches (e.g. a turtle mining loop) run in O(1) stack space
 * instead of growing the call stack every iteration. */
function branchNoNext(cond: string, trueNode: ScriptNode, falseNode: ScriptNode): string[] {
  return [`if ${cond} then`, `  return ${fnName(trueNode)}()`, `else`, `  return ${fnName(falseNode)}()`, `end`]
}

const NUMBER_MATH_EXPR: Record<string, (a: string, b: string) => string> = {
  Add: (a, b) => `${a} + ${b}`,
  Subtract: (a, b) => `${a} - ${b}`,
  Multiply: (a, b) => `${a} * ${b}`,
  Divide: (a, b) => `${a} / ${b}`,
  Modulo: (a, b) => `${a} % ${b}`,
  Min: (a, b) => `math.min(${a}, ${b})`,
  Max: (a, b) => `math.max(${a}, ${b})`,
  Round: (a) => `math.floor(${a} + 0.5)`,
  Floor: (a) => `math.floor(${a})`,
  Ceil: (a) => `math.ceil(${a})`,
  Abs: (a) => `math.abs(${a})`,
  Sqrt: (a) => `math.sqrt(${a})`,
  Power: (a, b) => `${a} ^ ${b}`,
}
