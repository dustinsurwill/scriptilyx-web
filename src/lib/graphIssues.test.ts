import { describe, expect, it } from 'vitest'
import { getGraphIssues } from './graphIssues'
import type { ScriptNode } from '../types/graph'

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
    InputPorts: partial.InputPorts ?? [],
    OutputPorts: partial.OutputPorts ?? [],
    Properties: partial.Properties ?? {},
  }
}

describe('getGraphIssues: variable type conflicts', () => {
  it('warns when the same variable name is used as two different kinds', () => {
    const nodes = [
      node({ ActionType: 'SetNumberVariable', Properties: { Name: 'x', Value: '1' } }),
      node({ ActionType: 'ExtendedBuiltin', DefinitionId: 'ext.bool.set', Properties: { Name: 'x', Value: 'true' } }),
    ]
    const issues = getGraphIssues({ nodes, connections: [], definitionsById: new Map() })
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('"x"') && i.message.includes('bool and num'))).toBe(true)
  })

  it('does not warn when a variable is used consistently', () => {
    const nodes = [
      node({ ActionType: 'SetNumberVariable', Properties: { Name: 'x', Value: '1' } }),
      node({ ActionType: 'IfNumberLessThan', Properties: { Name: 'x', Value: '5' } }),
    ]
    const issues = getGraphIssues({ nodes, connections: [], definitionsById: new Map() })
    expect(issues.some((i) => i.message.includes('is used as both'))).toBe(false)
  })
})
