import type { ScriptNode } from '../../types/graph'

export interface CodegenOptions {
  /** Tick-budgeted state machine for graphs too large for one game tick.
   * Unset -> straight recursive method-call emission (small/medium graphs). */
  multiTickBudget?: { maxNodesPerTick: number }
  /** Emit a generated header comment summarizing the graph. */
  professionalComments?: boolean
}

export interface EmitContext {
  /** Statements that call the node reached via `port`, or a no-op comment
   * if that output port has no outgoing wire. */
  next: (node: ScriptNode, port: string) => string
  /** Registers a helper method (by id) to be included once in the output. */
  useHelper: (id: string) => void
  /** True if the node has an outgoing wire on `port`. */
  hasNext: (node: ScriptNode, port: string) => boolean
  /** Statement that transfers control to the StartSection node with this
   * `SectionName`, respecting the active emission strategy. */
  callSection: (sectionName: string) => string
}

/** A node compiles to exactly one statement list (an "action"), one boolean
 * expression guarding True/False branches (a "condition"), or a fully custom
 * method body (control-flow nodes: routers, loops, Start, Return...). */
export type NodeEmit =
  | { kind: 'action'; statements: string[] }
  | { kind: 'condition'; expression: string; statements?: string[] }
  | { kind: 'raw'; statements: string[] }

export type NodeEmitter = (node: ScriptNode, ctx: EmitContext) => NodeEmit
