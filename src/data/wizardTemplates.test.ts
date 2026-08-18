import { describe, expect, it } from 'vitest'
import { nodeDefinitions } from './nodeLibrary'
import { buildWizardGraph, wizardTemplates } from './wizardTemplates'
import { generateScript } from '../lib/codegen/generate'
import { getGraphIssues } from '../lib/graphIssues'

const definitionsById = new Map(nodeDefinitions.map((d) => [d.Id, d]))

describe('wizardTemplates', () => {
  it.each(wizardTemplates)('$id builds a valid, error-free graph with default parameter values', (wizard) => {
    const defaults = Object.fromEntries(wizard.parameters.map((p) => [p.id, p.default]))
    const graph = buildWizardGraph(wizard, defaults, definitionsById)
    expect(graph.Nodes.length).toBe(wizard.nodes.length)
    expect(graph.Connections.length).toBe(wizard.edges.length)

    // No leftover "{param}" placeholders after substitution.
    for (const node of graph.Nodes) {
      for (const value of Object.values(node.Properties)) {
        expect(value).not.toMatch(/\{[a-zA-Z]\w*\}/)
      }
    }

    const issues = getGraphIssues({ nodes: graph.Nodes, connections: graph.Connections, definitionsById })
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])

    const { source } = generateScript(graph.Nodes, graph.Connections)
    expect(source).not.toContain('TODO codegen')
  })

  it('substitutes custom parameter values, not just defaults', () => {
    const wizard = wizardTemplates.find((w) => w.id === 'auto_cockpit_lights')!
    const graph = buildWizardGraph(wizard, { cockpit: 'Bridge', lightGroup: 'Bridge Lights' }, definitionsById)
    const names = graph.Nodes.flatMap((n) => Object.values(n.Properties))
    expect(names).toContain('Bridge')
    expect(names).toContain('Bridge Lights')
    expect(names).not.toContain('Cockpit')
  })

  it('falls back to defaults for blank/missing values', () => {
    const wizard = wizardTemplates.find((w) => w.id === 'auto_cockpit_lights')!
    const graph = buildWizardGraph(wizard, { cockpit: '  ' }, definitionsById)
    const names = graph.Nodes.flatMap((n) => Object.values(n.Properties))
    expect(names).toContain('Cockpit')
    expect(names).toContain('Interior Lights')
  })

  it('every wizard id is unique', () => {
    const ids = wizardTemplates.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
