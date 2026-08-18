# WireRig

**[Live site](https://dustinsurwill.github.io/wirerig/)**

A browser-based, node-graph visual editor for building Space Engineers
programmable-block scripts. Wire up nodes on a canvas and get a ready-to-paste
C# script for the in-game Programmable Block.

Runs entirely client-side (React + TypeScript + React Flow) — no backend, no
account, no server-side storage. Projects autosave to your browser and can be
exported/imported as `.segraph` files.

## Credit

This project is inspired by and reuses the node-database concept and JSON
data format (block/action definitions) from **[Scriptilyx SE](https://github.com/ChaosVROne/Scriptilyx-SE)**
by **ChaosVROne / Parallel Infinite Worlds Company**, a Windows desktop tool
for the same purpose. WireRig is an independent, unaffiliated
reimplementation for the browser — it does not include or derive from
Scriptilyx SE's source code. If you want the original Windows desktop app,
get it from the link above.

## Development

```
npm install
npm run dev
```

## License

MIT — see [LICENSE](./LICENSE). This license covers the code in this
repository; it does not apply to the original Scriptilyx SE project linked
above.
