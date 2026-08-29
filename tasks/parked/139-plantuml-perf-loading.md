# Task 139 — PlantUML engine size / first-render latency + loading affordance

> **Status:** ✅ DONE (loading affordance) + 🅿️ **PARKED** (engine size / first-render latency) —
> 2026-07-04. Option 1 (the placeholder) shipped after measuring the real cost. The size/latency
> REDUCTION levers — Option 2 (warm-load) + Option 3 (slimmer engine) — are **parked by decision** (user,
> 2026-07-04): revisit only on a real complaint. Created 2026-06-24; builds on 87.

## Outcome (2026-07-04)

**Measured the real cost first** (real VS Code webview, `performance.now()`, engine served from LOCAL
disk — no network): the FIRST PlantUML block in a session waits **~0.9–1.15s** (two runs: 937ms / 1152ms)
— dominated by parsing/eval of the 6.9MB TeaVM engine (~530–775ms) + TeaVM warm-up & first layout
(~344–397ms); viz-global (~1.4MB) is negligible (~tens of ms). **Every SUBSEQUENT block is ~30–50ms**
(engine warm) — imperceptible. So the pain is real but bounded: one ~1s empty gap per session, on the
first diagram only.

**Shipped Option 1 — loading placeholder.** A compact themed "⟳ Rendering PlantUML…" placeholder
(spinner + engine-named label) shows in the block during that cold load, swapped out atomically when the
SVG lands. New reusable module `media-src/src/diagram-loading.ts` (`diagramLoadingHtml` /
`renderDiagramLoading` / `removeDiagramLoading`), a Lute-safe `data-render="1"` twin of `diagram-error.ts`;
wired into `plantuml-render.ts` (inject before the lazy-load; remove in `themeOnce`); CSS
`.vmde-diagram-loading` in `main.css` (theme-var driven, spinner respects `prefers-reduced-motion`).

- **Caveat (honest):** it replaces a 0-height EMPTY gap with a ~1-line placeholder, so there is still a
  minor reflow when the (larger) SVG swaps in — we can't reserve the diagram's true size ahead of render.
  It's strictly better than before (immediate "it's working" feedback vs. a blank that reads as broken).
- Only meaningfully visible on the cold first render; on warm blocks (~30–50ms) it flashes-and-vanishes.
- The lazy-load gate is untouched — the placeholder lives inside the per-block loop, which only runs when
  a `.language-plantuml` block exists (no engine fetch for plantuml-free docs).

**Tests:** unit `media-src/src/diagram-loading.test.ts` (5 cases, module 100% covered); real-VS-Code e2e
`test/vscode-e2e/plantuml-loading.spec.ts` (in-page observer catches the placeholder on cold load —
spinner + "Rendering PlantUML…" label — then asserts a clean swap: SVG present, zero leftover). All 8
PlantUML e2e specs + full unit (1299) + typecheck + `lint:ci` green.

**Options 2 + 3 — 🅿️ PARKED (decision, user 2026-07-04):** warm-load (prefetch) saves ~1s once per
session — not worth the complexity/risk of speculative fetching; size reduction is upstream-bound
(official TeaVM build, task 137) — low ROI, and can't help math/latex/ditaa anyway (need AWT). The
placeholder is the right-sized fix. Parked — do NOT re-propose unless a real "the ~1s bothers me"
complaint lands.

## Problem
The offline PlantUML engine is large: `plantuml.js` 7.2 MB + shared `viz-global.js` 1.4 MB (~2 MB
gzip). It's lazy-loaded (only when a ` ```plantuml ` block exists), but the **first** PlantUML render
in a session pays the full download + TeaVM warm-up — a noticeable delay — with **no loading
indicator**; the block just sits empty until the SVG appears.

## Options (low-effort → higher)
1. **Loading affordance** — show a lightweight "rendering PlantUML…" placeholder in the block while the
   engine loads/first-renders (the engine is already async). Cheapest UX win.
2. **Warm-load** — kick off the engine fetch as soon as a plantuml block is detected (idle/prefetch),
   so it's ready before the user scrolls to it. Careful: don't fetch 9 MB if the doc has no plantuml
   (already gated) or on every keystroke.
3. **Size reduction** — investigate a slimmer TeaVM build / tree-shaken diagram types (overlaps task
   137). Likely upstream-bound; low ROI.

## Decision gate
Is the first-render delay actually painful in practice? If yes → option 1 (placeholder) is the obvious
small win. Options 2/3 only if it's a real complaint.

## Acceptance / tests
- Option 1: a plantuml block shows a placeholder until its SVG lands; no layout jump when it swaps in.
- Engine still loads only when a plantuml block is present (no regression to the lazy-load gate).

## Related
Task 87 (lazy-load + vendored engine). `patchPlantumlRender` (`addScript`/dynamic `import`) in
`media-src/esbuild-shared.mjs`; `custom-diagrams`/preview render path.
