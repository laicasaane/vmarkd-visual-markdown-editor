# Task 54 — Marketplace onboarding (editorAssociations docs + walkthrough)

**Status:** planned (do near a Marketplace release)

## Problem

First-run / discovery polish is missing. The custom editor is registered with
`priority: "option"` (deliberately NOT forcing itself as the default `*.md` editor),
but nothing tells the user how to make it default, and there's no getting-started
surface after install. Both hurt the Marketplace first impression.

## Scope

### Part A — README: set VMDE as the default `*.md` editor (docs only)
- Add a short README section explaining that VMDE opens via right-click / "Open
  With…" by design (`priority: "option"`), and how to make it the default:
  - `workbench.editorAssociations`: `{ "*.md": "vmde.editor" }` (and `*.markdown`).
  - Or via UI: open a `.md` → "Open With…" → "Configure default editor for *.md".
- Note the trade-off (it then shadows the built-in Markdown preview / text editor;
  users can still "Open With…" the text editor — `Ctrl+Alt+E` reveals source).
- Pure docs; no code.

### Part B — `contributes.walkthroughs` getting-started
- One walkthrough `vmde.gettingStarted` with a few steps, each a short markdown
  file under `media/walkthrough/` + optional image/gif:
  1. **Open the visual editor** — right-click a `.md` → Open with VMDE (button:
     run `vmde.openEditor`). Mention "Open to the side" (`vmde.openInSplit`).
  2. **Switch to source & back** — `Ctrl+Alt+E` / the title-bar buttons
     (`vmde.openTextEditor` / `vmde.openSourceToSide`); reveal-in-source.
  3. **Make it your default** — link Part A's `editorAssociations` (button: open
     settings to `workbench.editorAssociations`).
  4. **Tune it** — point at key settings: `theme.*`, `editor.toolbar`, `outline.*`,
     `advanced.instantPreview`, `css.custom` (button: `vmde.openSettings`).
  - Use `completionEvents` (e.g. `onCommand:vmde.openEditor`,
    `onSettingChanged:vmde.*`) so steps auto-check as the user does them.

### Part C — `welcome.md` live showcase: the first 5 minutes (added 2026-07-04, 192 §14 follow-up)

The gap Parts A/B don't cover: **we ship 18 render engines and at install time nobody
knows** (README names ~6 — task 226's finding). Reading about features ≠ experiencing
them; the tour must be a real document rendering LIVE in the editor the user just
installed. This is in-product marketing, not a feature.

- [ ] A curated showcase doc — `media/walkthrough/welcome.md` — one short captioned
      section per wow: mermaid (incl. gantt/timeline for the PM crowd), d2, PlantUML C4
      (task 136 just shipped the stdlib!), echarts, STL 3D (spin it!), smiles chemistry +
      `$\ce{H2O}$` mhchem, KaTeX, geojson map, wavedrom, callouts, wiki chips, the table
      panel, Ctrl+zoom on a markmap. **Seed from `test/vscode-e2e/fixtures/all-renderers.md`**
      — it already exercises every engine; this is its user-facing, captioned cousin.
- [ ] Command `vmde.openWelcome` (palette-visible): opens a COPY (untitled or temp) in
      `vmde.editor`, so the user can type/play without dirtying the bundled file —
      playing IS the tour.
- [ ] First-run hook: on first activation (`globalState` flag) a single non-modal toast
      "Take the 2-minute live tour?" → `openWelcome`. Never repeats; setting to disable.
      Walkthrough step 1 gains an "Open the live tour" button (same command).
- [ ] Drift guard: extend 226's planned doc-sync test so every `engine-registry.ts` lang
      appears in welcome.md — a new engine can't ship invisible again.
- [ ] Verification: L3 e2e — `openWelcome` opens in the custom editor and N engines
      render (reuse the custom-diagrams-render assertions against the welcome fixture);
      first-activation toast flag set/cleared correctly (host unit on the vscode-mock).

## Out of scope

- Video/GIF production (placeholders/screenshots first; richer media later).
- Telemetry on walkthrough completion (separate, see task 31 opt-in telemetry).

## Notes

- Walkthrough step buttons reference the existing (now `vmde.*`) command IDs —
  keep them in sync if commands are renamed again.
- Markdown step files can themselves be opened in VMDE → nice dogfooding demo.
- This is release polish; sequence it just before publishing, not mid-refactor.

## Verification

- `package.json` valid; `manifest.test.ts` extended to assert the `walkthroughs`
  contribution (id + step count) so it doesn't silently rot.
- Manual: Help → Welcome / "Get Started with VMDE" shows the walkthrough; each
  step's button runs the right command / opens the right setting.
- `tsc` + `biome` + full vitest green.
