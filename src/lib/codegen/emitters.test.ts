import { describe, expect, it } from 'vitest'
import { genericEmitters } from './emitters'
import { expressionOf, fakeContext, makeNode, statementsOf } from './testUtils'

function emit(actionType: string, properties: Record<string, string> = {}) {
  const node = makeNode({ ActionType: actionType, Properties: properties })
  return genericEmitters[actionType](node, fakeContext())
}

describe('rotor/hinge limits (regression: was the generic SetValue<float> escape hatch)', () => {
  it('SetRotorLimits sets the real LowerLimitDeg/UpperLimitDeg properties', () => {
    const e = emit('SetRotorLimits', { BlockName: 'Rotor', LowerLimitDeg: '-45', UpperLimitDeg: '45' })
    const src = statementsOf(e).join('\n')
    expect(src).toContain('v.LowerLimitDeg = (float)-45d')
    expect(src).toContain('v.UpperLimitDeg = (float)45d')
    expect(src).not.toContain('SetValue<float>("LowerLimit"')
  })

  it('ClearRotorLimits resets to float.MinValue/MaxValue on the real properties', () => {
    const e = emit('ClearRotorLimits', { BlockName: 'Rotor' })
    const src = statementsOf(e).join('\n')
    expect(src).toContain('v.LowerLimitDeg = float.MinValue')
    expect(src).toContain('v.UpperLimitDeg = float.MaxValue')
  })

  it('SetHingeLimits and ClearHingeLimits use the same real properties as rotors', () => {
    const set = emit('SetHingeLimits', { BlockName: 'Hinge', LowerLimitDeg: '0', UpperLimitDeg: '90' })
    expect(statementsOf(set).join('\n')).toContain('v.LowerLimitDeg = (float)0d')
    const clear = emit('ClearHingeLimits', { BlockName: 'Hinge' })
    expect(statementsOf(clear).join('\n')).toContain('v.UpperLimitDeg = float.MaxValue')
  })
})

describe('conveyor sorter filters (regression: was previously a no-op stub)', () => {
  it('SetConveyorSorterFilter parses newline-separated items and sets mode + drain-all', () => {
    const e = emit('SetConveyorSorterFilter', {
      SorterName: 'Sorter',
      Mode: 'Blacklist',
      DrainAll: 'true',
      FilterItems: 'MyObjectBuilder_Ore/Iron\nMyObjectBuilder_Ore/Stone',
    })
    const src = statementsOf(e).join('\n')
    expect(src).toContain('MyConveyorSorterMode.Blacklist')
    expect(src).toContain("Split('\\n')")
    expect(src).toContain('s.DrainAll = true')
  })

  it('AddConveyorSorterFilterItem / RemoveConveyorSorterFilterItem build a MyInventoryItemFilter', () => {
    const add = emit('AddConveyorSorterFilterItem', { SorterName: 'Sorter', ItemId: 'MyObjectBuilder_Ore/Iron' })
    expect(statementsOf(add).join('\n')).toContain('s.AddItem(new MyInventoryItemFilter("MyObjectBuilder_Ore/Iron", false))')

    const remove = emit('RemoveConveyorSorterFilterItem', { SorterName: 'Sorter', ItemId: 'MyObjectBuilder_Ore/Iron' })
    expect(statementsOf(remove).join('\n')).toContain('s.RemoveItem(new MyInventoryItemFilter("MyObjectBuilder_Ore/Iron", false))')
  })

  it('IfConveyorSorterAllowsItem calls IsAllowed with a parsed MyDefinitionId', () => {
    const e = emit('IfConveyorSorterAllowsItem', { SorterName: 'Sorter', ItemId: 'MyObjectBuilder_Ore/Iron' })
    expect(expressionOf(e)).toContain('IsAllowed(MyDefinitionId.Parse("MyObjectBuilder_Ore/Iron"))')
  })

  it('ClearConveyorSorterFilter keeps the current mode and empties the list', () => {
    const e = emit('ClearConveyorSorterFilter', { SorterName: 'Sorter' })
    expect(statementsOf(e).join('\n')).toContain('s.SetFilter(s.Mode, new List<MyInventoryItemFilter>())')
  })
})

describe('CargoThreshold uses the extension-method GetInventory(0) signature', () => {
  it('passes the required index argument', () => {
    const e = emit('CargoThreshold', { BlockName: 'Cargo', Percent: '20', Direction: 'Below' })
    expect(expressionOf(e)).toContain('.GetInventory(0)')
    expect(expressionOf(e)).toContain('< 20')
  })

  it('defaults to Above (>) for a missing/unrecognized Direction', () => {
    const e = emit('CargoThreshold', { BlockName: 'Cargo', Percent: '20' })
    expect(expressionOf(e)).toContain('> 20')
  })
})

describe('merged Above|Below threshold nodes', () => {
  it('PistonPositionThreshold switches operator on Direction', () => {
    const above = emit('PistonPositionThreshold', { BlockName: 'P', Meters: '5', Direction: 'Above' })
    const below = emit('PistonPositionThreshold', { BlockName: 'P', Meters: '5', Direction: 'Below' })
    expect(expressionOf(above)).toContain('CurrentPosition > 5')
    expect(expressionOf(below)).toContain('CurrentPosition < 5')
  })

  it('BatteryThreshold and JumpDriveChargeThreshold use the stored-power ratio', () => {
    const battery = emit('BatteryThreshold', { BlockName: 'B', Percent: '30', Direction: 'Below' })
    const jumpDrive = emit('JumpDriveChargeThreshold', { BlockName: 'J', Percent: '30', Direction: 'Below' })
    expect(expressionOf(battery)).toContain('CurrentStoredPower / v.MaxStoredPower * 100.0 < 30')
    expect(expressionOf(jumpDrive)).toContain('CurrentStoredPower / v.MaxStoredPower * 100.0 < 30')
  })

  it('GasTankThreshold, RoomOxygenThreshold, ShipSpeedThreshold all resolve', () => {
    expect(expressionOf(emit('GasTankThreshold', { BlockName: 'T', Percent: '50', Direction: 'Above' }))).toContain('FilledRatio * 100.0 > 50')
    expect(expressionOf(emit('RoomOxygenThreshold', { BlockName: 'V', Percent: '50', Direction: 'Above' }))).toContain('GetOxygenLevel() * 100.0 > 50')
    expect(expressionOf(emit('ShipSpeedThreshold', { BlockName: 'S', Speed: '10', Direction: 'Above' }))).toContain('GetShipSpeed() > 10')
  })
})
