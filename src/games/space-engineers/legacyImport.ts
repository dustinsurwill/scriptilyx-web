import { LEGACY_NODE_ID_REMAP } from './legacyNodeRemap'
import { nodeDefinitions } from './nodeLibrary'
import type { GraphSaveData, ScriptNode } from '../../types/graph'

const definitionsById = new Map(nodeDefinitions.map((d) => [d.Id, d]))

/**
 * Rewrites any node whose DefinitionId was retired by the Milestone 7.2
 * catalog cleanup (merged on/off preset pairs, folded button-command
 * presets) onto its replacement definition, so `.segraph` files saved
 * against the old catalog — including real Scriptilyx SE desktop-app
 * exports that predate this project's cleanup — still open with working
 * ports and codegen instead of a dangling, unrecognized DefinitionId.
 * Nodes whose DefinitionId isn't in the remap table (already current, or
 * genuinely unknown) pass through unchanged.
 */
export function remapLegacyGraph(data: GraphSaveData): GraphSaveData {
  let changed = false
  const nodes: ScriptNode[] = data.Nodes.map((node) => {
    const remap = LEGACY_NODE_ID_REMAP[node.DefinitionId]
    if (!remap) return node
    const definition = definitionsById.get(remap.newId)
    if (!definition) return node
    changed = true

    // Old key -> new key first (e.g. AddNumberVariable's "AddValue" ->
    // Number Math's "Value"), then the fixed overrides on top.
    const carried: Record<string, string> = { ...node.Properties }
    for (const [oldKey, newKey] of Object.entries(remap.renameProperties ?? {})) {
      if (oldKey in carried) {
        carried[newKey] = carried[oldKey]
        delete carried[oldKey]
      }
    }
    const merged = { ...carried, ...remap.properties }

    // Rebuild Properties from the new definition's own key set (falling
    // back to its DefaultValue) rather than spreading the old node's
    // Properties wholesale — otherwise a stale key with no home on the
    // new definition (nothing renamed it away) would linger and show up
    // as a spurious extra field in PropertyPanel.
    const properties: Record<string, string> = {}
    for (const [key, propDef] of Object.entries(definition.Properties)) {
      properties[key] = merged[key] ?? propDef.DefaultValue
    }

    return {
      ...node,
      DefinitionId: definition.Id,
      ActionType: definition.ActionType,
      Title: definition.Title,
      Description: definition.Description,
      InputPorts: [...definition.InputPorts],
      OutputPorts: [...definition.OutputPorts],
      Properties: properties,
    }
  })
  return changed ? { ...data, Nodes: nodes } : data
}
