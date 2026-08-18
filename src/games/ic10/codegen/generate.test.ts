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
    expect(source).toBe(
      [
        'alias temp r0',
        `L${start.Number}:`,
        `j L${read.Number}`,
        `L${read.Number}:`,
        'l temp d0 Temperature',
        `j L${write.Number}`,
        `L${write.Number}:`,
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
