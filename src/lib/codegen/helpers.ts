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
  ApplyActionNamed: `void ApplyActionNamed(IMyTerminalBlock block, string contains) {
    if (block == null) return;
    var actions = new List<ITerminalAction>();
    block.GetActions(actions);
    foreach (var a in actions) {
        if (a.Id.IndexOf(contains, StringComparison.OrdinalIgnoreCase) >= 0 || a.Name.ToString().IndexOf(contains, StringComparison.OrdinalIgnoreCase) >= 0) {
            a.Apply(block);
            return;
        }
    }
}`,
  GetItemAmount: `double GetItemAmount(IMyInventory inv, string itemType) {
    if (inv == null) return 0;
    var items = new List<MyInventoryItem>();
    inv.GetItems(items);
    double total = 0;
    foreach (var item in items) {
        string full = item.Type.TypeId + "/" + item.Type.SubtypeId;
        if (full == itemType || item.Type.SubtypeId == itemType) total += (double)item.Amount;
    }
    return total;
}`,
  Rng: `Random _rng = new Random();`,
}
