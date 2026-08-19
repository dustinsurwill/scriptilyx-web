import type { ScriptNode } from '../../../types/graph'
import { genericEmitters } from './emitters'
import { extendedEmitters } from './extendedEmitters'
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
  Switch: logic.switchEmitter,
  RepeatTimes: logic.repeatTimesEmitter,
  CustomCode: logic.customCodeEmitter,
  SetNumberVariable: logic.setNumberVariableEmitter,
  NumberMath: logic.numberMathEmitter,
  CalculateFormula: logic.calculateEmitter,
  SetTextVariable: logic.setTextVariableEmitter,
  AppendTextVariable: logic.appendTextVariableEmitter,
  IfNumberLessThan: logic.ifNumberLessThanEmitter,
  IfNumberGreaterThan: logic.ifNumberGreaterThanEmitter,
  NumberCompare: logic.numberCompareEmitter,
  IfTextEquals: logic.ifTextEqualsEmitter,
  StartSection: logic.startSectionEmitter,
  CallSection: logic.callSectionEmitter,
  Return: logic.returnEmitter,
}

const emitterByActionType: Record<string, NodeEmitter> = {
  ...genericEmitters,
  ...controlFlowEmitters,
}

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
    return extendedEmitters[node.DefinitionId] ?? stubEmitter
  }
  return emitterByActionType[node.ActionType] ?? stubEmitter
}
