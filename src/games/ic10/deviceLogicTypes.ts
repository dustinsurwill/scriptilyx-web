import rawDeviceLogicTypes from './deviceLogicTypes.json'

/** Compiled from the Stationeers Community Wiki (stationeers-wiki.com),
 * per-device IC10 logic parameter tables (145 devices/structures, 1546
 * name/type/access rows) — factual data (field names, value types, R/W
 * access), not wiki prose. See ../../../docs/ic10-api-notes.md for the
 * full sourcing/licensing note. UI-only for `logicTypeNamesFor` (see
 * nodeLibrary.ts's `DeviceType` property doc comment) — but `prefabHash`
 * IS read by codegen for the batch device nodes (`lb`/`sb`/`lbn`/`sbn`
 * family), which address devices by network-wide type hash rather than a
 * physical pin — this is the one place `DeviceType` is more than a UI
 * hint. Only ~99 of 145 devices have a hash the wiki documented; the rest
 * are `null` and excluded from the batch-node dropdown. */
export interface DeviceLogicType {
  name: string
  type: string
  access: 'R' | 'W' | 'R/W'
}

export interface DeviceEntry {
  device: string
  prefabHash: number | null
  logicTypes: DeviceLogicType[]
}

export const deviceLogicTypes: DeviceEntry[] = rawDeviceLogicTypes as DeviceEntry[]

export const deviceNames: string[] = deviceLogicTypes.map((d) => d.device).sort((a, b) => a.localeCompare(b))

/** Devices with a known prefab hash — the only ones usable as the
 * `DeviceType` on a batch device node, since that hash is what the
 * compiled `lb`/`sb`/... instruction actually addresses. */
export const deviceNamesWithHash: string[] = deviceLogicTypes
  .filter((d) => d.prefabHash !== null)
  .map((d) => d.device)
  .sort((a, b) => a.localeCompare(b))

const byDevice = new Map(deviceLogicTypes.map((d) => [d.device, d]))

export function prefabHashFor(device: string): number | undefined {
  return byDevice.get(device)?.prefabHash ?? undefined
}

/** LogicType names available for `device` on the given side of the `l`/`s`
 * instruction — `'read'` includes `R`/`R/W`, `'write'` includes `W`/`R/W`.
 * `device === '(any)'` (or an unrecognized name) returns every LogicType
 * name that appears with the right access on *any* device, deduped and
 * sorted — a reasonable fallback since a graph's `Device` property is just
 * a physical pin (d0-d5/db), not a guarantee of what's actually wired to
 * it in-game. */
export function logicTypeNamesFor(device: string, access: 'read' | 'write'): string[] {
  const matches = (a: DeviceLogicType['access']) => (access === 'read' ? a === 'R' || a === 'R/W' : a === 'W' || a === 'R/W')

  const entries =
    device !== '(any)' && byDevice.has(device) ? [byDevice.get(device)!.logicTypes] : deviceLogicTypes.map((d) => d.logicTypes)

  const names = new Set<string>()
  for (const logicTypes of entries) {
    for (const lt of logicTypes) {
      if (matches(lt.access)) names.add(lt.name)
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}
