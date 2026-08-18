import type { NodeDefinition } from '../../types/graph'
import { deviceNames, deviceNamesWithHash } from './deviceLogicTypes'

const DEVICE_PINS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'db']
const DEVICE_TYPE_OPTIONS = ['(any)', ...deviceNames]
const BATCH_MODES = ['Average', 'Sum', 'Minimum', 'Maximum']

/** Stationeers IC10 node catalog — hand-authored from IC10's own public
 * instruction-set documentation (see ../../../docs/ic10-api-notes.md for
 * sources and for the full 154-instruction coverage table), not reused
 * from any third-party tool. Unlike Space Engineers' node data (reused
 * verbatim from a third party as public data, see
 * src/games/space-engineers/README.md), this catalog is original content,
 * so it's a plain TypeScript array rather than a JSON asset.
 *
 * Math/branch instruction *families* fold into one Operator combo each
 * (`Number Math`, `Compare`) rather than one node per mnemonic — e.g.
 * `Number Math` alone covers add/sub/mul/div/mod/min/max/round/floor/
 * ceil/abs/sqrt/sin/cos/tan/asin/acos/atan/atan2/exp/log/pow/and/or/xor/
 * nor/not/rol/ror/sla/sll/sra/srl/seq/sne/slt/sle/sgt/sge/sap/sna/snan/
 * snanz/clamp/lerp/ext/ins/rand (49 instructions, one node). */
export const nodeDefinitions: NodeDefinition[] = [
  // ── Control ──────────────────────────────────────────────────────────
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
    Id: 'ic10.call_subroutine',
    Category: '🚀 Control',
    Title: 'Call Subroutine',
    Description:
      'Jumps to whatever is wired on Next, remembering where to come back to (the `ra` register). Wire the far end to end in a Return From Subroutine node instead of looping back here, and it resumes right after this Call — lets you reuse one sequence of nodes from multiple call sites instead of duplicating it (useful for staying under the 128-line cap). Compiles to `jal`.',
    Search: 'call subroutine function jal',
    ActionType: 'CallSubroutine',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {},
    Preview: 'Call Subroutine',
  },
  {
    Id: 'ic10.return',
    Category: '🚀 Control',
    Title: 'Return From Subroutine',
    Description: 'Jumps back to whichever Call Subroutine node most recently jumped here. Compiles to `j ra`.',
    Search: 'return subroutine function ra',
    ActionType: 'ReturnFromSubroutine',
    InputPorts: ['In'],
    OutputPorts: [],
    Properties: {},
    Preview: 'Return',
  },

  // ── Devices ──────────────────────────────────────────────────────────
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
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
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
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
      DeviceType: { Type: 'combo', DefaultValue: '(any)', Options: DEVICE_TYPE_OPTIONS },
      LogicType: { Type: 'text', DefaultValue: 'On', Options: [] },
      Value: { Type: 'text', DefaultValue: '1', Options: [] },
    },
    Preview: '{Device}.{LogicType} = {Value}',
  },
  {
    Id: 'ic10.device.read_by_id',
    Category: '🔌 Devices',
    Title: 'Read Device Property (By ID)',
    Description:
      'Reads a LogicType from a device referenced by its numeric network ID (not a physical pin — see Read Device Property for that) into a named variable. Compiles to `ld`.',
    Search: 'read device logictype id ld',
    ActionType: 'ReadDeviceById',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      DeviceId: { Type: 'text', DefaultValue: 'id', Options: [] },
      DeviceType: { Type: 'combo', DefaultValue: '(any)', Options: DEVICE_TYPE_OPTIONS },
      LogicType: { Type: 'text', DefaultValue: 'On', Options: [] },
      Name: { Type: 'text', DefaultValue: 'value', Options: [] },
    },
    Preview: '{Name} = [{DeviceId}].{LogicType}',
  },
  {
    Id: 'ic10.device.write_by_id',
    Category: '🔌 Devices',
    Title: 'Write Device Property (By ID)',
    Description: 'Writes a value to a LogicType on a device referenced by its numeric network ID. Compiles to `sd`.',
    Search: 'write device logictype id sd',
    ActionType: 'WriteDeviceById',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      DeviceId: { Type: 'text', DefaultValue: 'id', Options: [] },
      DeviceType: { Type: 'combo', DefaultValue: '(any)', Options: DEVICE_TYPE_OPTIONS },
      LogicType: { Type: 'text', DefaultValue: 'On', Options: [] },
      Value: { Type: 'text', DefaultValue: '1', Options: [] },
    },
    Preview: '[{DeviceId}].{LogicType} = {Value}',
  },
  {
    Id: 'ic10.device.if_connected',
    Category: '🔌 Devices',
    Title: 'If Device Connected',
    Description:
      'Branches True if a device pin has something wired to it, False if not — check this before reading/writing a pin that might be empty. Compiles to `bdse`/`bdseal`.',
    Search: 'device connected set bdse bdns',
    ActionType: 'IfDeviceConnected',
    InputPorts: ['In'],
    OutputPorts: ['True', 'False'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
      CallOnTrue: { Type: 'bool', DefaultValue: 'false', Options: [] },
    },
    Preview: '{Device} connected?',
  },
  {
    Id: 'ic10.device.connected_value',
    Category: '🔌 Devices',
    Title: 'Device Connected?',
    Description:
      'Stores 1 in a named variable if a device pin is connected, 0 if not — the value form of If Device Connected, for when you want to keep the result instead of branching on it. Compiles to `sdse`.',
    Search: 'device connected value sdse sdns',
    ActionType: 'DeviceConnectedValue',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
      Name: { Type: 'text', DefaultValue: 'connected', Options: [] },
    },
    Preview: '{Name} = {Device} connected',
  },
  {
    Id: 'ic10.device.check_logic_type',
    Category: '🔌 Devices',
    Title: 'Check Device Supports LogicType',
    Description:
      'Branches Supported/NotSupported depending on whether the device on this pin actually supports reading (or writing) the given LogicType. Compiles to `bdnvl`/`bdnvs`.',
    Search: 'device valid logictype support bdnvl bdnvs',
    ActionType: 'CheckDeviceLogicType',
    InputPorts: ['In'],
    OutputPorts: ['Supported', 'NotSupported'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
      LogicType: { Type: 'text', DefaultValue: 'On', Options: [] },
      Mode: { Type: 'combo', DefaultValue: 'Load', Options: ['Load', 'Store'] },
    },
    Preview: '{Device}.{LogicType} supported ({Mode})?',
  },
  {
    Id: 'ic10.device.read_reagent',
    Category: '🔌 Devices',
    Title: 'Read Device Reagent',
    Description:
      'Reads how much of a named reagent a device on this pin has (Contents), needs (Required), or would need for its current recipe (Recipe), into a named variable. Compiles to `lr`.',
    Search: 'reagent contents required recipe lr',
    ActionType: 'ReadDeviceReagent',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
      ReagentMode: { Type: 'combo', DefaultValue: 'Contents', Options: ['Contents', 'Required', 'Recipe'] },
      ReagentName: { Type: 'text', DefaultValue: 'Iron', Options: [] },
      Name: { Type: 'text', DefaultValue: 'amount', Options: [] },
    },
    Preview: '{Name} = {Device} reagent {ReagentName} ({ReagentMode})',
  },
  {
    Id: 'ic10.device.reagent_item_hash',
    Category: '🔌 Devices',
    Title: 'Get Reagent Item Hash',
    Description:
      'Given a reagent name, stores the prefab hash of the item a device on this pin expects to fulfill that reagent (e.g. on an autolathe, the reagent "Iron" maps to the item hash for an iron ingot) into a named variable. Compiles to `rmap`.',
    Search: 'reagent map item hash rmap',
    ActionType: 'ReagentItemHash',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
      ReagentName: { Type: 'text', DefaultValue: 'Iron', Options: [] },
      Name: { Type: 'text', DefaultValue: 'itemHash', Options: [] },
    },
    Preview: '{Name} = itemHashFor({ReagentName})',
  },

  // ── Batch Devices (network-wide, by type hash) ──────────────────────
  {
    Id: 'ic10.batch.read',
    Category: '📡 Batch Devices',
    Title: 'Batch Read Device Property',
    Description:
      'Reads a LogicType from every device of the chosen type on the network (optionally filtered further by a custom device name), combined with the chosen batch mode, into a named variable. Compiles to `lb`/`lbn`.',
    Search: 'batch read device network hash lb lbn',
    ActionType: 'BatchReadDevice',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      DeviceType: { Type: 'combo', DefaultValue: deviceNamesWithHash[0] ?? '', Options: deviceNamesWithHash },
      DeviceName: { Type: 'text', DefaultValue: '(none)', Options: [] },
      LogicType: { Type: 'text', DefaultValue: 'On', Options: [] },
      BatchMode: { Type: 'combo', DefaultValue: 'Average', Options: BATCH_MODES },
      Name: { Type: 'text', DefaultValue: 'value', Options: [] },
    },
    Preview: '{Name} = batch({DeviceType}).{LogicType} [{BatchMode}]',
  },
  {
    Id: 'ic10.batch.write',
    Category: '📡 Batch Devices',
    Title: 'Batch Write Device Property',
    Description:
      'Writes a value to a LogicType on every device of the chosen type on the network (optionally filtered further by a custom device name). Compiles to `sb`/`sbn`.',
    Search: 'batch write device network hash sb sbn',
    ActionType: 'BatchWriteDevice',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      DeviceType: { Type: 'combo', DefaultValue: deviceNamesWithHash[0] ?? '', Options: deviceNamesWithHash },
      DeviceName: { Type: 'text', DefaultValue: '(none)', Options: [] },
      LogicType: { Type: 'text', DefaultValue: 'On', Options: [] },
      Value: { Type: 'text', DefaultValue: '1', Options: [] },
    },
    Preview: 'batch({DeviceType}).{LogicType} = {Value}',
  },
  {
    Id: 'ic10.batch.read_slot',
    Category: '📡 Batch Devices',
    Title: 'Batch Read Device Slot Property',
    Description:
      'Reads a slot LogicType (from the given slot index) from every device of the chosen type on the network, combined with the chosen batch mode, into a named variable. Compiles to `lbs`/`lbns`.',
    Search: 'batch read slot device network hash lbs lbns',
    ActionType: 'BatchReadDeviceSlot',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      DeviceType: { Type: 'combo', DefaultValue: deviceNamesWithHash[0] ?? '', Options: deviceNamesWithHash },
      DeviceName: { Type: 'text', DefaultValue: '(none)', Options: [] },
      SlotIndex: { Type: 'number', DefaultValue: '0', Options: [] },
      LogicSlotType: { Type: 'text', DefaultValue: 'Occupied', Options: [] },
      BatchMode: { Type: 'combo', DefaultValue: 'Average', Options: BATCH_MODES },
      Name: { Type: 'text', DefaultValue: 'value', Options: [] },
    },
    Preview: '{Name} = batch({DeviceType}) slot {SlotIndex}.{LogicSlotType} [{BatchMode}]',
  },
  {
    Id: 'ic10.batch.write_slot',
    Category: '📡 Batch Devices',
    Title: 'Batch Write Device Slot Property',
    Description:
      'Writes a value to a slot LogicType (at the given slot index) on every device of the chosen type on the network. Compiles to `sbs`.',
    Search: 'batch write slot device network hash sbs',
    ActionType: 'BatchWriteDeviceSlot',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      DeviceType: { Type: 'combo', DefaultValue: deviceNamesWithHash[0] ?? '', Options: deviceNamesWithHash },
      SlotIndex: { Type: 'number', DefaultValue: '0', Options: [] },
      LogicSlotType: { Type: 'text', DefaultValue: 'Occupied', Options: [] },
      Value: { Type: 'text', DefaultValue: '1', Options: [] },
    },
    Preview: 'batch({DeviceType}) slot {SlotIndex}.{LogicSlotType} = {Value}',
  },

  // ── Slots (single device, by pin) ───────────────────────────────────
  {
    Id: 'ic10.slot.read',
    Category: '📦 Slots',
    Title: 'Read Slot Property',
    Description:
      'Reads a slot LogicType (from the given slot index) from the device on this pin into a named variable — e.g. a printer/storage device\'s inventory slots. Compiles to `ls`.',
    Search: 'slot read inventory index ls',
    ActionType: 'ReadSlot',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
      SlotIndex: { Type: 'number', DefaultValue: '0', Options: [] },
      LogicSlotType: { Type: 'text', DefaultValue: 'Occupied', Options: [] },
      Name: { Type: 'text', DefaultValue: 'value', Options: [] },
    },
    Preview: '{Name} = {Device} slot {SlotIndex}.{LogicSlotType}',
  },
  {
    Id: 'ic10.slot.write',
    Category: '📦 Slots',
    Title: 'Write Slot Property',
    Description: 'Writes a value to a slot LogicType (at the given slot index) on the device on this pin. Compiles to `ss`.',
    Search: 'slot write inventory index ss',
    ActionType: 'WriteSlot',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'd0', Options: DEVICE_PINS },
      SlotIndex: { Type: 'number', DefaultValue: '0', Options: [] },
      LogicSlotType: { Type: 'text', DefaultValue: 'Occupied', Options: [] },
      Value: { Type: 'text', DefaultValue: '1', Options: [] },
    },
    Preview: '{Device} slot {SlotIndex}.{LogicSlotType} = {Value}',
  },

  // ── Variables ────────────────────────────────────────────────────────
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
      'Computes Value A (Operator) Value B (Value C) and stores the result in a named variable. Unary operators only use Value A; Random ignores all three; Clamp/Lerp/ApproxEqual/NotApproxEqual/ExtractBits/InsertBits use all three.',
    Search:
      'math add subtract multiply divide modulo min max round floor ceil abs sqrt sin cos tan bitwise and or xor shift rotate compare clamp lerp random',
    ActionType: 'NumberMath',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Name: { Type: 'text', DefaultValue: 'result', Options: [] },
      Operator: {
        Type: 'combo',
        DefaultValue: 'Add',
        Options: [
          'Add', 'Subtract', 'Multiply', 'Divide', 'Modulo', 'Min', 'Max',
          'Round', 'Floor', 'Ceil', 'Abs', 'Sqrt', 'Trunc', 'Sgn',
          'Sin', 'Cos', 'Tan', 'Asin', 'Acos', 'Atan', 'Atan2', 'Exp', 'Log', 'Pow',
          'And', 'Or', 'Xor', 'Nor', 'Not',
          'RotateLeft', 'RotateRight', 'ShiftLeftArithmetic', 'ShiftLeftLogical', 'ShiftRightArithmetic', 'ShiftRightLogical',
          'Equal', 'NotEqual', 'LessThan', 'LessOrEqual', 'GreaterThan', 'GreaterOrEqual',
          'ApproxEqual', 'NotApproxEqual', 'IsNaN', 'IsNotNaN',
          'Clamp', 'Lerp', 'ExtractBits', 'InsertBits', 'Random',
        ],
      },
      ValueA: { Type: 'text', DefaultValue: '0', Options: [] },
      ValueB: { Type: 'text', DefaultValue: '0', Options: [] },
      ValueC: { Type: 'text', DefaultValue: '0', Options: [] },
    },
    Preview: '{Name} = {ValueA} {Operator} {ValueB}',
  },
  {
    Id: 'ic10.var.select',
    Category: '🔢 Variables',
    Title: 'Select',
    Description: 'Stores If True in a named variable when Condition is non-zero, otherwise stores If False. Compiles to `select`.',
    Search: 'select ternary conditional if then else',
    ActionType: 'Select',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Name: { Type: 'text', DefaultValue: 'result', Options: [] },
      Condition: { Type: 'text', DefaultValue: '0', Options: [] },
      IfTrue: { Type: 'text', DefaultValue: '1', Options: [] },
      IfFalse: { Type: 'text', DefaultValue: '0', Options: [] },
    },
    Preview: '{Name} = {Condition} ? {IfTrue} : {IfFalse}',
  },

  // ── Checks ───────────────────────────────────────────────────────────
  {
    Id: 'ic10.compare',
    Category: '✅ Checks',
    Title: 'Compare',
    Description:
      'Compares Value A to Value B (and, for ApproxEqual/NotApproxEqual, Value C as the tolerance) and branches True or False. Automatically uses the shorter zero-compare instruction form when Value B is literally "0", and the call-and-link form when Save Return Address is checked (pairs with Return From Subroutine for the True path).',
    Search: 'compare branch if equal less greater approx nan',
    ActionType: 'Compare',
    InputPorts: ['In'],
    OutputPorts: ['True', 'False'],
    Properties: {
      ValueA: { Type: 'text', DefaultValue: '0', Options: [] },
      Operator: {
        Type: 'combo',
        DefaultValue: 'Equal',
        Options: [
          'Equal', 'NotEqual', 'LessThan', 'LessOrEqual', 'GreaterThan', 'GreaterOrEqual',
          'ApproxEqual', 'NotApproxEqual', 'IsNaN',
        ],
      },
      ValueB: { Type: 'text', DefaultValue: '0', Options: [] },
      ValueC: { Type: 'text', DefaultValue: '0.001', Options: [] },
      CallOnTrue: { Type: 'bool', DefaultValue: 'false', Options: [] },
    },
    Preview: '{ValueA} {Operator} {ValueB} ?',
  },

  // ── Stack ────────────────────────────────────────────────────────────
  {
    Id: 'ic10.stack.push',
    Category: '🗄 Stack',
    Title: 'Push To Stack',
    Description: "Pushes a value onto the IC's own stack. Compiles to `push`.",
    Search: 'push stack',
    ActionType: 'Push',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: { Value: { Type: 'text', DefaultValue: '0', Options: [] } },
    Preview: 'push {Value}',
  },
  {
    Id: 'ic10.stack.pop',
    Category: '🗄 Stack',
    Title: 'Pop From Stack',
    Description: "Pops the top value off the IC's own stack into a named variable. Compiles to `pop`.",
    Search: 'pop stack',
    ActionType: 'Pop',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: { Name: { Type: 'text', DefaultValue: 'value', Options: [] } },
    Preview: '{Name} = pop()',
  },
  {
    Id: 'ic10.stack.peek',
    Category: '🗄 Stack',
    Title: 'Peek Stack',
    Description: "Reads the top value of the IC's own stack into a named variable, without removing it. Compiles to `peek`.",
    Search: 'peek stack',
    ActionType: 'Peek',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: { Name: { Type: 'text', DefaultValue: 'value', Options: [] } },
    Preview: '{Name} = peek()',
  },
  {
    Id: 'ic10.stack.poke',
    Category: '🗄 Stack',
    Title: 'Poke Stack',
    Description: "Writes a value directly to the given address in the IC's own stack (not a device's — see Put Stack Value for that). Compiles to `poke`.",
    Search: 'poke stack memory address',
    ActionType: 'Poke',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Address: { Type: 'text', DefaultValue: '0', Options: [] },
      Value: { Type: 'text', DefaultValue: '0', Options: [] },
    },
    Preview: 'stack[{Address}] = {Value}',
  },
  {
    Id: 'ic10.stack.get',
    Category: '🗄 Stack',
    Title: 'Get Stack Value',
    Description: "Reads the value at the given address in a device's stack memory into a named variable. Compiles to `get`.",
    Search: 'get stack memory address',
    ActionType: 'GetStack',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'db', Options: DEVICE_PINS },
      Address: { Type: 'text', DefaultValue: '0', Options: [] },
      Name: { Type: 'text', DefaultValue: 'value', Options: [] },
    },
    Preview: '{Name} = {Device}[{Address}]',
  },
  {
    Id: 'ic10.stack.get_by_id',
    Category: '🗄 Stack',
    Title: 'Get Stack Value (By ID)',
    Description: "Reads the value at the given address in a device's stack memory (device referenced by numeric ID) into a named variable. Compiles to `getd`.",
    Search: 'get stack memory address id',
    ActionType: 'GetStackById',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      DeviceId: { Type: 'text', DefaultValue: 'id', Options: [] },
      Address: { Type: 'text', DefaultValue: '0', Options: [] },
      Name: { Type: 'text', DefaultValue: 'value', Options: [] },
    },
    Preview: '{Name} = [{DeviceId}][{Address}]',
  },
  {
    Id: 'ic10.stack.put',
    Category: '🗄 Stack',
    Title: 'Put Stack Value',
    Description: "Writes a value to the given address in a device's stack memory. Compiles to `put`.",
    Search: 'put stack memory address',
    ActionType: 'PutStack',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      Device: { Type: 'combo', DefaultValue: 'db', Options: DEVICE_PINS },
      Address: { Type: 'text', DefaultValue: '0', Options: [] },
      Value: { Type: 'text', DefaultValue: '0', Options: [] },
    },
    Preview: '{Device}[{Address}] = {Value}',
  },
  {
    Id: 'ic10.stack.put_by_id',
    Category: '🗄 Stack',
    Title: 'Put Stack Value (By ID)',
    Description: "Writes a value to the given address in a device's stack memory (device referenced by numeric ID). Compiles to `putd`.",
    Search: 'put stack memory address id',
    ActionType: 'PutStackById',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: {
      DeviceId: { Type: 'text', DefaultValue: 'id', Options: [] },
      Address: { Type: 'text', DefaultValue: '0', Options: [] },
      Value: { Type: 'text', DefaultValue: '0', Options: [] },
    },
    Preview: '[{DeviceId}][{Address}] = {Value}',
  },
  {
    Id: 'ic10.stack.clear',
    Category: '🗄 Stack',
    Title: 'Clear Device Stack',
    Description: "Clears a device's stack memory. Compiles to `clr`.",
    Search: 'clear stack memory',
    ActionType: 'ClearStack',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: { Device: { Type: 'combo', DefaultValue: 'db', Options: DEVICE_PINS } },
    Preview: 'clear {Device} stack',
  },
  {
    Id: 'ic10.stack.clear_by_id',
    Category: '🗄 Stack',
    Title: 'Clear Device Stack (By ID)',
    Description: "Clears a device's stack memory (device referenced by numeric ID). Compiles to `clrd`.",
    Search: 'clear stack memory id',
    ActionType: 'ClearStackById',
    InputPorts: ['In'],
    OutputPorts: ['Next'],
    Properties: { DeviceId: { Type: 'text', DefaultValue: 'id', Options: [] } },
    Preview: 'clear [{DeviceId}] stack',
  },
]
