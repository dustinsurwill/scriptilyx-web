import { describe, expect, it } from 'vitest'
import {
  blockCondition,
  blockMethodCall,
  blockPropertySetter,
  groupCondition,
  groupMethodCall,
  groupPropertySetter,
  isWorkingCondition,
  lcdAppend,
  lcdGroupWrite,
  lcdWrite,
  terminalAction,
  terminalActionByNameContains,
  terminalPropertyCondition,
  terminalPropertySetter,
} from './factories'
import { expressionOf, fakeContext, makeNode, statementsOf } from './testUtils'

describe('blockPropertySetter', () => {
  it('emits a scoped null-checked cast-and-assign, then advances via Next', () => {
    const emit = blockPropertySetter('IMyDoor', 'Enabled', () => 'true')(
      makeNode({ ActionType: 'X', Properties: { BlockName: 'Door 1' } }),
      fakeContext(),
    )
    expect(emit).toEqual({
      kind: 'action',
      statements: ['{ if (GetBlock("Door 1") is IMyDoor v) v.Enabled = true; }', 'NEXT(Next);'],
    })
  })

  it('registers the GetBlock helper', () => {
    const ctx = fakeContext()
    blockPropertySetter('IMyDoor', 'Enabled', () => 'true')(makeNode({ ActionType: 'X' }), ctx)
    expect(ctx.usedHelpers.has('GetBlock')).toBe(true)
  })

  it('supports an alternate name property key', () => {
    const emit = blockPropertySetter('IMyConveyorSorter', 'DrainAll', () => 'false', 'SorterName')(
      makeNode({ ActionType: 'X', Properties: { SorterName: 'Sorter A' } }),
      fakeContext(),
    )
    expect(statementsOf(emit)[0]).toContain('GetBlock("Sorter A")')
  })
})

describe('blockMethodCall', () => {
  it('emits a scoped null-checked method call', () => {
    const emit = blockMethodCall('IMyDoor', 'OpenDoor')(
      makeNode({ ActionType: 'X', Properties: { BlockName: 'Door 1' } }),
      fakeContext(),
    )
    expect(statementsOf(emit)[0]).toBe('{ if (GetBlock("Door 1") is IMyDoor v) v.OpenDoor(); }')
  })
})

describe('groupPropertySetter / groupMethodCall', () => {
  it('iterates the group and only touches castable blocks', () => {
    const emit = groupPropertySetter('IMyFunctionalBlock', 'Enabled', () => 'true')(
      makeNode({ ActionType: 'X', Properties: { GroupName: 'Doors' } }),
      fakeContext(),
    )
    expect(statementsOf(emit)[0]).toBe(
      'foreach (var blk in GetGroupBlocks("Doors")) { if (blk is IMyFunctionalBlock v) v.Enabled = true; }',
    )
  })

  it('groupMethodCall calls a method instead of assigning', () => {
    const emit = groupMethodCall('IMyLandingGear', 'Lock')(
      makeNode({ ActionType: 'X', Properties: { GroupName: 'Gears' } }),
      fakeContext(),
    )
    expect(statementsOf(emit)[0]).toBe(
      'foreach (var blk in GetGroupBlocks("Gears")) { if (blk is IMyLandingGear v) v.Lock(); }',
    )
  })
})

describe('blockCondition / groupCondition', () => {
  it('combines the null-safe cast with the supplied expression', () => {
    const emit = blockCondition('IMyDoor', (v) => `${v}.Status.ToString() == "Open"`)(
      makeNode({ ActionType: 'X', Properties: { BlockName: 'Door 1' } }),
      fakeContext(),
    )
    expect(emit).toEqual({
      kind: 'condition',
      expression: 'GetBlock("Door 1") is IMyDoor v && v.Status.ToString() == "Open"',
    })
  })

  it('groupCondition supports All and Any combinators', () => {
    const allEmit = groupCondition('IMyTerminalBlock', 'All', (v) => `${v}.IsWorking`)(
      makeNode({ ActionType: 'X', Properties: { GroupName: 'G' } }),
      fakeContext(),
    )
    expect(expressionOf(allEmit)).toBe('GetGroupBlocks("G").All(blk => blk is IMyTerminalBlock v && v.IsWorking)')

    const anyEmit = groupCondition('IMyTerminalBlock', 'Any', (v) => `!${v}.IsFunctional`)(
      makeNode({ ActionType: 'X', Properties: { GroupName: 'G' } }),
      fakeContext(),
    )
    expect(expressionOf(anyEmit)).toBe('GetGroupBlocks("G").Any(blk => blk is IMyTerminalBlock v && !v.IsFunctional)')
  })
})

describe('terminal property helpers', () => {
  it('terminalPropertySetter reads BlockName/PropertyId from the node', () => {
    const emit = terminalPropertySetter('bool', () => 'true')(
      makeNode({ ActionType: 'X', Properties: { BlockName: 'Blk', PropertyId: 'ShowOnHUD' } }),
      fakeContext(),
    )
    expect(statementsOf(emit)[0]).toBe('GetBlock("Blk")?.SetValue<bool>("ShowOnHUD", true);')
  })

  it('terminalPropertyCondition null-coalesces to a type default', () => {
    const emit = terminalPropertyCondition('float', (get) => `${get} > 5`)(
      makeNode({ ActionType: 'X', Properties: { BlockName: 'Blk', PropertyId: 'Radius' } }),
      fakeContext(),
    )
    expect(expressionOf(emit)).toBe(
      '(GetBlock("Blk")?.GetValue<float>("Radius") ?? default(float)) > 5',
    )
  })

  it('terminalAction applies by ActionId', () => {
    const emit = terminalAction()(
      makeNode({ ActionType: 'X', Properties: { BlockName: 'Blk', ActionId: 'OnOff_On' } }),
      fakeContext(),
    )
    expect(statementsOf(emit)[0]).toBe('GetBlock("Blk")?.ApplyAction("OnOff_On");')
  })

  it('terminalActionByNameContains delegates to the ApplyActionNamed helper', () => {
    const ctx = fakeContext()
    const emit = terminalActionByNameContains('Send')(
      makeNode({ ActionType: 'X', Properties: { BlockName: 'Relay' } }),
      ctx,
    )
    expect(statementsOf(emit)[0]).toBe('ApplyActionNamed(GetBlock("Relay"), "Send");')
    expect(ctx.usedHelpers.has('ApplyActionNamed')).toBe(true)
  })

  it('isWorkingCondition negates when requested', () => {
    const node = makeNode({ ActionType: 'X', Properties: { BlockName: 'Blk' } })
    expect(expressionOf(isWorkingCondition(false)(node, fakeContext()))).toBe('GetBlock("Blk")?.IsWorking ?? false')
    expect(expressionOf(isWorkingCondition(true)(node, fakeContext()))).toBe('!(GetBlock("Blk")?.IsWorking ?? false)')
  })
})

describe('LCD writers', () => {
  it('lcdWrite replaces, lcdAppend passes true to WriteText', () => {
    const node = makeNode({ ActionType: 'X', Properties: { BlockName: 'LCD' } })
    const write = lcdWrite(() => '"hi"')(node, fakeContext())
    expect(statementsOf(write)[0]).toBe('{ if (GetBlock("LCD") is IMyTextSurface v) v.WriteText("hi"); }')

    const append = lcdAppend(() => '"hi"')(node, fakeContext())
    expect(statementsOf(append)[0]).toBe('{ if (GetBlock("LCD") is IMyTextSurface v) v.WriteText("hi", true); }')
  })

  it('lcdGroupWrite iterates the group and supports append', () => {
    const node = makeNode({ ActionType: 'X', Properties: { GroupName: 'LCDs' } })
    const emit = lcdGroupWrite(() => '"hi"', true)(node, fakeContext())
    expect(statementsOf(emit)[0]).toBe(
      'foreach (var blk in GetGroupBlocks("LCDs")) { if (blk is IMyTextSurface v) v.WriteText("hi", true); }',
    )
  })
})
