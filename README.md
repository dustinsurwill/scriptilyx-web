# WireRig

**[Live site](https://dustinsurwill.github.io/wirerig/)**

A browser-based, node-graph visual editor for building game-automation scripts. Wire up nodes on a canvas and get a ready-to-paste script for the target game — no manual coding required. Currently supports:

- **Space Engineers** — Programmable Block scripts, generated as C#.
- **Stationeers (IC10)** — IC10 chip scripts, generated as MIPS-like assembly.
- **CC: Tweaked** — ComputerCraft turtle/computer scripts, generated as Lua, with an optional palette toggle for the Advanced Peripherals addon mod's nodes.

Pick a game from the landing page; each one gets its own node catalog, its own canvas, and its own autosave, fully isolated from the others.

Runs entirely client-side (React + TypeScript + React Flow) — no backend, no account, no server-side storage. Projects autosave to your browser and can be exported/imported as save files (`.segraph` for Space Engineers, `.ic10graph` for IC10, `.ccgraph` for CC: Tweaked).

## Credit

- **Space Engineers**: this project is inspired by and reuses the node-database concept and JSON data format (block/action definitions) from **[Scriptilyx SE](https://github.com/ChaosVROne/Scriptilyx-SE)** by **ChaosVROne / Parallel Infinite Worlds Company**, a Windows desktop tool for the same purpose. WireRig is an independent, unaffiliated reimplementation for the browser. If you want the original Windows desktop app, get it from the link above.
- **Stationeers (IC10)**: the node catalog and codegen are original, hand-authored work against IC10's own public instruction-set documentation — see `docs/ic10-api-notes.md` for sources. Device/LogicType reference data is compiled from the Stationeers Community Wiki.
- **CC: Tweaked**: the node catalog and codegen are original, hand-authored work against CC:Tweaked's own public Lua API documentation (tweaked.cc) and, for the optional Advanced Peripherals addon, that mod's own docs (docs.intelligence-modding.de) — see `docs/cc-tweaked-api-notes.md` for sources.

## Development

```
npm install
npm run dev
```

## License

MIT — see [LICENSE](./LICENSE)
