# CLAUDE.md

WireRig: a browser-based node-graph editor for building Space Engineers
programmable-block scripts. React + TypeScript + React Flow, static site,
deployed to GitHub Pages. No backend.

Full plan and rationale: `docs/PLAN.md`. Keep it updated as milestones land
— it's the source of truth for scope and design decisions, not this file.

## Hard constraints

- **Never copy, port, or reference the original Scriptilyx SE desktop
  app's source code.** We are not the original author and not authorized
  by them; that app ships no source/LICENSE. Any reference material used
  to understand the original app's behavior lives outside this repo and
  must never be read into a commit, comment, or generated file here. The
  codegen engine is a clean-room design against the public SE Programmable
  Block API and the node data's own `Title`/`Description`/`Preview`
  fields — see `docs/PLAN.md` → "IP handling" and "Codegen engine" for
  what that means in practice.
- `NodeLibrary.json` / `ConveyorSorterItems.json` / node-pack JSON *are*
  fine to reuse verbatim (they're public data, not source) — keep the
  credit/attribution header on them and in the README.
- No backend. If a feature seems to need one, that's a signal to redesign
  it client-side, not add a server.

## Workflow

- One branch + one PR per milestone; merge into `main` before starting the
  next. `main` must stay deployable — GitHub Actions deploys to Pages on
  every push to `main`.
- Keep CI current: Node version and GitHub Action versions should track
  actual current majors/LTS (check via `gh api repos/<owner>/<repo>/
  releases/latest`, not assumption) — don't let them go stale.

## Dev environment notes

- This sandbox has no Google Chrome; the `chrome-devtools-mcp` plugin's
  default MCP server won't launch. Use the user-scoped
  `chrome-devtools-chromium` MCP server instead (already registered via
  `claude mcp add-json ... -s user`, points `--executablePath` at
  `/usr/bin/chromium`) for any browser-driven verification.

## Commands

```
npm run dev      # local dev server
npm run build     # tsc -b && vite build
npm run preview   # serve the production build locally
```
