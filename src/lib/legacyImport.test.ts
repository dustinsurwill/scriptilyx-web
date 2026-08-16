import { describe, expect, it } from 'vitest'
import { remapLegacyGraph } from './legacyImport'
import type { GraphSaveData, ScriptNode } from '../types/graph'

function legacyNode(overrides: Partial<ScriptNode>): ScriptNode {
  return {
    Id: 'n1',
    Number: 1,
    DefinitionId: 'block.turn_on',
    ActionType: 'SetBlockEnabled',
    Title: 'Turn On Block',
    Description: 'Turns on a functional block by exact name.',
    X: 0,
    Y: 0,
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: { BlockName: 'Reactor' },
    ...overrides,
  }
}

describe('remapLegacyGraph', () => {
  it('rewrites a retired on/off preset id onto the merged node, preserving the saved property value', () => {
    const data: GraphSaveData = {
      Nodes: [legacyNode({})],
      Connections: [],
      NextNodeNumber: 2,
      Zoom: 1,
    }
    const result = remapLegacyGraph(data)
    expect(result.Nodes[0].DefinitionId).toBe('block.set_enabled')
    expect(result.Nodes[0].Properties).toEqual({ BlockName: 'Reactor', Enabled: 'true' })
    // Instance fields untouched.
    expect(result.Nodes[0].Id).toBe('n1')
    expect(result.Nodes[0].X).toBe(0)
  })

  it('remaps the off-variant to the same merged node with Enabled=false', () => {
    const data: GraphSaveData = {
      Nodes: [legacyNode({ DefinitionId: 'block.turn_off', Title: 'Turn Off Block' })],
      Connections: [],
      NextNodeNumber: 2,
      Zoom: 1,
    }
    const result = remapLegacyGraph(data)
    expect(result.Nodes[0].DefinitionId).toBe('block.set_enabled')
    expect(result.Nodes[0].Properties.Enabled).toBe('false')
  })

  it('folds a button-command preset onto the generic node with its Argument value', () => {
    const data: GraphSaveData = {
      Nodes: [
        legacyNode({
          DefinitionId: 'button.command_dock',
          ActionType: 'IfArgumentEquals',
          Title: 'Button Command: dock',
          Properties: {},
        }),
      ],
      Connections: [],
      NextNodeNumber: 2,
      Zoom: 1,
    }
    const result = remapLegacyGraph(data)
    expect(result.Nodes[0].DefinitionId).toBe('button.command')
    expect(result.Nodes[0].Properties.Argument).toBe('dock')
  })

  it('remaps a retired Above/Below threshold pair onto the merged Direction-combo node', () => {
    const data: GraphSaveData = {
      Nodes: [
        legacyNode({
          DefinitionId: 'ext.battery.if_above',
          ActionType: 'ExtendedBuiltin',
          Title: 'Battery Above %',
          Properties: { BlockName: 'Battery', Percent: '75' },
        }),
        legacyNode({
          Id: 'n2',
          DefinitionId: 'check.battery_below',
          ActionType: 'BatteryBelow',
          Title: 'Battery Below %',
          Properties: { BlockName: 'Battery', Percent: '20' },
        }),
      ],
      Connections: [],
      NextNodeNumber: 3,
      Zoom: 1,
    }
    const result = remapLegacyGraph(data)
    expect(result.Nodes[0].DefinitionId).toBe('ext.battery.threshold')
    expect(result.Nodes[0].Properties).toEqual({ BlockName: 'Battery', Percent: '75', Direction: 'Above' })
    expect(result.Nodes[1].DefinitionId).toBe('ext.battery.threshold')
    expect(result.Nodes[1].Properties).toEqual({ BlockName: 'Battery', Percent: '20', Direction: 'Below' })
  })

  it('remaps a retired wheel bool on/off preset onto the merged PropertyId node', () => {
    const data: GraphSaveData = {
      Nodes: [
        legacyNode({
          DefinitionId: 'wheel.propulsion_off',
          ActionType: 'SetTerminalBool',
          Title: 'Wheel Propulsion Off',
          Properties: { BlockName: 'Wheel', PropertyId: 'Propulsion' },
        }),
      ],
      Connections: [],
      NextNodeNumber: 2,
      Zoom: 1,
    }
    const result = remapLegacyGraph(data)
    expect(result.Nodes[0].DefinitionId).toBe('wheel.propulsion_set')
    expect(result.Nodes[0].Properties).toEqual({ BlockName: 'Wheel', PropertyId: 'Propulsion', Value: 'false' })
  })

  it('leaves nodes with a current or unknown DefinitionId untouched', () => {
    const data: GraphSaveData = {
      Nodes: [legacyNode({ DefinitionId: 'block.set_enabled', Title: 'Set Block Enabled' }), legacyNode({ Id: 'n2', DefinitionId: 'totally.unknown.id' })],
      Connections: [],
      NextNodeNumber: 3,
      Zoom: 1,
    }
    const result = remapLegacyGraph(data)
    expect(result).toBe(data) // no-op: same reference when nothing changed
    expect(result.Nodes[1].DefinitionId).toBe('totally.unknown.id')
  })
})
