# Scriptilyx Web — Implementation Plan

> Working plan for this project, kept in sync as milestones land. See
> `CLAUDE.md` at the repo root for the condensed, load-bearing constraints.

## Status

**Milestone 7.1 done (merged in #8).** Templates (`src/data/
scenarioTemplates.ts`, `TemplatesMenu.tsx`) — 4 static worked-example
graphs laid out with a branch-aware layered layout (`src/data/
graphAssembly.ts`) — and Wizards (`src/data/wizardTemplates.ts`,
`WizardsMenu.tsx`/`WizardModal.tsx`) — a separate, modal-driven system for
Airlock Cycler, Cargo Full Alert, and Auto Cockpit Lights — plus a
searchable item picker (`src/data/inventoryItems.ts`, `ItemPicker.tsx`)
for the `ItemId`/`ItemType` fields. Also added a native catalog node,
`Cargo Group Threshold`, for the cargo wizard's Group option. See
"Templates, Wizards, item picker" below for the full design writeup.

**Milestone 7.2 done (merged in #7).** Cleaned up the native node catalog
(346 → 280 node definitions across seven merge passes — on/off preset
pairs, Above/Below threshold pairs, Wheel bool presets, number-variable
math/equality nodes, True/False and Above/Below check pairs, and
identical-emitter Enabled/Working checks under different names — see
"Native catalog cleanup" below for the full breakdown), added a
`remapLegacyGraph()` importer (`src/lib/legacyImport.ts`) so old
`.segraph` files — including real desktop-app exports — keep working
against the cleaned catalog, added a `Number Compare`/`Number Math`
generic-operator node pair, and shipped phase 1 of property-as-input:
`resolvableBool`/`resolvableNumber` plus a graph-wide variable registry
(`src/lib/variableRegistry.ts`) that lets a bare `{name}` interpolation
resolve to the right type without a `num:`/`text:`/`bool:` prefix, backed
by a `PropertyPanel` variable picker and a duplicate-variable-type
validation warning. See "Native catalog cleanup" and "Property-as-input"
below for the full design writeups, including what's documented-but-not-
started (data ports, a terminal-property library, a dynamic-output switch
node).

- [x] Milestone 1 — Repo/pipeline skeleton (merged in #1)
- [x] Milestone 2 — Data layer (merged in #2)
- [x] Milestone 3 — Canvas (merged in #3)
- [x] Milestone 4 — Codegen (merged in #4)
- [x] Milestone 5 — Minify (merged in #5)
- [x] Milestone 6 — Persistence (merged in #6)
- [x] Milestone 7.1 — Stretch: templates, wizards, item picker (merged in #8)
- [x] Milestone 7.2 — Stretch: cleaned-up native node catalog + `.segraph`
      import (merged in #7)
- [ ] Milestone 7.3 — Stretch: `.segraph` export (legacy-compatible), may end
      up documented-only

## Context

Scriptilyx SE is a Windows/WPF desktop app for visually building Space
Engineers programmable-block scripts. This project (`scriptilyx-web`) is a
from-scratch web app — React + TypeScript + React Flow, deployed as a
static site to GitHub Pages — that reproduces the tool's functionality in
the browser, with no backend, plus one new feature the desktop app never
had: a script **minifier** to help stay under Space Engineers' practical
script-size limits. Thresholds are checked against the real programmable-block
limit (100,000 characters, confirmed against the in-game editor) rather than
a guessed number — green under 80,000, amber 80,000–95,000, red above
95,000.

This ships from a brand-new, independent repo, not a fork of the original —
no shared git history, binaries, or source with it. The README credits/links
the original project.

Fully static/no-backend is intentional and sufficient: the whole app is
load-JSON → edit-graph-in-memory → generate-string. Storage is `localStorage`
autosave plus manual file export/import — both client-only.

## IP handling (binding constraint on everything below)

We are not the original author (ChaosVROne) and not authorized by them. The
original repo deliberately ships no source and no LICENSE — that's "all
rights reserved" by default, not an oversight. Concretely:

- The original app's source code is never committed here or referenced in
  code comments/commits. Any local research into how the original app
  behaves is kept entirely outside this repo.
- The codegen engine is a **clean-room reimplementation**, not a port of the
  original's algorithm/structure. It's designed directly from the node
  *spec* (`NodeLibrary.json`'s `Title`/`Description`/`Preview`/ports/
  properties already documents required behavior in plain English) and the
  public Space Engineers Programmable Block API — not from the original's
  internal code shape.
- `NodeLibrary.json` / `ConveyorSorterItems.json` / node-pack JSON are reused
  verbatim as the node database. This is plain data (block names,
  categories, action ids, UI copy) already shipped publicly in the app's own
  releases — much lower creative-expression/copyright weight than source
  code — and is credited in the data file header and README.

## Tech stack

- **Vite + React + TypeScript** for the app shell.
- **React Flow (`@xyflow/react`)** for the canvas — infinite pan/zoom,
  custom node components, `Handle`-based ports, edge drawing.
- **Zustand** for graph state — an action-based store with real undo/redo.
- No backend, no database. `localStorage`/`IndexedDB` for autosave,
  `Blob` + `<a download>` for exports, `<input type="file">` for imports,
  Clipboard API for "Copy Script".

## Data layer

- `NodeDefinition`, `NodePropertyDefinition` (`Type: "text"|"multiline"|
  "number"|"combo"|"bool"`, `DefaultValue: string`, `Options: string[]`),
  `ScriptNode`, `NodeConnection`, `GraphSaveData` as TypeScript types.
- Ship `NodeLibrary.json` (345 node defs, 16 categories) as a static asset,
  loaded at startup, credited to the original project.
- **Save file compatibility**: keep the `.segraph` format (plain indented
  JSON of `{Nodes, Connections, NextNodeNumber, Zoom}`) as the export/import
  schema, so users' existing desktop-app save files open directly here. Our
  own defensive load-time validation (reject non-finite coordinates, default
  missing fields, clamp zoom), designed independently against the schema.
- Conveyor sorter/inventory item picker (item id fields like `ItemId`/
  `ItemType`): deferred to the stretch milestone — see 7.1 below. (Node
  pack import/management, previously also slated for 7.1, was dropped:
  there's no node-pack JSON in hand to build against, so it'd be UI for a
  format nobody's produced yet.)

## Canvas / editor (React Flow)

- Custom React Flow node component: header (title + number badge),
  left-stacked input `Handle`s, right-stacked output `Handle`s, preview text
  (substitute `{PropertyName}` tokens into `NodeDefinition.Preview`). Port
  counts are dynamic per node.
- **Connection rule**: one outgoing wire per output port (connecting a new
  one replaces the old); an input port can receive multiple incoming wires.
  Enforced in React Flow's `onConnect` handler.
- Deleting a node cascades to delete its incident edges (React Flow default).
- Zoom/pan via React Flow's built-in infinite viewport; persist zoom into
  `GraphSaveData.Zoom` on save for file-format parity.
- Property panel driven by `NodePropertyDefinition.Type`: `text`/`number` →
  single-line input (no min/max — parity with the original, validated only
  at generate-time), `multiline` → textarea (monospace when the key is
  `"Code"`), `combo`/`bool` → select dropdown (`bool` defaults to
  `["true","false"]` if `Options` is empty).
- Node palette/search: sidebar grouped by `Category`, live substring filter
  against `Title`, `Category`, `Search`, `ActionType`.
- Validation panel: pure function `getGraphIssues(nodes, edges)` (no Start
  node, multiple Start nodes, unreachable nodes, unconnected output ports,
  empty/non-numeric property values, dangling edges).

## Codegen engine — clean-room reimplementation, single design

One engine, designed from the node spec and the public SE API, with two
independent options:

- `multiTickBudget?: { maxNodesPerTick: number }` — tick-budgeted state
  machine (one dispatch case per node id, explicit "next node" pointer,
  per-tick node-count budget, yields via `Runtime.UpdateFrequency =
  Update1`) for graphs too large for one game tick. Unset → straight
  recursive emission for small/medium graphs.
- `professionalComments?: boolean` — toggles a generated header comment
  summarizing the graph.

Always compile each node to exactly one case/function referenced by id
(never inline per-branch), so a node reachable via two branches is only
ever emitted once.

Pieces: graph traversal (DFS/BFS from `Start`, global visited set), an
`ActionType → code emitter` table (one entry per `NodeDefinition`, written
against SE's public API + each node's own `Preview`/`Description`), an
on-demand helper-method library, property coercion utilities, and
validation (no/multiple Start nodes, unreachable nodes, unconnected
required ports, non-numeric `number` properties, dangling connections, plus
size-based warnings).

## New feature: Minify

No prior art to reuse — new functionality. Since we own the generator
output format exactly, a full parser isn't needed: strip `//` line comments
and blank-line runs, trim per-line leading indentation, leave string
literals untouched (our own generator never emits `//` inside a string, so
a line-based strip is safe). Toggle next to the script preview; live char
count against the game's real programmable-block limit (100,000 chars,
confirmed against the in-game editor) for both minified and unminified
sizes — green under 80,000, amber 80,000–95,000, red above 95,000, with the
count itself always shown so it's not just a color guess.

## Persistence

- **Autosave**: debounced write of current `GraphSaveData` to `localStorage`
  on every graph change.
- **Save/Open**: `.segraph`/`.json` download (`Blob` + `<a download>`) and
  upload (`<input type="file">`), same schema as the desktop app.
- **Export Script**: `.cs` file download of the generated text.
- **Copy Script**: `navigator.clipboard.writeText`.
- **Undo/redo**: real action-based history (Zustand + a linear undo stack).

## Milestones

1. **Repo/pipeline skeleton** ✅ — new repo, Vite+React+TS scaffold, GitHub
   Actions → Pages deploy proven working (live at
   https://dustinsurwill.github.io/scriptilyx-web/).
2. **Data layer** — types, `NodeLibrary.json` loading, node palette list (no
   canvas yet) to validate data end-to-end.
3. **Canvas** — React Flow integration, custom node component, property
   panel, add/connect/move/delete, validation panel.
4. **Codegen** — unified generator + helper library, preview pane wired to
   live graph state.
5. **Minify** — toggle + size meter.
6. **Persistence** — autosave, save/open/export/copy, undo/redo.
7. **Stretch (later)**:
   - 7.1. **Templates, Wizards, conveyor sorter/inventory item picker.**
     Templates (`src/data/scenarioTemplates.ts`,
     `TemplatesMenu.tsx`) and Wizards (`src/data/wizardTemplates.ts`,
     `WizardsMenu.tsx`/`WizardModal.tsx`) are deliberately separate
     systems, not two names for the same feature: Templates are static
     worked examples that load as-is, picked to show off what the graph
     editor/codegen can do (multi-way branching, persistence, fan-in/
     fan-out). Wizards are practical, ready-to-use scripts (Airlock Cycler,
     Cargo Full Alert, Auto Cockpit Lights) collected through a short modal
     form first — a handful of parameters (block/group names, timings/
     thresholds) get substituted into the graph before it's built and
     wired, so the result needs at most a few tweaks rather than editing
     every node's placeholder name by hand. Both share only the mechanical
     ref-addressed-DAG → `GraphSaveData` assembly step (layered layout +
     node/edge construction) in `src/data/graphAssembly.ts`. The item
     picker ("Pick Item ID" button in `PropertyPanel`, on `ItemId`/
     `ItemType` fields) needs a display-name → item-id list (players see
     "Iron Ore" in-game, never the `MyObjectBuilder_Ore/Iron`-shaped id the
     property actually takes), hand-built in `src/data/inventoryItems.ts`
     from public SE block/item-definition references (ores/ingots/base
     components/bottles/consumables — the categories most stable across
     game updates) since there's no `ConveyorSorterItems.json`-equivalent
     in hand to reuse verbatim; the field stays free text underneath so
     modded items (which reuse the same `TypeId/SubtypeId` shape — see
     `GetItemAmount` in `src/lib/codegen/helpers.ts`) can still be typed by
     id. (Node pack import/management UI, previously also slated for 7.1,
     was dropped — see "Data layer" above.)
   - 7.2. **Cleaned-up native node catalog + `.segraph` import** — see
     "Native catalog cleanup" below. Ships a de-duplicated node set (one
     `SetEnabled`-style node per behavior instead of one per block-type
     ActionType, `Above|Below`-style combos instead of paired nodes, a
     general-purpose `Number Compare` with a full operator set) as the
     app's own format, plus an importer that reads a legacy
     Scriptilyx SE `.segraph` and remaps it onto the new catalog — mostly
     a 1:1 id/property relabel, with true graph-rewrites (inserting
     nodes/wires) reserved for the rare legacy node with no merged
     equivalent left in the cleaned catalog.
   - 7.3. **`.segraph` export (legacy-compatible)** — round-trip a graph
     built on the cleaned-up catalog back out to a file the original
     desktop app can open. Likely lossy/best-effort for nodes that
     collapsed many-to-one on import (e.g. which block-type flavor of
     `SetEnabled` to re-emit) — **may end up documented-but-not-shipped**
     rather than implemented; write up the mapping and its gaps either
     way so the decision is captured even if this sub-milestone stops at
     the design doc.

### Native catalog cleanup (context for 7.2/7.3)

`NodeLibrary.json` is ChaosVROne's own published data, reused verbatim
(credited in `src/data/README.md`); the fragmentation below is inherited
from it, not introduced by this project. Decisions on **how** to fix it are
being made now so the design doc in 7.2 doesn't drift from what actually
shipped in Milestone 2's data layer:

- **Cross-category duplication** ✅ done — `SetBlockEnabled`,
  `SetSensorEnabled`, `SetHingeEnabled`, `SetRotorEnabled`,
  `SetMergeBlockEnabled`, and 9 other `*Enabled`/boolean-toggle
  `ActionType`s already compiled to identical code across their on/off
  preset pairs; each pair is now one node with an `Enabled`/`Locked` combo
  (kept per-context, e.g. `Light Enabled` vs `Thruster Enabled`, for
  palette discoverability — not collapsed across contexts). AI-Block and
  Event-Controller presets (which already had a generic combo node
  alongside their on/off pairs) had the presets deleted outright rather
  than re-merged. The same duplication also turned up in the Wheel
  category outside the `*Enabled` naming pattern — `Wheel Propulsion/
  Steering/Brake/Invert Steering/Invert Propulsion On`+`Off` are
  `SetTerminalBool` presets differing only in their `PropertyId`/`Value`
  defaults, exactly like `SetBlockEnabled`'s pairs — merged those 5 pairs
  the same way. The other ~23 Wheel presets (`Wheel Set Power`/`Friction`/
  etc., and the 3-way Override presets) are each a genuinely different
  terminal property, not duplicates, so those were left alone. See the
  Status section above for the running catalog count.
- **Missing comparison operators** ✅ done — added a general `Number
  Compare` node (`ActionType: NumberCompare`) with a full operator combo
  (`>`, `<`, `>=`, `<=`, `==`, `!=`); `If Number Greater/Less Than` are
  untouched (existing graphs keep working) rather than replaced.
- **Above/Below pairs** ✅ done — Battery, Gas Tank, Cargo, Room Oxygen,
  Ship Speed, Jump Drive Charge, and Piston Position each shipped as two
  nodes differing only in comparison direction, fragmented across three
  different codegen dispatch mechanisms (plain `ActionType` emitters,
  `ExtendedBuiltin` id-keyed emitters, one-off `ActionType`s like
  `CargoPercentBelow`/`BatteryBelow`). Unified onto 7 new dedicated
  `ActionType`s (`BatteryThreshold`, `GasTankThreshold`,
  `RoomOxygenThreshold`, `CargoThreshold`, `ShipSpeedThreshold`,
  `JumpDriveChargeThreshold`, `PistonPositionThreshold`), each using the
  new `blockThresholdCondition` factory (`factories.ts`/`emitters.ts`)
  that reads a `Direction: Above|Below` combo property instead of baking
  the operator into a separate node.
- **Preset-only duplicates** ✅ done — `Button Command: dock/mine/startup`
  deleted; their `Argument` values are preserved by the legacy importer as
  property overrides onto the plain `Button Command` node.
- **Fused vs. composable duplication**: some measurements (e.g. battery
  charge) ship both as a fused check (now `Battery Threshold`, after the
  Above/Below merge above) *and* as a composable primitive (`Get Battery
  Charge %` + a comparison) that does the same thing. Keep the fused,
  single-node form as the canonical path for simple threshold checks — one
  node beats two wired together for the common case — and keep `Get X %`
  around only for cases that need the raw value for something else (LCD
  display, custom math). Importing a legacy fused-check node is then a
  1:1 relabel onto the merged node, not a graph rewrite; a rewrite is
  only needed for legacy nodes that have no fused equivalent at all in
  the cleaned catalog. Not revisited further this pass — already true of
  the current catalog, nothing left to merge here.

### Property-as-input

Raised while working 7.2: a `NodeDefinition` property (e.g.
`SetBlockEnabled`'s `Enabled`) used to be a literal baked in at
graph-design time only — no way to wire it from something computed
elsewhere in the graph (a variable, a check's result, the PB argument).
Two ways to get there, different cost:

- **Interpolated property values** ✅ shipped — properties stay plain
  strings, but `resolvableBool`/`resolvableNumber` (`factories.ts`)
  recognize a whole-value `{name}`/`{bool:name}`/`{num:name}` reference
  (reusing the interpolation syntax Echo/LCD-text already had for
  mid-string references) and emit `GetBool(...)`/`GetNum(...)` instead of
  a literal. No new port/edge concept, no store changes — just this check
  ahead of literal-izing a value, plus a `{ }`/`Fixed` toggle button in
  `PropertyPanel` next to combo/bool fields (which are otherwise a fixed
  `<select>` with no room to type a reference). Small, shipped fast, but
  it's a convention layered on strings rather than a first-class graph
  connection — React Flow doesn't draw a wire for the dependency, and a
  node can only take **one** such reference per property (whatever fits in
  that one string field).
- **Data ports** — not started; the follow-up if interpolation turns out
  to be limiting. Add a second port kind beyond today's pure control-flow
  `Handle`s (`Next`/`True`/`False`/`In`), so e.g. `SetBlockEnabled` gets a
  `Value` input handle wireable from a `Get Bool Variable` node's output —
  and unlike a single interpolated string, a node can expose **as many
  data-input handles as it has properties**, each wired independently (a
  node needing three inputs, e.g. a fused `Number Compare`-style node fed
  by three different variables, isn't expressible with interpolation
  alone). Correct long-term shape (matches how most node-graph tools do
  this) but a large change: React Flow node component needs a second
  handle type, `NodeConnection`/the store need to distinguish control vs.
  data edges, codegen needs to resolve a data edge to an expression
  instead of a statement, and validation needs new rules (data ports must
  resolve to exactly one source, no cycles). Not mutually exclusive with
  interpolation — the `{name}` syntax could stay as what an eventual data
  port's codegen resolves to internally, or as the escape hatch for nodes
  that don't warrant a dedicated port.

### If-node consolidation: audit + merge (True/False, Above/Below pairs)

Prompted by a direct question about whether the 76-ish "✅ Checks"-category
nodes (plus scattered `If...Above/Below`/`...True/False` pairs in other
categories) still had unmerged duplicate-pair debt after the earlier
Above/Below passes. A full sweep (every node whose Title ends in
`Above`/`Below`/`True`/`False`, checked for a same-shape sibling with the
opposite suffix) turned up 8 more pairs, all merged the same way as the
earlier Above/Below work — a `Direction: Above|Below` or `Value: True|False`
combo replacing two nodes:

- **Terminal-property checks** (AI Block, Event Controller, and the
  generic "Any" nodes each had their own True/False + Above/Below pairs,
  since all three reuse the same `GetValue<T>` terminal-property shape):
  `If AI/Event Controller/Any Bool Property` (was `*BoolTrue`/`*BoolFalse`)
  and `If AI/Event Controller/Any Float Property` (was `*FloatAbove`/
  `*FloatBelow`) — 6 pairs → 6 nodes, via two new shared factories
  (`terminalBoolPropertyCondition`/`terminalFloatThresholdCondition` in
  `factories.ts`, mirrored in `emitters.ts`'s local copy for the AI/Event
  Controller entries, matching the existing duplication convention between
  those two files).
- **Rotor RPM/Angle, Hinge Angle** thresholds — `Rotor RPM Threshold`,
  `Rotor Angle Threshold`, `Hinge Angle Threshold` replace their Above/
  Below pairs via the existing `blockThresholdCondition` factory (same one
  the original 7 Above/Below merges used).
- **If Bool Variable** — `ext.bool.if_true`/`ext.bool.if_false` (checks a
  *variable*, not a terminal property — different emitter shape from the
  above) merged into one node with a `Value: True|False` combo.

285 catalog nodes (was 295). The sweep found no more True/False or
Above/Below duplicate pairs. (Deliberately *not* touched: state-named
pairs like `If Piston Fully Extended`/`Retracted` or `If Air Vent
Pressurized`/`Depressurized` — those aren't simple direction/boolean flips
of the same measurement the way Above/Below pairs are, so a generalized
merge there would be a `Door State`-style named-state combo, a different
and separate design question from what was asked here.)

A follow-up question ("isn't `If [block type] Enabled/Working` the same
as `If Block Enabled/Working`?") caught a related but different
duplication the Above/Below sweep didn't check for: **identical emitters
under different names**, not same-shape opposite-direction pairs.
`IfAiBlockEnabled`/`IfEventControllerEnabled` and `ext.timer.if_enabled`
all called the exact same `blockCondition('IMyFunctionalBlock', v =>
`${v}.Enabled`)` as `If Block Enabled` — same for `*Working` and
`isWorkingCondition()`. Confirmed by grepping every `blockCondition`/
`isWorkingCondition` call site for duplicate arguments rather than by
title pattern. Deleted `If AI/Event Controller Block Enabled/Working` and
`If Timer Enabled` outright (same treatment as the earlier `Set AI Block
Enabled`-style preset folds — a generic equivalent already existed, so no
merged node needed, just delete + enrich the generic one's `Search` +
legacy remap). Also let `isWorkingCondition` itself be deleted from
`emitters.ts` as dead code once nothing called it anymore. 280 catalog
nodes now. Worth flagging as a **different kind of check** to keep running
periodically as the catalog evolves — the Above/Below sweep (same title,
opposite suffix) wouldn't have caught this, since `If AI Block Enabled`
and `If Block Enabled` don't share a title pattern at all, only an
identical emitter call.

### Property library for Get/Set-Property nodes (documented, not started)

Raised as real friction: `Set Any Bool/Float/Int/Text Property` and the AI
Block/Event Controller property nodes all take a free-text `PropertyId`
with zero autocomplete or validation — a user has to already know the
exact terminal property id (`"HasTarget"`, `"IsTriggered"`, ...) for the
specific block type they're targeting, with no in-app reference. Asked
whether the property's *type* could at least be inferred from a library —
answer: only if that library exists as structured data, which it currently
doesn't anywhere in this repo.

The path: `docs/codegen-api-notes.md` already cites two public API
reference sources used while building the `ExtendedBuiltin` emitters —
https://malforge.github.io/spaceengineers/pbapi/ (third-party, reportedly
more complete than the official docs for some blocks) and
https://keensoftwarehouse.github.io/SpaceEngineersModAPI/ (official). A
future `src/data/terminalProperties.json` sourced from those two
(interface → `{ PropertyId: "bool"|"float"|"long"|"string" }`, in the same
spirit as `nodeLibrary.json` — factual signature data, not copied prose) is
what an autocomplete/type-check would key off. Once that data exists:
- **PropertyPanel** could offer a `<datalist>`/autocomplete on `PropertyId`
  scoped to the node's target interface (would need each `Set/Get Any *
  Property` node to declare which interface it targets, e.g. via a new
  `NodeDefinition` field or a small id→interface lookup next to the JSON).
  - **Type inference** (the second half of the question) becomes possible
  once the library exists: look up `PropertyId` in the per-interface map
  and either warn if the node's own type (`SetTerminalBool` vs
  `SetTerminalFloat`) doesn't match, or — further out — collapse the four
  typed `Set Any * Property` nodes into one that infers `T` from the
  chosen `PropertyId` instead of needing four separate typed nodes.

Not started — this is a real, scoped data-curation project (going through
two API references block-by-block) before any UI work makes sense.

### Dynamic-output-count Switch node (documented, not started)

Asked how hard a Switch/Match node would be — one where the user picks the
number of output cases in the UI (not the compiled code; codegen already
handles however many ports a node instance ends up with). More tractable
than it sounds, because two of the three needed pieces already exist:

- `ScriptGraphNode` (`src/components/ScriptGraphNode.tsx`) already renders
  `scriptNode.OutputPorts` — the **per-instance** array — not
  `definition.OutputPorts`, so the canvas already supports a node whose
  port count differs from its catalog definition's.
- `Command Router`/`Number Greater Router` already prove the codegen
  pattern: loop over however many output ports exist, one `Property` per
  port (`StartupArgument`, `Threshold2`, ...), emit one case/comparison
  per port. A dynamic Switch's emitter is the same loop, just not
  hardcoded to a fixed port list.

What's actually missing: **nothing today lets a user add/remove ports on
an existing node instance** — `ScriptNode.OutputPorts` is copied once from
`NodeDefinition.OutputPorts` at add-time and never mutated afterward. That
needs:
1. A store action (`addOutputPort`/`removeOutputPort`, or a single
   `setOutputPorts`) mutating both `OutputPorts` and the corresponding
   per-case `Properties` entries on one `ScriptNode`.
2. A "manage cases" control in `PropertyPanel` for this node specifically
   — +/− buttons, each case getting a match-value field — plus a
   match-mode choice (equals/dictionary dispatch vs. an if/else-if chain,
   which differ slightly in emitted code: a `switch` needs distinct
   constant case values, an if/else-if chain doesn't).
3. A new emitter that reads however many `Case<N>Value` properties exist
   (mirroring `Command Router`'s pattern) and emits the chosen
   dispatch shape.

Estimate: comparable in size to the Number Math/Number Compare work in
this same milestone — one clearly-scoped new feature, not a
foundational change, since the rendering and codegen precedents already
exist. Not started.

## Workflow

One branch + one PR per milestone, merged into `main` before the next
starts. `main` stays deployable at every merge (GitHub Actions deploys to
Pages on every push to `main`).

## Verification

- `npm run dev` locally after each milestone; build a small graph
  (Start → a couple of action nodes → branch) and confirm generated script
  text is syntactically sane C# matching the SE Programmable Block API
  shape (constructor, `Main(argument, updateSource)`).
- Load an existing `.segraph`/example project (if available) to confirm
  save-file compatibility.
- Push and confirm the GitHub Actions workflow deploys and the Pages URL
  serves the app.
- Unit tests for the codegen module (pure functions) as it's built — the
  highest-risk-of-subtle-bugs piece.
