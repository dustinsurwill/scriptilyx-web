import type { Game } from '../../types/game'
import { nodeDefinitions } from './nodeLibrary'
import { generateScript } from './codegen/generate'

export const ic10Game: Game = {
  id: 'ic10',
  label: 'Stationeers (IC10)',
  tagline: 'IC10 chip scripts for Stationeers, generated as MIPS-like assembly.',
  fileExtension: '.ic10',
  saveFileExtension: '.ic10graph',
  nodeDefinitions,
  generate: (nodes, connections, options) => generateScript(nodes, connections, options),
  // No minify (already terse/line-based), no remapLegacyGraph (no prior
  // desktop tool to import from), no templates/wizards/itemList yet.
  lineLimit: { maxLines: 128, maxLineLength: 90 },
}
