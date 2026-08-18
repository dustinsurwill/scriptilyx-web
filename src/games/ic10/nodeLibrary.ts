import type { NodeDefinition } from '../../types/graph'
import { deviceNames } from './deviceLogicTypes'

const DEVICE_TYPE_OPTIONS = ['(any)', ...deviceNames]

/** Stationeers IC10 node catalog — hand-authored from IC10's own public
 * instruction-set documentation (see ../../../docs/ic10-api-notes.md for
 * sources), not reused from any third-party tool. Deliberately small: the
 * chip's 128-line/90-char cap makes a large catalog pointless — most of it
 * would describe nodes no graph could afford to use. Unlike Space
 * Engineers' node data (reused verbatim from a third party as public data,
 * see src/games/space-engineers/README.md), this catalog is original
 * content, so it's a plain TypeScript array rather than a JSON asset. */
export const nodeDefinitions: NodeDefinition[] = [
  {
    Id: 'ic10.start',
    Category: '🚀 Control',
    Title: 'Start',
    Description:
      'Program entry point. IC10 chips run continuously — after the last Sleep/Yield (or after 128 instructions executed in one tick), execution resumes exactly where it left off, not from here. Start only marks where a fresh chip begins.',
    Search: 'start begin entry',
    ActionType: 'Start',
    InputPorts: [],
    OutputPorts: ['Next'],
    Properties: {},
    Preview: 'Start',
  },
  {
    Id: 'ic10.sleep',
    Category: '🚀 Control',
    Title: 'Sleep',
    Description: 'Pauses for the given number of seconds, then resumes on Next. Compiles to the `sleep` instruction.',
    Search: 'sleep wait pause delay',
    ActionType: 'Sleep',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: { Seconds: { Type: 'number', DefaultValue: '1', Options: [] } },
    Preview: 'Sleep {Seconds}s',
  },
  {
    Id: 'ic10.yield',
    Category: '🚀 Control',
    Title: 'Yield',
    Description:
      'Pauses until the next game tick, then resumes on Next. Compiles to the `yield` instruction — put at least one Yield or Sleep somewhere in every loop so it resumes from a controlled point each tick instead of free-running up to the 128-instruction-per-tick budget.',
    Search: 'yield tick',
    ActionType: 'Yield',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {},
    Preview: 'Yield',
  },
  {
    Id: 'ic10.loop_to_start',
    Category: '🚀 Control',
    Title: 'Loop To Start',
    Description:
      'Jumps back to the Start node, unconditionally. Wire a dead-end branch here to make "go back to the top" explicit — an unconnected output port already defaults to this same jump, but this node makes the intent visible on the canvas.',
    Search: 'loop repeat restart goto',
    ActionType: 'LoopToStart',
    InputPorts: ['In'],
    OutputPorts: [],
    Properties: {},
    Preview: 'Loop to Start',
  },
  {
    Id: 'ic10.device.read',
    Category: '🔌 Devices',
    Title: 'Read Device Property',
    Description:
      'Reads a LogicType from a device pin into a named variable. Compiles to `l`. Which LogicTypes a device exposes varies per device — check the in-game Stationpedia rather than assuming.',
    Search: 'read device logictype sensor load l',
    ActionType: 'ReadDevice',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'db'] },
      // UI-only hint (which device the player expects on this pin) so the
      // LogicType picker can suggest the right names — doesn't affect
      // codegen, since the compiled instruction only ever sees Device and
      // LogicType. See src/games/ic10/deviceLogicTypes.ts.
      DeviceType: { Type: 'combo', DefaultValue: '(any)', Options: DEVICE_TYPE_OPTIONS },
      LogicType: { Type: 'text', DefaultValue: 'On', Options: [] },
      Name: { Type: 'text', DefaultValue: 'value', Options: [] },
    },
    Preview: '{Name} = {Device}.{LogicType}',
  },
  {
    Id: 'ic10.device.write',
    Category: '🔌 Devices',
    Title: 'Write Device Property',
    Description:
      'Writes a value — a literal number or another variable’s name — to a LogicType on a device pin. Compiles to `s`.',
    Search: 'write device logictype set s',
    ActionType: 'WriteDevice',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'db'] },
      DeviceType: { Type: 'combo', DefaultValue: '(any)', Options: DEVICE_TYPE_OPTIONS },
      LogicType: { Type: 'text', DefaultValue: 'On', Options: [] },
      Value: { Type: 'text', DefaultValue: '1', Options: [] },
    },
    Preview: '{Device}.{LogicType} = {Value}',
  },
  {
    Id: 'ic10.var.set',
    Category: '🔢 Variables',
    Title: 'Set Number',
    Description: 'Assigns a value — a literal number or another variable’s name — to a named variable. Compiles to `move`.',
    Search: 'set variable number move assign',
    ActionType: 'SetNumber',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Name: { Type: 'text', DefaultValue: 'value', Options: [] },
      Value: { Type: 'text', DefaultValue: '0', Options: [] },
    },
    Preview: '{Name} = {Value}',
  },
  {
    Id: 'ic10.var.math',
    Category: '🔢 Variables',
    Title: 'Number Math',
    Description:
      'Computes Value A (Operator) Value B and stores the result in a named variable. Unary operators (Round/Floor/Ceil/Abs/Sqrt) ignore Value B.',
    Search: 'math add subtract multiply divide modulo min max round floor ceil abs sqrt',
    ActionType: 'NumberMath',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Name: { Type: 'text', DefaultValue: 'result', Options: [] },
      Operator: {
        Type: 'combo',
        DefaultValue: 'Add',
        Options: ['Add', 'Subtract', 'Multiply', 'Divide', 'Modulo', 'Min', 'Max', 'Round', 'Floor', 'Ceil', 'Abs', 'Sqrt'],
      },
      ValueA: { Type: 'text', DefaultValue: '0', Options: [] },
      ValueB: { Type: 'text', DefaultValue: '0', Options: [] },
    },
    Preview: '{Name} = {ValueA} {Operator} {ValueB}',
  },
  {
    Id: 'ic10.compare',
    Category: '✅ Checks',
    Title: 'Compare',
    Description: 'Compares Value A to Value B and branches True or False. Compiles to a branch-if-true instruction plus a fallback jump.',
    Search: 'compare branch if equal less greater',
    ActionType: 'Compare',
    InputPorts: ['In'],
    OutputPorts: ['True', 'False'],
    Properties: {
      ValueA: { Type: 'text', DefaultValue: '0', Options: [] },
      Operator: {
        Type: 'combo',
        DefaultValue: 'Equal',
        Options: ['Equal', 'NotEqual', 'LessThan', 'LessOrEqual', 'GreaterThan', 'GreaterOrEqual'],
      },
      ValueB: { Type: 'text', DefaultValue: '0', Options: [] },
    },
    Preview: '{ValueA} {Operator} {ValueB} ?',
  },
]
