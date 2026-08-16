import { LEGACY_NODE_ID_REMAP } from '../data/legacyNodeRemap'
import { nodeDefinitions } from '../data/nodeLibrary'
import type { GraphSaveData, ScriptNode } from '../types/graph'

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
    return {
      ...node,
      DefinitionId: definition.Id,
      ActionType: definition.ActionType,
      Title: definition.Title,
      Description: definition.Description,
      InputPorts: [...definition.InputPorts],
      OutputPorts: [...definition.OutputPorts],
      Properties: { ...node.Properties, ...remap.properties },
    }
  })
  return changed ? { ...data, Nodes: nodes } : data
}
