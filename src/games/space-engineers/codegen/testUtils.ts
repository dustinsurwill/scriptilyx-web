import type { ScriptNode } from '../../../types/graph'
import type { EmitContext, NodeEmit } from './types'

let counter = 0

export function makeNode(overrides: Partial<ScriptNode> & Pick<ScriptNode, 'ActionType'>): ScriptNode {
  counter += 1
  return {
    Id: overrides.Id ?? `nid${counter}`,
    Number: overrides.Number ?? counter,
    DefinitionId: overrides.DefinitionId ?? overrides.ActionType,
    ActionType: overrides.ActionType,
    Title: overrides.Title ?? overrides.ActionType,
    Description: '',
    X: 0,
    Y: 0,
    InputPorts: overrides.InputPorts ?? ['In'],
    OutputPorts: overrides.OutputPorts ?? ['Next'],
    Properties: overrides.Properties ?? {},
  }
}

/** A controllable EmitContext for unit-testing a single emitter in
 * isolation, without running the full graph traversal. `next`/`callSection`
 * return predictable tokens; `usedHelpers` records every `useHelper` call.
 * `unwiredPorts` makes `hasNext`/`next` behave like the real generate.ts
 * does for a port nothing is actually connected to — a bare `// "Port" not
 * connected` comment instead of a call — so tests can exercise codegen
 * that has to handle that case correctly (see caseLine/nextBlock in
 * factories.ts/logicEmitters.ts). */
export function fakeContext(unwiredPorts: Set<string> = new Set()): EmitContext & { usedHelpers: Set<string> } {
  const usedHelpers = new Set<string>()
  return {
    usedHelpers,
    useHelper: (id) => usedHelpers.add(id),
    hasNext: (_node, port) => !unwiredPorts.has(port),
    next: (_node, port) => (unwiredPorts.has(port) ? `// "${port}" not connected` : `NEXT(${port});`),
    callSection: (name) => `CALL_SECTION(${name});`,
    variableKind: () => undefined,
  }
}

/** Narrows a NodeEmit to its `statements` array, failing the test with a
 * clear message if the emitter returned a different kind than expected. */
export function statementsOf(emit: NodeEmit): string[] {
  if (emit.kind === 'condition') return emit.statements ?? []
  return emit.statements
}

/** Narrows a NodeEmit to its `expression`, failing the test with a clear
 * message if the emitter isn't a condition. */
export function expressionOf(emit: NodeEmit): string {
  if (emit.kind !== 'condition') {
    throw new Error(`expected a condition emit, got kind "${emit.kind}"`)
  }
  return emit.expression
}
