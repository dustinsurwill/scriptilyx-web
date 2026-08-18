import { describe, expect, it } from 'vitest'
import { nodeDefinitions } from './nodeLibrary'
import { buildWizardGraph, wizardTemplates } from './wizardTemplates'
import { generateScript } from './codegen/generate'
import { getGraphIssues } from '../../lib/graphIssues'

const definitionsById = new Map(nodeDefinitions.map((d) => [d.Id, d]))

function expectValidGraph(values: Record<string, string>, wizard: (typeof wizardTemplates)[number]) {
  const graph = buildWizardGraph(wizard, values, definitionsById)
  const issues = getGraphIssues({ nodes: graph.Nodes, connections: graph.Connections, definitionsById })
  expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  const { source } = generateScript(graph.Nodes, graph.Connections)
  expect(source).not.toContain('TODO codegen')
  return graph
}

describe('wizardTemplates', () => {
  it.each(wizardTemplates)('$id builds a valid, error-free graph with default parameter values', (wizard) => {
    const defaults = Object.fromEntries(wizard.parameters.map((p) => [p.id, p.default]))
    expectValidGraph(defaults, wizard)
  })

  it('every wizard id is unique', () => {
    const ids = wizardTemplates.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('airlock_cycler', () => {
  const wizard = wizardTemplates.find((w) => w.id === 'airlock_cycler')!
  const base = Object.fromEntries(wizard.parameters.map((p) => [p.id, p.default]))

  it.each(['Pressure', 'Time', 'Both'])('builds a valid graph in %s wait mode', (waitMode) => {
    const graph = expectValidGraph({ ...base, waitMode }, wizard)
    // "Both" mode adds an extra Wait Seconds gate node per phase compared
    // to pure Pressure mode (a fallback timeout wired off the pressure
    // check's False branch) — confirms the mode actually changes the built
    // graph's shape, not just a property value.
    if (waitMode === 'Both') {
      const waitSecondsCount = graph.Nodes.filter((n) => n.ActionType === 'WaitSeconds').length
      expect(waitSecondsCount).toBeGreaterThan(1) // transit wait + at least one timeout gate
    }
  })

  it('never gates the sequence behind a one-shot argument check (the persisted-flag fix)', () => {
    const graph = buildWizardGraph(wizard, base, definitionsById)
    const dispatch = graph.Nodes.find((n) => n.DefinitionId === 'ext.bool.if')!
    const argCheck = graph.Nodes.find((n) => n.DefinitionId === 'logic.if_argument_equals')!
    // The argument check's False branch (argument not "cycle", i.e. every
    // regular tick) must still reach the dispatch node — otherwise the
    // sequence can only ever progress on the one tick the argument fires.
    const reachesDispatchOnFalse = graph.Connections.some(
      (c) => c.FromNodeId === argCheck.Id && c.FromPort === 'False' && c.ToNodeId === dispatch.Id,
    )
    expect(reachesDispatchOnFalse).toBe(true)
  })

  it('pressurize threshold is 100 minus the configured "empty" percent', () => {
    const graph = buildWizardGraph(wizard, { ...base, waitMode: 'Pressure', pressurePercent: '5' }, definitionsById)
    const depressurizeCheck = graph.Nodes.find((n) => n.DefinitionId === 'ext.vent.if_depressurized')!
    const pressurizeCheck = graph.Nodes.find((n) => n.DefinitionId === 'ext.vent.if_pressurized')!
    expect(depressurizeCheck.Properties.Percent).toBe('5')
    expect(pressurizeCheck.Properties.Percent).toBe('95')
  })
})

describe('cargo_full_alert', () => {
  const wizard = wizardTemplates.find((w) => w.id === 'cargo_full_alert')!
  const base = Object.fromEntries(wizard.parameters.map((p) => [p.id, p.default]))

  it('uses a single-block check by default', () => {
    const graph = buildWizardGraph(wizard, base, definitionsById)
    expect(graph.Nodes.some((n) => n.DefinitionId === 'ext.cargo.threshold')).toBe(true)
    expect(graph.Nodes.some((n) => n.DefinitionId === 'ext.cargo.group_threshold')).toBe(false)
  })

  it('switches to a group check when targetType is Group', () => {
    const graph = expectValidGraph({ ...base, targetType: 'Group', targetName: 'Mining Cargo' }, wizard)
    const groupCheck = graph.Nodes.find((n) => n.DefinitionId === 'ext.cargo.group_threshold')
    expect(groupCheck).toBeDefined()
    expect(groupCheck!.Properties.GroupName).toBe('Mining Cargo')
    expect(graph.Nodes.some((n) => n.DefinitionId === 'ext.cargo.threshold')).toBe(false)
  })
})

describe('auto_cockpit_lights', () => {
  const wizard = wizardTemplates.find((w) => w.id === 'auto_cockpit_lights')!

  it('turns lights OFF while piloted and ON while away (reversed from a naive "lights follow pilot")', () => {
    const graph = buildWizardGraph(wizard, { cockpit: 'Bridge', lightGroup: 'Bridge Lights' }, definitionsById)
    const piloted = graph.Nodes.find((n) => n.DefinitionId === 'ext.ship.if_under_control')!
    const onTrue = graph.Connections.find((c) => c.FromNodeId === piloted.Id && c.FromPort === 'True')!
    const onFalse = graph.Connections.find((c) => c.FromNodeId === piloted.Id && c.FromPort === 'False')!
    const trueTarget = graph.Nodes.find((n) => n.Id === onTrue.ToNodeId)!
    const falseTarget = graph.Nodes.find((n) => n.Id === onFalse.ToNodeId)!
    expect(trueTarget.Properties.Enabled).toBe('false')
    expect(falseTarget.Properties.Enabled).toBe('true')
  })

  it('falls back to defaults for blank/missing values', () => {
    const graph = buildWizardGraph(wizard, { cockpit: '  ' }, definitionsById)
    const names = graph.Nodes.flatMap((n) => Object.values(n.Properties))
    expect(names).toContain('Cockpit')
    expect(names).toContain('Interior Lights')
  })
})
