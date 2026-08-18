# Stationeers IC10 — codegen reference notes

Working notes gathered while implementing `src/games/ic10/codegen/generate.ts` and `src/games/ic10/nodeLibrary.ts`. This is our own summary of publicly documented instruction-set/behavior facts (the kind of thing any programmer would note while reading IC10 docs) — not a copy of any wiki's prose, and not derived from any third-party tool's source. See `CLAUDE.md` → "Hard constraints" for why that distinction matters here; the Space Engineers equivalent of this file is `docs/space-engineers-codegen-api-notes.md`.

Sources: the Stationeers Community Wiki's IC10 and IC10/instructions pages (https://stationeers-wiki.com/IC10, https://stationeers-wiki.com/IC10/instructions), its Advanced IC10 Programming page, and a beginner's-guide writeup at https://xgamingserver.com/blog/stationeers-ic10-programming-guide/ — cross-referenced against each other for the facts below.

For the full 154-instruction catalog expansion, also cross-checked against the `@stationeers-ic/ic10` npm package (v0.3.7) — the shared engine behind the "Stationeers IC10" VS Code extension (marketplace: Traineratwot.stationeers-ic10, source: github.com/Stationeers-ic/vscode-ic10), ic10.dev, and ic10emu.dev. That package is **AGPLv3-licensed** (not "public game data" the way `NodeLibrary.json` or the wiki tables are) — its own code/data files (`Defines/instructions.js`, `Defines/devices.js`, etc.) were read only as a fact-reference to verify instruction names/syntax exist (the same way a wiki page is read), the same way `docs/space-engineers-codegen-api-notes.md` reads Keen's own XML docs — never copied in. Every node/emitter here is hand-authored from those verified facts, not derived from that package's file structure, comments, or code shape.

## Device/LogicType data (`src/games/ic10/deviceLogicTypes.json`/`.ts`)

145 devices/structures and their IC10 logic parameters (1546 name/type/R-W-access rows) compiled from stationeers-wiki.com's per-device pages (Active Vent, Furnace, Solar Panel, ...). The site sits behind a Cloudflare Turnstile bot challenge that blocks both this tool's own fetch capability and an automated browser, so this data was gathered through a real browser session (outside this repo's tooling) and handed in as a markdown export, then parsed into `deviceLogicTypes.json`. This is factual per-device data (field names, value types, read/write access) in the same low-creative-expression spirit as `NodeLibrary.json`'s reuse for Space Engineers — see "IP handling" in `docs/PLAN.md`. Licensing note: stationeers-wiki.com's own footer/license terms weren't independently confirmed (couldn't load the site directly to check) — community wikis on this hosting pattern (wiki.gg/MediaWiki-style) are conventionally CC BY-SA, and attribution is given here and in the data file's own header comment on that assumption; revisit if the site's actual terms turn out to differ.

This data is **UI-only** — it powers a `LogicType` suggestion picker (mirroring Space Engineers' `ItemId` `ItemPicker`, see `src/games/ic10/nodeLibrary.ts`'s new `DeviceType` property and `src/components/PropertyPanel.tsx`'s `logicTypeFieldAccess`) and never reaches codegen. `generate.ts` still only ever reads a node's `Device`/`LogicType` properties verbatim, exactly as before — `DeviceType` is a hint for narrowing suggestions, not something the compiled `l`/`s` instruction knows about, since the graph has no way to know what's actually plugged into a given IC housing pin at runtime.

11 of the 145 devices (e.g. `Autolathe`, the `Logic I/O` batch-reader/-writer family) have no documented logic parameters on their wiki page — `logicTypeNamesFor` correctly returns an empty suggestion list for those rather than guessing.

## Program size and execution model

- **Static size cap**: 128 lines maximum, 90 characters per line maximum. This is a hard limit on what fits in the in-game IC10 editor — exceeding it means the script can't be pasted in at all, not just a performance concern. `generateScript` checks both and returns a warning (surfaced in `ScriptPreview` via `Game.lineLimit`) rather than silently truncating.
- **Runtime model**: the chip's instruction pointer persists across game ticks — it does *not* restart from line 0 every tick the way Space Engineers' `Main()` is re-invoked each tick. Execution just continues from wherever it stopped: either at a `sleep`/`yield` instruction, or after executing up to 128 instructions in one tick (an unrelated budget from the 128-line static cap — this one throttles *execution*, not *program length*), at which point it auto-pauses for one tick and resumes next tick from that exact point.
- Practical effect on our codegen: because the pointer just continues, a program with no `sleep`/`yield` anywhere doesn't hang — the engine's own per-tick instruction budget throttles it automatically — but it does mean "every branch always ends in an explicit jump" is the only safe way to compile a graph with no implicit fallthrough-to-next-line assumption, since nothing here resembles a call stack that returns anywhere.

## Registers, devices, and labels

- 16 general-purpose registers, `r0`-`r15`, plus two reserved special registers: `sp` (stack pointer) and `ra` (return address, set by `jal`). Our register allocator (`allocateRegisters` in `generate.ts`) only ever assigns `r0`-`r15`, in first-declared order among reachable nodes, and warns if a graph declares more than 16 distinct variable names — the 17th onward simply won't get an alias.
- Device pins are `d0`-`d5` (six physical connector slots on the IC housing) plus `db` (the housing's own logic-type reads, e.g. reading the IC housing's own `On`/`Setting`). These are fixed slots, not player-named — unlike Space Engineers' `BlockName` free-text field, there's no name to type; the `Device` property on our Read/Write nodes is a closed combo over exactly these seven values.
- **Labels are a real, natively-supported feature** — not just an external-tool convenience. Wherever an instruction expects a jump target, you can write a label name instead of a raw line number, and the in-game assembler resolves it. This is why our codegen emits `L<Number>:` labels per node and `j L<target>` jumps rather than trying to precompute absolute line numbers ourselves — much simpler and exactly mirrors how real IC10 scripts are written by hand.
- **`alias`** assigns a readable name to a register (`alias temp r0`) or a device pin. We use this for every declared variable name so the emitted code reads `l temp d0 Temperature` instead of `l r0 d0 Temperature` — readability parity with how a human would write it, and with how Space Engineers' generated method/variable names aim to stay readable.
- One label-naming pitfall documented on the wiki: naming a label (or, by extension, an alias) after an IC10 keyword — a LogicType name like `Temperature` or `Setting`, say — silently overwrites that keyword's meaning from that point on. Our codegen doesn't defend against this (no exhaustive LogicType keyword list exists to check against — see above); it's called out here and would be a reasonable thing to add narrow validation for later if it turns out to bite real users (e.g. warn if a declared variable name case-insensitively matches a LogicType typed into a `LogicType` field elsewhere in the same graph).

## Instruction coverage (all 154 instructions, reconciled)

35 nodes across `Control`/`Devices`/`Batch Devices`/`Slots`/`Variables`/`Checks`/`Stack`. Two nodes (`Number Math`, `Compare`) fold entire instruction *families* into one `Operator` combo each — the same "one generic-operator node" shape as Space Engineers' `Number Math`/`Number Compare` — so 35 nodes reach far more than 35 instructions. Every one of IC10's 154 instructions is accounted for below as either directly covered, covered-but-optimized-away, reachable-but-not-literally-emitted, or a documented, deliberate exclusion.

**`ic10.var.math` (Number Math) — 50 instructions, one `Operator` combo:**
`abs acos add and asin atan atan2 ceil clamp cos div exp ext floor ins lerp log max min mod mul nor not or pow rand rol ror round sap seq sge sgn sgt sin sla sle sll slt sna snan snanz sne sqrt sra srl sub tan trunc xor`

Not auto-optimized: the "z" zero-compare variants of the `s`-prefixed set-instructions (`sapz seqz sgez sgtz slez sltz snaz snez`, 8 instructions) — `Number Math` always emits the full 2/3-operand form (e.g. `seq r a 0` rather than `seqz r a`). Functionally identical, one instruction longer; `Compare` *does* get this optimization (below) since branches are the hot path. Revisit if line-budget pressure makes this worth adding.

**`ic10.compare` (Compare) — 33 instructions, one `Operator` combo + two auto-optimizations:**
Base: `beq bne blt ble bgt bge` (also reachable via `ApproxEqual`/`NotApproxEqual` → `bap`/`bna`, and `IsNaN` → `bnan`). `generateScript` automatically switches to the shorter **zero-compare** mnemonic (append `z`) when Value B is literally `"0"`, and to the **call-and-link** mnemonic (append `al`) when `CallOnTrue` is checked — both append cleanly onto the base name, matching IC10's real naming (`beq`+`z`+`al` = `beqzal`, a real instruction) so no separate lookup table is needed per variant: `beq bne blt ble bgt bge beqz bnez bltz blez bgtz bgez beqal bneal bltal bleal bgtal bgeal beqzal bnezal bltzal blezal bgtzal bgezal bap bapz bapal bapzal bna bnaz bnaal bnazal bnan`.

**Devices, batch devices, slots, reagents — 19 instructions:**
`l s ld sd lb sb lbn sbn lbs lbns sbs ls ss lr rmap select move j` (the last two: `move` is `ic10.var.set`; `j` is the default Next-port jump emitted by every node with no explicit branch, so it's not tied to one node in particular) — plus `jal` (`ic10.call_subroutine`).

**Device presence/validity — 5 instructions:**
`bdse bdseal sdse bdnvl bdnvs` (`ic10.device.if_connected`, `ic10.device.connected_value`, `ic10.device.check_logic_type`). `bdns`/`bdnsal`/`sdns` ("branch/set if device is *not* set") are **capability-covered but not literally emitted** — wire `If Device Connected`'s False output for the "not set" case instead of a separate node; no functional gap, just not a 1:1 mnemonic match.

**Stack — 10 instructions:**
`push pop peek poke get getd put putd clr clrd` (`ic10.stack.*`, one node each).

**Sleep/pacing — 2 instructions:** `sleep yield` (already in the original 9-node catalog).

Sum: 50 + 33 + 19 + 5 + 10 + 2 = **119 instructions directly covered**, + 3 reachable-but-not-literal (`bdns`/`bdnsal`/`sdns`) + 8 not-auto-optimized (`s*z` family) = **130 reachable**.

### Deliberately not implemented (24 instructions)

- **All 19 relative-branch instructions** (`brap brapz brdns brdse breq breqz brge brgez brgt brgtz brle brlez brlt brltz brna brnan brnaz brne brnez`) **and `jr`** (relative jump) — relative addressing exists in hand-written IC10 for position-independent tricks, but since every jump target in our generated code is a label (see "Labels" below), the absolute forms already cover every case a generated script needs; a relative form would only ever save characters we don't need to save. Revisit only if line-length becomes the binding constraint on some future graph.
- **`alias`, `define`, `label`** — `alias` is used internally by `generate.ts` for every declared variable (not exposed as a node — there's nothing for a node to *do* with it beyond what `Number Math`'s `Name` field already provides); `define` is redundant with how we already inline literal values directly into properties; `label` is marked `DEPRECATED` in IC10's own instruction data.
- **`hcf`** ("halt and catch fire") — destructive, real in-game consequences for the chip. Not a good fit for a node a user could wire in by accident.
