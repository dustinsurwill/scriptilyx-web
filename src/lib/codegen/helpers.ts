/** On-demand helper method library: emitters call `ctx.useHelper(id)` and the
 * corresponding source below is appended once, only if actually referenced. */
export const HELPER_SOURCE: Record<string, string> = {
  GetBlock: `IMyTerminalBlock GetBlock(string name) => GridTerminalSystem.GetBlockWithName(name);`,
  GetGroupBlocks: `List<IMyTerminalBlock> GetGroupBlocks(string name) {
    var list = new List<IMyTerminalBlock>();
    var group = GridTerminalSystem.GetBlockGroupWithName(name);
    if (group != null) group.GetBlocks(list);
    return list;
}`,
  Vars: `Dictionary<string, double> _num = new Dictionary<string, double>();
Dictionary<string, string> _text = new Dictionary<string, string>();
Dictionary<string, bool> _bool = new Dictionary<string, bool>();
double GetNum(string k) => _num.TryGetValue(k, out var v) ? v : 0;
string GetText(string k) => _text.TryGetValue(k, out var v) ? v : "";
bool GetBool(string k) => _bool.TryGetValue(k, out var v) && v;`,
}

/** Helper ids implicitly required by another helper (dependency edges). */
export const HELPER_DEPENDENCIES: Record<string, string[]> = {
  GetGroupBlocks: [],
}
