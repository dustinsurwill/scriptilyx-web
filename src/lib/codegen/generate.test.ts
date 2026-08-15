import { describe, expect, it } from 'vitest'
import type { NodeConnection, ScriptNode } from '../../types/graph'
import { generateScript, methodName } from './generate'

let counter = 0
function node(partial: Partial<ScriptNode> & Pick<ScriptNode, 'ActionType'>): ScriptNode {
  counter += 1
  return {
    Id: partial.Id ?? `nid${counter}`,
    Number: partial.Number ?? counter,
    DefinitionId: partial.DefinitionId ?? partial.ActionType,
    ActionType: partial.ActionType,
    Title: partial.Title ?? partial.ActionType,
    Description: '',
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
    expect(warnings).toEqual(['No Start node found.'])
  })

  it('chains a simple action sequence', () => {
    const start = node({ ActionType: 'Start', OutputPorts: ['Next'] })
    const echo = node({ ActionType: 'Echo', Properties: { Text: 'hi' } })
    const nodes = [start, echo]
    const connections = [wire(start, 'Next', echo)]

    const { source } = generateScript(nodes, connections)
    expect(source).toContain(`Echo("hi");`)
    expect(source).toMatch(
      new RegExp(`void ${methodName(start)}\\(\\) \\{\\s*${methodName(echo)}\\(\\);`),
    )
  })

  it('emits both branches of a condition node and skips unconnected ones', () => {
    const start = node({ ActionType: 'Start' })
    const check = node({
      ActionType: 'IfNumberLessThan',
      Properties: { Name: 'x', Value: '5' },
      OutputPorts: ['True', 'False'],
    })
    const onTrue = node({ ActionType: 'Echo', Properties: { Text: 'yes' } })
    const nodes = [start, check, onTrue]
    const connections = [wire(start, 'Next', check), wire(check, 'True', onTrue)]

    const { source } = generateScript(nodes, connections)
    // Variable storage is promoted to a readable typed field, not a dictionary lookup.
    expect(source).toContain('double Num_x;')
    expect(source).toContain('if (Num_x < 5)')
    expect(source).not.toContain('GetNum(')
    expect(source).toContain('// "False" not connected')
  })

  it('marks nodes unreachable from Start as warnings and omits them', () => {
    const start = node({ ActionType: 'Start' })
    const orphan = node({ ActionType: 'Echo', Properties: { Text: 'never' } })
    const { source, warnings } = generateScript([start, orphan], [])
    expect(source).not.toContain('never')
    expect(warnings[0]).toContain('is unreachable')
  })

  it('loops RepeatTimes back into its own dispatch via recursion', () => {
    const start = node({ ActionType: 'Start' })
    const repeat = node({
      ActionType: 'RepeatTimes',
      Properties: { Times: '3' },
      InputPorts: ['In', 'Repeat'],
      OutputPorts: ['Loop', 'Done'],
    })
    const body = node({ ActionType: 'Echo', Properties: { Text: 'tick' } })
    const nodes = [start, repeat, body]
    const connections = [
      wire(start, 'Next', repeat),
      wire(repeat, 'Loop', body),
      wire(body, 'Next', repeat, 'Repeat'),
    ]

    const { source } = generateScript(nodes, connections)
    expect(source).toContain(`double Num_repeat_${repeat.Id};`)
    // The loop body's Next wire calls back into the repeat node's own method.
    expect(source).toMatch(new RegExp(`${methodName(repeat)}\\(\\);\\s*\\}`))
  })

  it('routes CommandRouter by argument', () => {
    const start = node({ ActionType: 'Start' })
    const router = node({
      ActionType: 'CommandRouter',
      Properties: { StartupArgument: 'startup', StopArgument: 'stop' },
      OutputPorts: ['startup', 'shutdown', 'dock', 'undock', 'mine', 'stop', 'status', 'open_airlock', 'close_airlock', 'open_hangar', 'close_hangar', 'unknown'],
    })
    const onStartup = node({ ActionType: 'Echo', Properties: { Text: 'booting' } })
    const nodes = [start, router, onStartup]
    const connections = [wire(start, 'Next', router), wire(router, 'startup', onStartup)]

    const { source } = generateScript(nodes, connections)
    expect(source).toContain('switch (_argument)')
    expect(source).toContain('case "startup":')
    expect(source).not.toContain('case "dock":') // empty threshold/argument is skipped
  })

  it('generates a budgeted dispatcher instead of direct calls in tick-budget mode', () => {
    const start = node({ ActionType: 'Start' })
    const echo = node({ ActionType: 'Echo', Properties: { Text: 'hi' } })
    const nodes = [start, echo]
    const connections = [wire(start, 'Next', echo)]

    const { source } = generateScript(nodes, connections, { multiTickBudget: { maxNodesPerTick: 25 } })
    expect(source).toContain('void Dispatch()')
    expect(source).toContain('switch (_nextNode)')
    expect(source).toContain('int budget = 25;')
    expect(source).not.toMatch(new RegExp(`void ${methodName(start)}\\(\\)`))
  })

  it('resolves ExtendedBuiltin nodes by their node-library id', () => {
    const start = node({ ActionType: 'Start' })
    const ext = node({ ActionType: 'ExtendedBuiltin', DefinitionId: 'ext.piston.if_extended' })
    const nodes = [start, ext]
    const connections = [wire(start, 'Next', ext)]

    const { source } = generateScript(nodes, connections)
    expect(source).toContain('v.CurrentPosition >= v.HighestPosition')
  })

  it('falls back to a TODO stub for an unrecognized ExtendedBuiltin id', () => {
    const start = node({ ActionType: 'Start' })
    const ext = node({ ActionType: 'ExtendedBuiltin', DefinitionId: 'ext.made_up.not_real' })
    const nodes = [start, ext]
    const connections = [wire(start, 'Next', ext)]

    const { source } = generateScript(nodes, connections)
    expect(source).toContain('// TODO codegen: ext.made_up.not_real')
  })

  it('resolves CallSection to the matching StartSection node by name', () => {
    const start = node({ ActionType: 'Start' })
    const call = node({ ActionType: 'CallSection', Properties: { SectionName: 'cleanup' } })
    const section = node({ ActionType: 'StartSection', Properties: { SectionName: 'cleanup' } })
    const sectionBody = node({ ActionType: 'Echo', Properties: { Text: 'cleaning' } })
    const nodes = [start, call, section, sectionBody]
    const connections = [wire(start, 'Next', call), wire(section, 'Next', sectionBody)]

    const { source } = generateScript(nodes, connections)
    expect(source).toContain('Section_cleanup();')
    expect(source).toContain('void Section_cleanup() {')
    expect(source).toContain('cleaning')
  })

  it('end-to-end: every helper an ExtendedBuiltin node requests is actually declared in the output', () => {
    // Regression coverage for the class of bug where ctx.useHelper('Rng') was
    // called but 'Rng' had no entry in HELPER_SOURCE, silently emitting the
    // literal text "undefined" into the generated script.
    const start = node({ ActionType: 'Start' })
    const random = node({
      ActionType: 'ExtendedBuiltin',
      DefinitionId: 'ext.var.random',
      Properties: { Name: 'x', Minimum: '0', Maximum: '1' },
    })
    const nodes = [start, random]
    const connections = [wire(start, 'Next', random)]

    const { source } = generateScript(nodes, connections)
    expect(source).not.toContain('undefined')
    expect(source).toContain('Random _rng = new Random();')
  })

  it('promotes dictionary-backed variables to readable typed fields, shared across all referencing nodes', () => {
    const start = node({ ActionType: 'Start' })
    const set = node({ ActionType: 'SetNumberVariable', Properties: { Name: 'elevation', Value: '0' } })
    const echo = node({ ActionType: 'Echo', Properties: { Text: 'Elevation: {elevation}' } })
    const nodes = [start, set, echo]
    const connections = [wire(start, 'Next', set), wire(set, 'Next', echo)]

    const { source } = generateScript(nodes, connections)
    expect(source).toContain('double Num_elevation;')
    expect(source).toContain('Num_elevation = 0;')
    expect(source).toContain('Echo($"Elevation: {Num_elevation}");')
    expect(source).not.toContain('GetNum(')
    expect(source).not.toContain('_num[')
    expect(source).not.toContain('Dictionary<string, double>')
  })
})
