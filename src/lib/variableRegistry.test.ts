import { describe, expect, it } from 'vitest'
import { buildVariableRegistry } from './variableRegistry'
import type { ScriptNode } from '../types/graph'

function node(overrides: Partial<ScriptNode> & Pick<ScriptNode, 'ActionType'>): ScriptNode {
  return {
    Id: overrides.Id ?? Math.random().toString(36),
    Number: overrides.Number ?? 1,
    DefinitionId: overrides.DefinitionId ?? overrides.ActionType,
    ActionType: overrides.ActionType,
    Title: overrides.Title ?? overrides.ActionType,
    Description: '',
    X: 0,
    Y: 0,
    InputPorts: [],
    OutputPorts: [],
    Properties: overrides.Properties ?? {},
  }
}

describe('buildVariableRegistry', () => {
  it('returns an empty registry for an empty graph', () => {
    const registry = buildVariableRegistry([])
    expect(registry.namesByKind).toEqual({ num: [], text: [], bool: [] })
    expect(registry.conflicts).toEqual([])
  })

  it('collects a num variable from SetNumberVariable', () => {
    const registry = buildVariableRegistry([
      node({ ActionType: 'SetNumberVariable', Properties: { Name: 'health', Value: '100' } }),
    ])
    expect(registry.kindOf.get('health')).toBe('num')
    expect(registry.namesByKind.num).toEqual(['health'])
  })

  it('collects a bool variable from the ExtendedBuiltin "Set Bool Variable" node (dispatched by DefinitionId)', () => {
    const registry = buildVariableRegistry([
      node({ ActionType: 'ExtendedBuiltin', DefinitionId: 'ext.bool.set', Properties: { Name: 'docked', Value: 'true' } }),
    ])
    expect(registry.kindOf.get('docked')).toBe('bool')
  })

  it('resolves Save/Load Variable kind dynamically from the Type combo', () => {
    const registry = buildVariableRegistry([
      node({
        ActionType: 'ExtendedBuiltin',
        DefinitionId: 'ext.storage.save',
        Properties: { VariableName: 'saved', StorageKey: 'k', Type: 'Bool' },
      }),
    ])
    expect(registry.kindOf.get('saved')).toBe('bool')
  })

  it('a declaring node wins over a same-name reference-only node when picking the resolved kind', () => {
    const registry = buildVariableRegistry([
      node({ ActionType: 'SetNumberVariable', Properties: { Name: 'x', Value: '1' } }),
      node({ ActionType: 'IfNumberLessThan', Properties: { Name: 'x', Value: '5' } }),
    ])
    expect(registry.kindOf.get('x')).toBe('num')
    expect(registry.conflicts).toEqual([])
  })

  it('flags a conflict when the same name is used as two different kinds', () => {
    const registry = buildVariableRegistry([
      node({ ActionType: 'SetNumberVariable', Properties: { Name: 'x', Value: '1' } }),
      node({ ActionType: 'ExtendedBuiltin', DefinitionId: 'ext.bool.set', Properties: { Name: 'x', Value: 'true' } }),
    ])
    expect(registry.conflicts).toEqual([{ name: 'x', kinds: ['bool', 'num'] }])
  })

  it('ignores nodes/properties with no role in the registry', () => {
    const registry = buildVariableRegistry([node({ ActionType: 'Echo', Properties: { Text: 'hi' } })])
    expect(registry.namesByKind).toEqual({ num: [], text: [], bool: [] })
  })

  it('ignores an empty variable name', () => {
    const registry = buildVariableRegistry([node({ ActionType: 'SetNumberVariable', Properties: { Name: '  ', Value: '1' } })])
    expect(registry.namesByKind.num).toEqual([])
  })
})
