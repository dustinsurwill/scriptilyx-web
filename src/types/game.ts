import type { GraphSaveData, NodeConnection, NodeDefinition, ScriptNode } from './graph'

export interface GenerateOptions {
  professionalComments?: boolean
}

export interface GenerateResult {
  source: string
  warnings: string[]
}

/** A pre-built example graph, shown grouped by `tier` in the Templates
 * menu. `build` is already bound to whatever the game's own template data
 * needs (a ref-addressed node/edge list, a fixed layout, etc.) — the menu
 * only ever calls it with the active game's own `definitionsById`. */
export interface GameTemplate {
  id: string
  title: string
  tier: string
  description: string
  build: (definitionsById: Map<string, NodeDefinition>) => GraphSaveData
}

export interface GameWizardParameter {
  id: string
  label: string
  type: 'text' | 'number' | 'combo'
  default: string
  options?: string[]
}

/** A modal-driven, parameterized script. `build` receives the values the
 * player filled into the form (keyed by `GameWizardParameter.id`) plus the
 * active game's `definitionsById`. */
export interface GameWizard {
  id: string
  title: string
  description: string
  parameters: GameWizardParameter[]
  build: (values: Record<string, string>, definitionsById: Map<string, NodeDefinition>) => GraphSaveData
}

/** An entry for a searchable item-id picker (Space Engineers' ore/ingot/
 * component list today). Optional — most games won't have this concept. */
export interface GameItem {
  id: string
  name: string
  category: string
}

/** Everything the editor shell needs to run against one target game/
 * language. Each game lives under `src/games/<id>/` and exports exactly
 * one of these from its `index.ts`; `src/games/registry.ts` collects them. */
export interface Game {
  id: string
  label: string
  tagline: string
  /** Exported script file extension, e.g. '.cs'. */
  fileExtension: string
  /** Save-file extension for this game's graph format, e.g. '.segraph'. */
  saveFileExtension: string
  nodeDefinitions: NodeDefinition[]
  generate: (nodes: ScriptNode[], connections: NodeConnection[], options: GenerateOptions) => GenerateResult
  /** Optional post-processing minifier; omitted entirely for games with no
   * such concept. */
  minify?: (source: string) => string
  /** Rewrites an older/foreign save file onto this game's current node
   * catalog. Only Space Engineers has a legacy desktop-app format to
   * import — other games simply omit this and loaded files pass through
   * unchanged. */
  remapLegacyGraph?: (data: GraphSaveData) => GraphSaveData
  templates?: GameTemplate[]
  wizards?: GameWizard[]
  itemList?: GameItem[]
}
