import type { Game } from '../../types/game'
import { nodeDefinitions } from './nodeLibrary'
import { advancedPeripheralsAddon } from './advancedPeripherals'
import { generateScript } from './codegen/generate'
import { buildScenarioGraph, scenarioTemplates } from './scenarioTemplates'

export const ccTweakedGame: Game = {
  id: 'cc-tweaked',
  label: 'CC: Tweaked',
  tagline: 'ComputerCraft turtle/computer scripts, generated as Lua.',
  fileExtension: '.lua',
  saveFileExtension: '.ccgraph',
  nodeDefinitions,
  generate: (nodes, connections, options) => generateScript(nodes, connections, options),
  addons: [advancedPeripheralsAddon],
  templates: scenarioTemplates.map((template) => ({
    id: template.id,
    title: template.title,
    tier: template.tier,
    description: template.description,
    build: (definitionsById) => buildScenarioGraph(template, definitionsById),
  })),
  // No minify (nothing forces one yet), no remapLegacyGraph (no prior
  // desktop tool to import from), no wizards/itemList/charLimit/lineLimit
  // for v1.
}
