# Scriptilyx Web — Implementation Plan

> Working plan for this project, kept in sync as milestones land. See
> `CLAUDE.md` at the repo root for the condensed, load-bearing constraints.

## Status

**Milestone 7.2 in progress.** Landed so far: merged 22 redundant on/off
preset pairs (`SetBlockEnabled`, `SetGroupEnabled`, `SetRotorEnabled`, etc.)
into single `Enabled`-combo nodes, folded the AI-Block/Event-Controller/
Button-Command presets into their existing generic equivalents, added a
general-purpose `Number Compare` node (`>`, `<`, `>=`, `<=`, `==`, `!=`),
and merged the 7 **Above/Below threshold pairs** (Battery, Gas Tank, Cargo,
Room Oxygen, Ship Speed, Jump Drive Charge, Piston Position) into single
`Direction`-combo (`Above`/`Below`) nodes via a new `blockThresholdCondition`
emitter factory — each family previously dispatched through a different
codegen path (plain `ActionType`, `ExtendedBuiltin` id-keyed, or a one-off
`ActionType` like `BatteryBelow`/`CargoPercentBelow`), now unified onto 7
new dedicated `ActionType`s (`BatteryThreshold`, `GasTankThreshold`, etc.).
Also investigated the **Set-\[Type\]-Property family**
(`SetTerminalBool`/`SetTerminalFloat`, ~28 Wheel-specific presets): most of
it (Float presets like `Wheel Set Power`/`Wheel Set Friction`, and the
3-way Override presets) turned out to be genuinely distinct — each targets
a different terminal property or has more than two states, so they're
convenience shortcuts, not duplicates. But 5 of the Bool presets
(`Wheel Propulsion/Steering/Brake/Invert Steering/Invert Propulsion
On`+`Off`) *were* the exact same on/off-pair duplication as the Enabled
family — merged those too. Catalog: 346 → 298 node definitions.

A `remapLegacyGraph()` importer (`src/lib/legacyImport.ts`, table-driven
from `src/data/legacyNodeRemap.ts`, 83 entries) rewrites any retired id
onto its replacement — wired into both Open (`Toolbar.tsx`) and autosave
restore (`graphStore.ts`) — so old `.segraph` files (including real
desktop-app exports) keep working. Verified in-browser after each merge
pass: a retired-id `.segraph` opens with a working, correctly-wired
replacement node and generates correct code.

Still open within 7.2: whether node properties (e.g. `SetBlockEnabled`'s
`Enabled`) should be settable from a wired input instead of only a
literal/combo default — see "Property-as-input" design note below; this is
an architecture decision, not yet started.

- [x] Milestone 1 — Repo/pipeline skeleton (merged in #1)
- [x] Milestone 2 — Data layer (merged in #2)
- [x] Milestone 3 — Canvas (merged in #3)
- [x] Milestone 4 — Codegen (merged in #4)
- [x] Milestone 5 — Minify (merged in #5)
- [x] Milestone 6 — Persistence (merged in #6)
- [ ] Milestone 7.1 — Stretch: node packs, wizards
- [ ] Milestone 7.2 — Stretch: cleaned-up native node catalog + `.segraph`
      import (in progress — preset-pair + Above/Below merges and the
      importer are done; property-as-input is still a design question)
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
- Node packs and the conveyor sorter item database: types ported now, full
  install/manage UI deferred to the stretch milestone.

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
   - 7.1. **Node pack import/management UI, conveyor sorter item picker,
     Beginner/Advanced/Unified "wizard" scenario templates** (pre-built
     graphs — portable as data once the core editor works).
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

### Property-as-input (design note, not started)

Raised while working 7.2: right now every `NodeDefinition` property (e.g.
`SetBlockEnabled`'s `Enabled`) is a literal baked in at graph-design time —
there's no way to wire it from something computed elsewhere in the graph
(a variable, a check's result, the PB argument). Two ways to get there,
different cost:

- **Data ports** — add a second port kind beyond today's pure
  control-flow `Handle`s (`Next`/`True`/`False`/`In`), so e.g.
  `SetBlockEnabled` gets a `Value` input handle wireable from a
  `Get Bool Variable` node's output. Correct long-term shape (matches how
  most node-graph tools do this) but a large change: React Flow node
  component needs a second handle type, `NodeConnection`/the store need to
  distinguish control vs. data edges, codegen needs to resolve a data edge
  to an expression instead of a statement, and validation needs new rules
  (data ports must resolve to exactly one source, no cycles).
- **Interpolated property values** — keep properties as plain strings, but
  let codegen recognize a reference syntax (e.g. `$myBoolVar`) in any
  property value and emit `GetBool("myBoolVar")`/`GetNum(...)`/
  `GetText(...)` instead of a literal. No new port/edge concept, no store
  changes — just a codegen-side check in `prop()`/the emitters before they
  literal-ize a value, plus a small UI affordance in `PropertyPanel` (a
  "use variable" toggle next to the literal input). Much smaller, but it's
  a convention layered on strings rather than a first-class graph
  connection, so React Flow won't visually show the dependency as a wire.

Recommendation: interpolated values first (small, low-risk, ships fast);
data ports are the "if this turns out to matter a lot" upgrade later,
since they're not mutually exclusive — the interpolation syntax could
even be what an eventual data-port's codegen resolves to internally. Not
started — needs a decision before either is built.

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
