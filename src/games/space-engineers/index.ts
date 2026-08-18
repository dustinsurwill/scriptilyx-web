import type { Game } from '../../types/game'
import { nodeDefinitions } from './nodeLibrary'
import { buildScenarioGraph, scenarioTemplates } from './scenarioTemplates'
import { buildWizardGraph, wizardTemplates } from './wizardTemplates'
import { inventoryItems } from './inventoryItems'
import { generateScript, minifySource } from './codegen'
import { remapLegacyGraph } from './legacyImport'

export const spaceEngineersGame: Game = {
  id: 'space-engineers',
  label: 'Space Engineers',
  tagline: 'Programmable Block scripts, generated as C#.',
  fileExtension: '.cs',
  saveFileExtension: '.segraph',
  nodeDefinitions,
  generate: (nodes, connections, options) => generateScript(nodes, connections, options),
  minify: minifySource,
  remapLegacyGraph,
  templates: scenarioTemplates.map((template) => ({
    id: template.id,
    title: template.title,
    tier: template.tier,
    description: template.description,
    build: (definitionsById) => buildScenarioGraph(template, definitionsById),
  })),
  wizards: wizardTemplates.map((wizard) => ({
    id: wizard.id,
    title: wizard.title,
    description: wizard.description,
    parameters: wizard.parameters,
    build: (values, definitionsById) => buildWizardGraph(wizard, values, definitionsById),
  })),
  itemList: inventoryItems,
  // The programmable block's terminal rejects scripts over 100,000 chars.
  charLimit: { max: 100_000, amberAt: 80_000, redAt: 95_000 },
}
