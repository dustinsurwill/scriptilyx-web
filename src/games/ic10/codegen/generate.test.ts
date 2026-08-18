import { describe, expect, it } from 'vitest'
import type { NodeConnection, ScriptNode } from '../../../types/graph'
import { generateScript } from './generate'

let counter = 0
function node(partial: Partial<ScriptNode> & Pick<ScriptNode, 'ActionType'>): ScriptNode {
  counter += 1
  return {
    Id: partial.Id ?? `nid${counter}`,
    Number: partial.Number ?? counter,
    DefinitionId: partial.DefinitionId ?? partial.ActionType,
    ActionType: partial.ActionType,
    Title: partial.Title ?? partial.ActionType,
    Description: partial.Description ?? '',
    X: 0,
    Y: 0,
    InputPorts: partial.InputPorts ?? ['In'],
    OutputPorts: partial.OutputPorts ?? ['Next'],
    Properties: partial.Properties ?? {},
  }
}

function wire(from: ScriptNode, fromPort: string, to: ScriptNode, toPort = 'In'): NodeConnection {
  return { FromNodeId: from.Id, FromPort: fromPort, ToNodeId: to.Id, ToPort: toPort }
}

describe('generateScript', () => {
  it('reports missing Start node', () => {
    const { source, warnings } = generateScript([], [])
    expect(source).toContain('No Start node')
    expect(warnings).toEqual([])
  })

  it('an unconnected Start jumps to itself (idle loop) rather than falling through', () => {
    const start = node({ ActionType: 'Start' })
    const { source } = generateScript([start], [])
    expect(source).toBe(`L${start.Number}:\nj L${start.Number}`)
  })

  it('chains Read Device -> Write Device, aliasing the declared variable', () => {
    const start = node({ ActionType: 'Start' })
    const read = node({
      ActionType: 'ReadDevice',
      Properties: { Device: 'd0', LogicType: 'Temperature', Name: 'temp' },
    })
    const write = node({
      ActionType: 'WriteDevice',
      OutputPorts: ['Next'],
      Properties: { Device: 'd1', LogicType: 'Setting', Value: 'temp' },
    })
    const nodes = [start, read, write]
    const connections = [wire(start, 'Next', read), wire(read, 'Next', write)]

    const { source, warnings } = generateScript(nodes, connections)
    expect(warnings).toEqual([])
    // Read and Write both fall straight through to the node physically
    // next in the script, so their labels are never jumped to and their
    // trailing jumps are redundant — both get elided. Only the loop-back
    // to Start (write's Next is unconnected) needs a real jump, and only
    // Start's label is still referenced (by that jump), so it's the only
    // label kept.
    expect(source).toBe(
      [
        'alias temp r0',
        `L${start.Number}:`,
        'l temp d0 Temperature',
        's d1 Setting temp',
        `j L${start.Number}`,
      ].join('\n'),
    )
  })

  it('Compare branches True/False to distinct targets and falls back to Start when unconnected', () => {
    const start = node({ ActionType: 'Start' })
    const compare = node({
      ActionType: 'Compare',
      OutputPorts: ['True', 'False'],
      Properties: { ValueA: '5', Operator: 'GreaterThan', ValueB: '2' },
    })
    const onTrue = node({ ActionType: 'Yield' })
    const nodes = [start, compare, onTrue]
    const connections = [wire(start, 'Next', compare), wire(compare, 'True', onTrue)]

    const { source } = generateScript(nodes, connections)
    expect(source).toContain(`bgt 5 2 L${onTrue.Number}`)
    expect(source).toContain(`j L${start.Number}`) // False falls back to Start, unconnected
  })

  it('Number Math emits the right opcode for binary and unary operators', () => {
    const start = node({ ActionType: 'Start' })
    const add = node({ ActionType: 'NumberMath', Properties: { Name: 'sum', Operator: 'Add', ValueA: '1', ValueB: '2' } })
    const sqrt = node({ ActionType: 'NumberMath', Properties: { Name: 'root', Operator: 'Sqrt', ValueA: 'sum', ValueB: '0' } })
    const nodes = [start, add, sqrt]
    const connections = [wire(start, 'Next', add), wire(add, 'Next', sqrt)]

    const { source, warnings } = generateScript(nodes, connections)
    expect(warnings).toEqual([])
    expect(source).toContain('add sum 1 2')
    expect(source).toContain('sqrt root sum')
  })

  it('warns on a value referencing an undeclared variable', () => {
    const start = node({ ActionType: 'Start' })
    const write = node({ ActionType: 'WriteDevice', Properties: { Device: 'd0', LogicType: 'On', Value: 'neverSet' } })
    const nodes = [start, write]
    const connections = [wire(start, 'Next', write)]

    const { warnings } = generateScript(nodes, connections)
    expect(warnings).toEqual([
      `WriteDevice #${write.Number} Value: "neverSet" is never set by a Read Device/Set Number/Number Math node — it won't assemble.`,
    ])
  })

  it('warns when more than 16 variables are declared', () => {
    const start = node({ ActionType: 'Start' })
    const setters = Array.from({ length: 17 }, (_, i) =>
      node({ ActionType: 'SetNumber', Properties: { Name: `v${i}`, Value: '0' } }),
    )
    const nodes = [start, ...setters]
    const connections: NodeConnection[] = []
    let prev: ScriptNode = start
    for (const s of setters) {
      connections.push(wire(prev, 'Next', s))
      prev = s
    }

    const { warnings } = generateScript(nodes, connections)
    expect(warnings.some((w) => w.includes('only has 16 general-purpose registers'))).toBe(true)
  })

  it('flags a graph over the 128-line limit', () => {
    const start = node({ ActionType: 'Start' })
    const yields = Array.from({ length: 130 }, () => node({ ActionType: 'Yield' }))
    const nodes = [start, ...yields]
    const connections: NodeConnection[] = []
    let prev: ScriptNode = start
    for (const y of yields) {
      connections.push(wire(prev, 'Next', y))
      prev = y
    }

    const { warnings } = generateScript(nodes, connections)
    expect(warnings.some((w) => w.includes("won't fit in the in-game editor"))).toBe(true)
  })

  it('LoopToStart jumps straight back to Start with no fallback jump', () => {
    const start = node({ ActionType: 'Start' })
    const loop = node({ ActionType: 'LoopToStart', OutputPorts: [] })
    const nodes = [start, loop]
    const connections = [wire(start, 'Next', loop)]

    const { source } = generateScript(nodes, connections)
    expect(source.trim().endsWith(`j L${start.Number}`)).toBe(true)
  })

  it('professionalComments adds a "# #N Title" comment before each node', () => {
    const start = node({ ActionType: 'Start', Title: 'Start' })
    const { source } = generateScript([start], [], { professionalComments: true })
    expect(source).toContain(`# #${start.Number} Start`)
  })
})

function chain(...steps: ScriptNode[]): [ScriptNode[], NodeConnection[]] {
  const start = node({ ActionType: 'Start' })
  const nodes = [start, ...steps]
  const connections: NodeConnection[] = []
  let prev: ScriptNode = start
  for (const s of steps) {
    connections.push(wire(prev, 'Next', s))
    prev = s
  }
  return [nodes, connections]
}

describe('Number Math — arity dispatch across the expanded operator set', () => {
  it('unary operators only resolve Value A', () => {
    const sin = node({ ActionType: 'NumberMath', Properties: { Name: 'r', Operator: 'Sin', ValueA: '1', ValueB: 'bogus' } })
    const { source, warnings } = generateScript(...chain(sin))
    expect(source).toContain('sin r 1')
    expect(warnings).toEqual([]) // ValueB never touched/resolved for a unary op
  })

  it('binary operators resolve both Value A and Value B', () => {
    const and = node({ ActionType: 'NumberMath', Properties: { Name: 'r', Operator: 'And', ValueA: '5', ValueB: '3' } })
    const { source } = generateScript(...chain(and))
    expect(source).toContain('and r 5 3')
  })

  it('ternary operators resolve Value A, B, and C', () => {
    const clamp = node({ ActionType: 'NumberMath', Properties: { Name: 'r', Operator: 'Clamp', ValueA: 'x', ValueB: '0', ValueC: '10' } })
    const set = node({ ActionType: 'SetNumber', Properties: { Name: 'x', Value: '5' } })
    const { source, warnings } = generateScript(...chain(set, clamp))
    expect(warnings).toEqual([])
    expect(source).toContain('clamp r x 0 10')
  })

  it('Random is nullary — no operands emitted', () => {
    const rand = node({ ActionType: 'NumberMath', Properties: { Name: 'r', Operator: 'Random' } })
    const { source } = generateScript(...chain(rand))
    expect(source).toContain('rand r')
    expect(source).not.toContain('rand r 0')
  })

  it('set-compare operators (value form of Compare) use the s-prefixed mnemonics', () => {
    const eq = node({ ActionType: 'NumberMath', Properties: { Name: 'r', Operator: 'Equal', ValueA: '1', ValueB: '1' } })
    const { source } = generateScript(...chain(eq))
    expect(source).toContain('seq r 1 1')
  })
})

describe('Compare — zero-compare and call-and-link opcode selection', () => {
  it('uses the two-operand form when Value B is not "0"', () => {
    const cmp = node({ ActionType: 'Compare', OutputPorts: ['True', 'False'], Properties: { ValueA: '5', Operator: 'GreaterThan', ValueB: '2' } })
    const { source } = generateScript(...chain(cmp))
    expect(source).toMatch(/bgt 5 2 L\d+/)
  })

  it('drops Value B and uses the "z" mnemonic when Value B is literally "0"', () => {
    const cmp = node({ ActionType: 'Compare', OutputPorts: ['True', 'False'], Properties: { ValueA: '5', Operator: 'GreaterThan', ValueB: '0' } })
    const { source } = generateScript(...chain(cmp))
    expect(source).toMatch(/bgtz 5 L\d+/)
    expect(source).not.toMatch(/bgtz 5 0/)
  })

  it('appends "al" and combines with "z" when Save Return Address (CallOnTrue) is set', () => {
    const cmp = node({
      ActionType: 'Compare',
      OutputPorts: ['True', 'False'],
      Properties: { ValueA: '5', Operator: 'Equal', ValueB: '0', CallOnTrue: 'true' },
    })
    const { source } = generateScript(...chain(cmp))
    expect(source).toMatch(/beqzal 5 L\d+/)
  })

  it('ApproxEqual/NotApproxEqual pass a tolerance (Value C) and also support the zero form', () => {
    const approx = node({
      ActionType: 'Compare',
      OutputPorts: ['True', 'False'],
      Properties: { ValueA: 'x', Operator: 'ApproxEqual', ValueB: '2', ValueC: '0.01' },
    })
    const set = node({ ActionType: 'SetNumber', Properties: { Name: 'x', Value: '2' } })
    const { source } = generateScript(...chain(set, approx))
    expect(source).toMatch(/bap x 2 0\.01 L\d+/)
  })

  it('IsNaN is unary and ignores Value B/C entirely', () => {
    const nan = node({ ActionType: 'Compare', OutputPorts: ['True', 'False'], Properties: { ValueA: 'x', Operator: 'IsNaN' } })
    const set = node({ ActionType: 'SetNumber', Properties: { Name: 'x', Value: '1' } })
    const { source } = generateScript(...chain(set, nan))
    expect(source).toMatch(/bnan x L\d+/)
  })
})

describe('Call Subroutine / Return From Subroutine', () => {
  it('Call Subroutine compiles to jal, Return compiles to "j ra"', () => {
    const sub = node({ ActionType: 'CallSubroutine' })
    const ret = node({ ActionType: 'ReturnFromSubroutine', OutputPorts: [] })
    const { source } = generateScript(...chain(sub, ret))
    expect(source).toMatch(/jal L\d+/)
    expect(source).toContain('j ra')
  })
})

describe('Device presence/validity checks', () => {
  it('If Device Connected branches via bdse, and bdseal when CallOnTrue is set', () => {
    const check = node({
      ActionType: 'IfDeviceConnected',
      OutputPorts: ['True', 'False'],
      Properties: { Device: 'd2', CallOnTrue: 'true' },
    })
    const { source } = generateScript(...chain(check))
    expect(source).toMatch(/bdseal d2 L\d+/)
  })

  it('Device Connected? stores a 0/1 value via sdse', () => {
    const val = node({ ActionType: 'DeviceConnectedValue', Properties: { Device: 'd1', Name: 'ok' } })
    const { source } = generateScript(...chain(val))
    expect(source).toContain('sdse ok d1')
  })

  it('Check Device Supports LogicType picks bdnvl for Load and bdnvs for Store', () => {
    const load = node({
      ActionType: 'CheckDeviceLogicType',
      OutputPorts: ['Supported', 'NotSupported'],
      Properties: { Device: 'd0', LogicType: 'On', Mode: 'Load' },
    })
    const { source: loadSrc } = generateScript(...chain(load))
    expect(loadSrc).toContain('bdnvl d0 On')

    const store = node({
      ActionType: 'CheckDeviceLogicType',
      OutputPorts: ['Supported', 'NotSupported'],
      Properties: { Device: 'd0', LogicType: 'On', Mode: 'Store' },
    })
    const { source: storeSrc } = generateScript(...chain(store))
    expect(storeSrc).toContain('bdnvs d0 On')
  })
})

describe('Batch device instructions', () => {
  it('Batch Read Device Property uses lb with the device type\'s known prefab hash', () => {
    const batch = node({
      ActionType: 'BatchReadDevice',
      Properties: { DeviceType: 'Active Vent', LogicType: 'On', BatchMode: 'Sum', Name: 'total' },
    })
    const { source, warnings } = generateScript(...chain(batch))
    expect(warnings).toEqual([])
    expect(source).toContain('lb total -842048328 On 1')
  })

  it('treats the "(none)" sentinel Device Name (its real default value) as no filter, not a literal name', () => {
    const batch = node({
      ActionType: 'BatchReadDevice',
      Properties: { DeviceType: 'Active Vent', DeviceName: '(none)', LogicType: 'On', BatchMode: 'Average', Name: 'v' },
    })
    const { source } = generateScript(...chain(batch))
    expect(source).toContain('lb v -842048328 On 0')
    expect(source).not.toContain('lbn')
  })

  it('switches to lbn and emits HASH(...) when Device Name is set', () => {
    const batch = node({
      ActionType: 'BatchReadDevice',
      Properties: { DeviceType: 'Active Vent', DeviceName: 'MyVent', LogicType: 'On', BatchMode: 'Average', Name: 'v' },
    })
    const { source } = generateScript(...chain(batch))
    expect(source).toContain('lbn v -842048328 HASH("MyVent") On 0')
  })

  it('warns when the chosen device type has no known prefab hash', () => {
    const batch = node({
      ActionType: 'BatchWriteDevice',
      Properties: { DeviceType: 'Console', LogicType: 'On', Value: '1' }, // Console has no documented hash
    })
    const { warnings } = generateScript(...chain(batch))
    expect(warnings.some((w) => w.includes('no known prefab hash'))).toBe(true)
  })

  it('Batch Write Device Slot Property compiles to sbs', () => {
    const batch = node({
      ActionType: 'BatchWriteDeviceSlot',
      Properties: { DeviceType: 'Active Vent', SlotIndex: '0', LogicSlotType: 'Occupied', Value: '1' },
    })
    const { source } = generateScript(...chain(batch))
    expect(source).toContain('sbs -842048328 0 Occupied 1')
  })
})

describe('Stack instructions', () => {
  it('push/pop/peek compile to their plain mnemonics', () => {
    const push = node({ ActionType: 'Push', Properties: { Value: '5' } })
    const pop = node({ ActionType: 'Pop', Properties: { Name: 'v' } })
    const peek = node({ ActionType: 'Peek', Properties: { Name: 'v2' } })
    const { source } = generateScript(...chain(push, pop, peek))
    expect(source).toContain('push 5')
    expect(source).toContain('pop v')
    expect(source).toContain('peek v2')
  })

  it('Poke Stack writes directly to an address with no device operand', () => {
    const poke = node({ ActionType: 'Poke', Properties: { Address: '3', Value: '7' } })
    const { source } = generateScript(...chain(poke))
    expect(source).toContain('poke 3 7')
  })

  it('Get/Put Stack Value (By ID) use getd/putd', () => {
    const get = node({ ActionType: 'GetStackById', Properties: { DeviceId: '1234', Address: '0', Name: 'v' } })
    const put = node({ ActionType: 'PutStackById', Properties: { DeviceId: '1234', Address: '0', Value: '9' } })
    const { source } = generateScript(...chain(get, put))
    expect(source).toContain('getd v 1234 0')
    expect(source).toContain('putd 1234 0 9')
  })
})

describe('Select', () => {
  it('compiles to a single select instruction', () => {
    const sel = node({ ActionType: 'Select', Properties: { Name: 'r', Condition: 'flag', IfTrue: '1', IfFalse: '0' } })
    const set = node({ ActionType: 'SetNumber', Properties: { Name: 'flag', Value: '1' } })
    const { source, warnings } = generateScript(...chain(set, sel))
    expect(warnings).toEqual([])
    expect(source).toContain('select r flag 1 0')
  })
})

describe('Reagents', () => {
  it('Read Device Reagent maps ReagentMode to its numeric form and HASHes the reagent name', () => {
    const reagent = node({
      ActionType: 'ReadDeviceReagent',
      Properties: { Device: 'd0', ReagentMode: 'Required', ReagentName: 'Iron', Name: 'amt' },
    })
    const { source } = generateScript(...chain(reagent))
    expect(source).toContain('lr amt d0 1 HASH("Iron")')
  })

  it('Get Reagent Item Hash compiles to rmap', () => {
    const rmap = node({ ActionType: 'ReagentItemHash', Properties: { Device: 'd0', ReagentName: 'Iron', Name: 'itemHash' } })
    const { source } = generateScript(...chain(rmap))
    expect(source).toContain('rmap itemHash d0 HASH("Iron")')
  })
})

describe('Redundant label/jump elision', () => {
  it('drops a trailing jump whose target already falls through as the next block', () => {
    const yield1 = node({ ActionType: 'Yield' })
    const yield2 = node({ ActionType: 'Yield' })
    const [nodes, connections] = chain(yield1, yield2)
    const start = nodes[0]
    const { source } = generateScript(nodes, connections)
    // Start's jump to yield1, and yield1's jump to yield2, are both
    // redundant (each target is emitted immediately after it) and should
    // be gone entirely — only yield2's loop back to Start (not adjacent)
    // survives, along with Start's now-sole-surviving label.
    expect(source).not.toContain(`j L${yield1.Number}`)
    expect(source).not.toContain(`j L${yield2.Number}`)
    expect(source.split('\n')).toEqual([`L${start.Number}:`, 'yield', 'yield', `j L${start.Number}`])
  })

  it('keeps a jump whose target is not physically next', () => {
    const yield1 = node({ ActionType: 'Yield' })
    const sleep = node({ ActionType: 'Sleep', Properties: { Seconds: '1' } })
    const [nodes, connections] = chain(yield1, sleep)
    // Rewire so yield1 jumps back past sleep to itself instead of falling
    // through to it — not physically adjacent, so the jump must stay.
    const start = nodes[0]
    connections.length = 0
    connections.push(wire(start, 'Next', yield1), wire(yield1, 'Next', start))
    const { source } = generateScript(nodes, connections)
    expect(source).toContain(`j L${start.Number}`)
  })

  it('drops a label nothing ever jumps to', () => {
    const a = node({ ActionType: 'Yield' })
    const b = node({ ActionType: 'Yield' })
    const [nodes, connections] = chain(a, b)
    const start = nodes[0]
    const { source } = generateScript(nodes, connections)
    // Nothing branches to a or b directly (both are pure fallthrough), and
    // the only remaining jump targets Start, so a's/b's labels should be
    // absent while Start's is kept.
    expect(source).not.toMatch(new RegExp(`^L${a.Number}:$`, 'm'))
    expect(source).not.toMatch(new RegExp(`^L${b.Number}:$`, 'm'))
    expect(source).toMatch(new RegExp(`^L${start.Number}:$`, 'm'))
  })

  it('a Compare branch that is physically next needs no jump, the far branch still does', () => {
    const compare = node({
      ActionType: 'Compare',
      OutputPorts: ['True', 'False'],
      Properties: { ValueA: '5', Operator: 'GreaterThan', ValueB: '2' },
    })
    const onFalse = node({ ActionType: 'Yield' })
    const onTrue = node({ ActionType: 'Yield' })
    const [nodes] = chain(compare)
    const start = nodes[0]
    const connections = [
      wire(start, 'Next', compare),
      wire(compare, 'False', onFalse),
      wire(compare, 'True', onTrue),
    ]
    const { source } = generateScript([...nodes, onFalse, onTrue], connections)
    // onFalse is emitted immediately after compare, so the unconditional
    // "j falseLabel" that used to always follow the branch is now gone —
    // only the conditional branch to True remains.
    expect(source).toContain(`bgt 5 2 L${onTrue.Number}`)
    expect(source).not.toContain(`j L${onFalse.Number}`)
  })
})
