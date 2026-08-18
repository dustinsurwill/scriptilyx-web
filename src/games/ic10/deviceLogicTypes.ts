import rawDeviceLogicTypes from './deviceLogicTypes.json'

/** Compiled from the Stationeers Community Wiki (stationeers-wiki.com),
 * per-device IC10 logic parameter tables (145 devices/structures, 1546
 * name/type/access rows) — factual data (field names, value types, R/W
 * access), not wiki prose. See ../../../docs/ic10-api-notes.md for the
 * full sourcing/licensing note. UI-only: none of this affects codegen
 * (see nodeLibrary.ts's `DeviceType` property doc comment) — it only
 * drives LogicType suggestions. */
export interface DeviceLogicType {
  name: string
  type: string
  access: 'R' | 'W' | 'R/W'
}

export interface DeviceEntry {
  device: string
  logicTypes: DeviceLogicType[]
}

export const deviceLogicTypes: DeviceEntry[] = rawDeviceLogicTypes as DeviceEntry[]

export const deviceNames: string[] = deviceLogicTypes.map((d) => d.device).sort((a, b) => a.localeCompare(b))

const byDevice = new Map(deviceLogicTypes.map((d) => [d.device, d.logicTypes]))

/** LogicType names available for `device` on the given side of the `l`/`s`
 * instruction — `'read'` includes `R`/`R/W`, `'write'` includes `W`/`R/W`.
 * `device === '(any)'` (or an unrecognized name) returns every LogicType
 * name that appears with the right access on *any* device, deduped and
 * sorted — a reasonable fallback since a graph's `Device` property is just
 * a physical pin (d0-d5/db), not a guarantee of what's actually wired to
 * it in-game. */
export function logicTypeNamesFor(device: string, access: 'read' | 'write'): string[] {
  const matches = (a: DeviceLogicType['access']) => (access === 'read' ? a === 'R' || a === 'R/W' : a === 'W' || a === 'R/W')

  const entries = device !== '(any)' && byDevice.has(device) ? [byDevice.get(device)!] : deviceLogicTypes.map((d) => d.logicTypes)

  const names = new Set<string>()
  for (const logicTypes of entries) {
    for (const lt of logicTypes) {
      if (matches(lt.access)) names.add(lt.name)
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}
