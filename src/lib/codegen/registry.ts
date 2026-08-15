import type { ScriptNode } from '../../types/graph'
import { genericEmitters } from './emitters'
import * as logic from './logicEmitters'
import type { NodeEmitter } from './types'

const controlFlowEmitters: Record<string, NodeEmitter> = {
  Start: logic.startEmitter,
  RunOnceOnWorldLoad: logic.runOnceOnWorldLoadEmitter,
  IfArgumentEquals: logic.ifArgumentEqualsEmitter,
  RunEverySeconds: logic.runEverySecondsEmitter,
  Echo: logic.echoEmitter,
  SetRuntimeUpdate: logic.setRuntimeUpdateEmitter,
  Note: logic.noteEmitter,
  WaitSeconds: logic.waitSecondsEmitter,
  StopScript: logic.stopScriptEmitter,
  CommandRouter: logic.commandRouterEmitter,
  NumberGreaterRouter: logic.numberGreaterRouterEmitter,
  RepeatTimes: logic.repeatTimesEmitter,
  CustomCode: logic.customCodeEmitter,
  SetNumberVariable: logic.setNumberVariableEmitter,
  AddNumberVariable: logic.addNumberVariableEmitter,
  SetTextVariable: logic.setTextVariableEmitter,
  IfNumberLessThan: logic.ifNumberLessThanEmitter,
  IfNumberGreaterThan: logic.ifNumberGreaterThanEmitter,
  IfTextEquals: logic.ifTextEqualsEmitter,
  StartSection: logic.startSectionEmitter,
  CallSection: logic.callSectionEmitter,
  Return: logic.returnEmitter,
}

const emitterByActionType: Record<string, NodeEmitter> = {
  ...genericEmitters,
  ...controlFlowEmitters,
}

/** `ExtendedBuiltin` nodes are disambiguated by their node-library id, not
 * their (shared) ActionType; none are implemented yet, so every one falls
 * through to the stub below until a follow-up pass fills the table in. */
const extendedBuiltinEmitters: Record<string, NodeEmitter> = {}

function stubEmitter(node: ScriptNode, ctx: Parameters<NodeEmitter>[1]): ReturnType<NodeEmitter> {
  return {
    kind: 'action',
    statements: [
      `// TODO codegen: ${node.DefinitionId} ("${node.Title}") not yet implemented.`,
      ctx.next(node, 'Next'),
    ],
  }
}

export function resolveEmitter(node: ScriptNode): NodeEmitter {
  if (node.ActionType === 'ExtendedBuiltin') {
    return extendedBuiltinEmitters[node.DefinitionId] ?? stubEmitter
  }
  return emitterByActionType[node.ActionType] ?? stubEmitter
}
