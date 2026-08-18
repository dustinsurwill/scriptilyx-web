import { describe, expect, it } from 'vitest'
import { deviceLogicTypes, deviceNames, deviceNamesWithHash, logicTypeNamesFor, prefabHashFor } from './deviceLogicTypes'

describe('deviceLogicTypes', () => {
  it('parses all 145 devices with no duplicate names', () => {
    expect(deviceLogicTypes.length).toBe(145)
    expect(new Set(deviceNames).size).toBe(deviceNames.length)
  })

  it('every logic type row has a valid access value', () => {
    const validAccess = new Set(['R', 'W', 'R/W'])
    for (const device of deviceLogicTypes) {
      for (const lt of device.logicTypes) {
        expect(validAccess.has(lt.access)).toBe(true)
      }
    }
  })

  it('logicTypeNamesFor filters by read/write access for a known device', () => {
    const read = logicTypeNamesFor('Active Vent', 'read')
    const write = logicTypeNamesFor('Active Vent', 'write')
    expect(read).toContain('PressureInternal') // R/W
    expect(read).toContain('PressureOutput') // R only
    expect(write).toContain('PressureInternal') // R/W
    expect(write).not.toContain('PressureOutput') // R only, not writable
  })

  it('falls back to every device\'s logic types when device is "(any)" or unrecognized', () => {
    const any = logicTypeNamesFor('(any)', 'read')
    const unknown = logicTypeNamesFor('Some Made Up Device', 'read')
    expect(any.length).toBeGreaterThan(50)
    expect(any).toEqual(unknown)
  })

  it('returns an empty list for a real device with no documented logic types', () => {
    expect(logicTypeNamesFor('Autolathe', 'read')).toEqual([])
  })

  it('prefabHashFor returns a known device\'s hash and is undefined for devices without one', () => {
    expect(prefabHashFor('Active Vent')).toBe(-842048328)
    expect(prefabHashFor('Console')).toBeUndefined() // wiki page has no documented hash
    expect(prefabHashFor('Some Made Up Device')).toBeUndefined()
  })

  it('deviceNamesWithHash only includes devices with a known prefab hash', () => {
    expect(deviceNamesWithHash).toContain('Active Vent')
    expect(deviceNamesWithHash).not.toContain('Console')
    expect(deviceNamesWithHash.length).toBeLessThan(deviceNames.length)
  })
})
