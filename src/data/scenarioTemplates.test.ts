import { describe, expect, it } from 'vitest'
import { nodeDefinitions } from './nodeLibrary'
import { buildScenarioGraph, scenarioTemplates } from './scenarioTemplates'
import { generateScript } from '../lib/codegen/generate'
import { getGraphIssues } from '../lib/graphIssues'

const definitionsById = new Map(nodeDefinitions.map((d) => [d.Id, d]))

describe('scenarioTemplates', () => {
  it.each(scenarioTemplates)('$id builds a valid, error-free graph', (template) => {
    const graph = buildScenarioGraph(template, definitionsById)
    expect(graph.Nodes.length).toBe(template.nodes.length)
    expect(graph.Connections.length).toBe(template.edges.length)

    const issues = getGraphIssues({ nodes: graph.Nodes, connections: graph.Connections, definitionsById })
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])

    const { source } = generateScript(graph.Nodes, graph.Connections)
    expect(source).not.toContain('TODO codegen')
  })

  it('every template id is unique', () => {
    const ids = scenarioTemplates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
