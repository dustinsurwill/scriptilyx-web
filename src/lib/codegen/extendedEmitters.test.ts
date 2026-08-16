import { describe, expect, it } from 'vitest'
import { extendedEmitters } from './extendedEmitters'
import { expressionOf, fakeContext, makeNode, statementsOf } from './testUtils'

function emit(id: string, properties: Record<string, string> = {}) {
  const node = makeNode({ ActionType: 'ExtendedBuiltin', DefinitionId: id, Properties: properties })
  const ctx = fakeContext()
  return { emit: extendedEmitters[id](node, ctx), ctx }
}

describe('extendedEmitters coverage', () => {
  it('every table entry is a callable function', () => {
    const ids = Object.keys(extendedEmitters)
    expect(ids.length).toBeGreaterThan(110)
    for (const id of ids) expect(typeof extendedEmitters[id]).toBe('function')
  })
})

describe('ext.bool.if (merged If Bool Variable True/False)', () => {
  it('switches negation on Value', () => {
    const t = emit('ext.bool.if', { Name: 'flag', Value: 'True' })
    expect(expressionOf(t.emit)).toBe('GetBool("flag")')
    const f = emit('ext.bool.if', { Name: 'flag', Value: 'False' })
    expect(expressionOf(f.emit)).toBe('!GetBool("flag")')
  })
})

describe('ext.generic.if_bool / ext.generic.if_float (merged True/False, Above/Below)', () => {
  it('if_bool switches negation on Value', () => {
    const t = emit('ext.generic.if_bool', { BlockName: 'B', PropertyId: 'P', Value: 'True' })
    const f = emit('ext.generic.if_bool', { BlockName: 'B', PropertyId: 'P', Value: 'False' })
    expect(expressionOf(t.emit)).not.toContain('!(')
    expect(expressionOf(f.emit)).toContain('!(')
  })

  it('if_float switches operator on Direction', () => {
    const above = emit('ext.generic.if_float', { BlockName: 'B', PropertyId: 'P', Value: '5', Direction: 'Above' })
    const below = emit('ext.generic.if_float', { BlockName: 'B', PropertyId: 'P', Value: '5', Direction: 'Below' })
    expect(expressionOf(above.emit)).toContain('> 5')
    expect(expressionOf(below.emit)).toContain('< 5')
  })
})

describe('ext.var.random', () => {
  it('requests the Rng helper (regression: was previously undefined)', () => {
    const { emit: e, ctx } = emit('ext.var.random', { Name: 'x', Minimum: '1', Maximum: '10' })
    expect(ctx.usedHelpers.has('Rng')).toBe(true)
    expect(statementsOf(e)[0]).toBe('_num["x"] = 1 + _rng.NextDouble() * ((10) - (1));')
  })
})

describe('ext.storage.save / ext.storage.load', () => {
  it('save replaces any prior value for the same key and keeps others', () => {
    const { emit: e } = emit('ext.storage.save', { VariableName: 'x', StorageKey: 'k', Type: 'number' })
    expect(e.kind).toBe('raw')
    const statements = statementsOf(e)
    expect(statements[0]).toContain('var kv = "k" + "=" + (GetNum("x").ToString());')
    expect(statements[0]).toContain('!s.StartsWith("k=")')
  })

  it('save picks the right getter per declared type', () => {
    expect(statementsOf(emit('ext.storage.save', { VariableName: 'x', StorageKey: 'k', Type: 'text' }).emit)[0]).toContain(
      'GetText("x")',
    )
    expect(statementsOf(emit('ext.storage.save', { VariableName: 'x', StorageKey: 'k', Type: 'bool' }).emit)[0]).toContain(
      'GetBool("x").ToString()',
    )
  })

  it('load parses the stored value back with the matching type and culture-invariant doubles', () => {
    const { emit: e } = emit('ext.storage.load', { VariableName: 'x', StorageKey: 'k', Type: 'number' })
    expect(statementsOf(e).join('\n')).toContain(
      '_num["x"] = double.Parse(raw, System.Globalization.CultureInfo.InvariantCulture)',
    )
  })

  it('load only assigns the variable when the key matches (exact prefix, not substring)', () => {
    const { emit: e } = emit('ext.storage.load', { VariableName: 'x', StorageKey: 'k', Type: 'number' })
    expect(statementsOf(e).join('\n')).toContain('kv.Substring(0, idx) == "k"')
  })
})

describe('ext.camera.raycast / ext.camera.if_detects', () => {
  it('raycast only records a hit when EntityId is non-zero', () => {
    const { emit: e } = emit('ext.camera.raycast', {
      BlockName: 'Cam',
      Distance: '100',
      Pitch: '0',
      Yaw: '0',
      DistanceVariable: 'd',
      NameVariable: 'n',
      TypeVariable: 't',
    })
    const src = statementsOf(e).join('\n')
    expect(src).toContain('found = hit.EntityId != 0;')
    expect(src).toContain('NEXT(Detected)')
    expect(src).toContain('NEXT(NotDetected)')
  })

  it('if_detects declares uniquely-named locals per node so multiple camera checks do not collide', () => {
    const a = emit('ext.camera.if_detects', { BlockName: 'Cam1', Distance: '50', Pitch: '0', Yaw: '0' })
    const b = emit('ext.camera.if_detects', { BlockName: 'Cam2', Distance: '50', Pitch: '0', Yaw: '0' })
    expect(a.emit.kind).toBe('condition')
    const aLocal = statementsOf(a.emit)[0].match(/cam_(\w+)/)?.[1]
    const bLocal = statementsOf(b.emit)[0].match(/cam_(\w+)/)?.[1]
    expect(aLocal).toBeTruthy()
    expect(aLocal).not.toBe(bLocal)
  })
})

describe('ext.action_relay.set_accept_from / get_accept_from', () => {
  it.each([
    ['Owner', 0],
    ['Faction', 1],
    ['Everyone', 2],
  ])('maps %s to enum index %i', (mode, index) => {
    const { emit: e } = emit('ext.action_relay.set_accept_from', { BlockName: 'Relay', AcceptFrom: mode })
    expect(statementsOf(e)[0]).toContain(`"ReceiveFrom", ${index}L`)
  })

  it('falls back to Everyone (2) for an unrecognized value', () => {
    const { emit: e } = emit('ext.action_relay.set_accept_from', { BlockName: 'Relay', AcceptFrom: 'garbage' })
    expect(statementsOf(e)[0]).toContain('"ReceiveFrom", 2L')
  })

  it('get_accept_from is the inverse mapping back to text', () => {
    const { emit: e } = emit('ext.action_relay.get_accept_from', { BlockName: 'Relay', VariableName: 'v' })
    const src = statementsOf(e).join('\n')
    expect(src).toContain('recv == 0 ? "Owner" : recv == 1 ? "Faction" : "Everyone"')
  })
})

describe('ext.broadcast.set_message_x', () => {
  it('maps a 1-based MessageNumber to a 0-based Message slot', () => {
    const { emit: e } = emit('ext.broadcast.set_message_x', {
      BlockName: 'BC',
      MessageNumber: '1',
      MessageText: 'hi',
    })
    expect(statementsOf(e)[0]).toContain('"Message0"')
  })

  it('clamps a non-numeric or missing MessageNumber to slot 0', () => {
    const { emit: e } = emit('ext.broadcast.set_message_x', { BlockName: 'BC', MessageText: 'hi' })
    expect(statementsOf(e)[0]).toContain('"Message0"')
  })

  it('slot 8 maps to Message7', () => {
    const { emit: e } = emit('ext.broadcast.set_message_x', {
      BlockName: 'BC',
      MessageNumber: '8',
      MessageText: 'hi',
    })
    expect(statementsOf(e)[0]).toContain('"Message7"')
  })
})

describe('battery/connector/generic status routers', () => {
  it('battery charge_router branches Critical < Low < Normal < Full in order', () => {
    const { emit: e } = emit('ext.battery.charge_router', {
      BlockName: 'Bat',
      CriticalBelow: '10',
      LowBelow: '30',
      FullAbove: '90',
    })
    const src = statementsOf(e).join('\n')
    expect(src.indexOf('pct < 10')).toBeLessThan(src.indexOf('pct < 30'))
    expect(src.indexOf('pct < 30')).toBeLessThan(src.indexOf('pct >= 90'))
  })

  it('connector status_router checks Connected before Connectable before falling through to Unconnected', () => {
    const { emit: e } = emit('ext.connector.status_router', { BlockName: 'C' })
    const src = statementsOf(e).join('\n')
    expect(src.indexOf('MyShipConnectorStatus.Connected)')).toBeLessThan(src.indexOf('MyShipConnectorStatus.Connectable)'))
    expect(src).toContain('NEXT(Unconnected)')
  })

  it('generic status_router checks in Missing -> Damaged -> Disabled -> NotWorking -> Working order', () => {
    const { emit: e } = emit('ext.generic.status_router', { BlockName: 'B' })
    const src = statementsOf(e).join('\n')
    const order = ['b == null', '!b.IsFunctional', '!fb.Enabled', '!b.IsWorking']
    const positions = order.map((needle) => src.indexOf(needle))
    for (let i = 1; i < positions.length; i++) expect(positions[i - 1]).toBeLessThan(positions[i])
  })
})

describe('group any/all conditions', () => {
  it('if_all_working requires a nonempty group (vacuous truth is avoided)', () => {
    const { emit: e } = emit('ext.group.if_all_working', { GroupName: 'G' })
    const expression = expressionOf(e)
    expect(expression).toContain('.Count > 0 &&')
    expect(expression).toContain('.All(blk => blk.IsWorking)')
  })

  it('if_any_working uses Any and does not require nonempty', () => {
    const { emit: e } = emit('ext.group.if_any_working', { GroupName: 'G' })
    const expression = expressionOf(e)
    expect(expression).not.toContain('.Count > 0')
    expect(expression).toContain('.Any(')
  })
})

describe('ext.gear.if_ready caveat', () => {
  it('approximates "ready to lock" as unlocked-with-something-attached, not a fabricated true', () => {
    const { emit: e } = emit('ext.gear.if_ready', { BlockName: 'Gear' })
    const expression = expressionOf(e)
    expect(expression).toContain('!v.IsLocked')
    expect(expression).toContain('v.GetAttachedEntity() != null')
  })
})

describe('inventory item matching', () => {
  it('contains_item and if_item_below compare against Amount in opposite directions', () => {
    const contains = emit('ext.inventory.contains_item', { BlockName: 'Cargo', ItemType: 'Ore/Iron', Amount: '10' })
    const below = emit('ext.inventory.if_item_below', { BlockName: 'Cargo', ItemType: 'Ore/Iron', Amount: '10' })
    expect(expressionOf(contains.emit)).toContain('>= 10d')
    expect(expressionOf(below.emit)).toContain('< 10d')
  })
})
