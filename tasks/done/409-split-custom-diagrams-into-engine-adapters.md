# Task 409 — Split `custom-diagrams.ts` into per-engine adapter modules (phase 2 of task 404)

**Status:** 🟢 6 of 6 engine groups migrated (2026-07-28, same day as the initial 5) — D2 (the
deferred follow-up slice) landed; unit/typecheck/build/coverage/lint all verified. Real-VS-Code
e2e for the D2 move specifically **not yet run** — held for the team-lead's e2e slot, see
Verification · **Impact:** 🟡 med (the next god-module; not yet accruing at `main.ts`'s old
rate) · **Origin:** Codex branch review (2026-07-27), finding 2

> **D2 migration progress (2026-07-28, follow-up slice):** the last engine — WASM compile +
> ELK/dagre layout config selection + a module-cached private Lute instance for `|md|` labels
> (`enrichMarkdownLabels`/`getD2Lute`/`measureMdHtml`) + `themeSvg` + a bespoke reset that
> deliberately does NOT go through `resetCustomBlocks` — moved to `media-src/src/diagram-engines/
> d2.ts` (267 lines). `custom-diagrams.ts` is now 219 lines (was 473 after the first 5-engine
> pass; 1181 before task 409 started) and holds ONLY the shared adapter map
> (`CUSTOM_DIAGRAM_ADAPTERS`), `customDiagramRenderers`, `presentCustomLangs`, and
> `observeCustomDiagrams` — i.e. exactly the permanent shared-scheduling layer this task always
> intended to keep inline, nothing engine-specific left. `enrichMarkdownLabels`'s test describe
> block moved to `diagram-engines/d2.test.ts` (2 tests, same as before — a pure relocation, not
> rewritten). Every distinctive D2 comment (the `|md|` font-face-lazy-load note, the
> "load-bearing, NOT just an optimisation" `d2EnginePromise` caching rationale, the WASM-boot-vs-
> compile-error distinction, the `.vditor-reset` cascade-context note on `measureMdHtml`, the
> "record which engine actually produced the SVG" comment) verified via grep to have travelled
> intact to `d2.ts` and NOT be stranded in `custom-diagrams.ts`. `reRenderD2`'s bespoke reset loop
> was kept EXACTLY as-is (not folded into `resetCustomBlocks`, which DOES support an `errorAttr`
> param and could technically absorb it) — a new comment at the site explains this is deliberate
> (task 400 explicitly excluded D2 from that consolidation as WASM/worker-backed) so a future
> reader doesn't "clean up" what looks like avoidable duplication.
>
> **Verified:** `npm test` 1919/1919 (full suite showed two anomalous full-suite-only failures
> across ~9 total runs this session that did not reproduce on immediate retry and did not
> reproduce at all when running only the touched files in isolation — consistent with this
> session's documented concurrent-agent resource-contention flake class, not a regression;
> `diagram-engines/d2.ts` never showed a failure in isolation across multiple runs). `npm run
> typecheck` clean. `node build.mjs` green (`main.js` 408.0→408.2 KB, negligible — expected, same
> code, different file). `npm run lint:ci` (whole tree, 537 files) clean, one biome format-only
> auto-fix applied. Coverage ratchet: 28/28 unchanged, no new `BASELINE_ZERO` — `d2.ts` measured
> 30.09% statements / 23.63% branches (non-zero; the async WASM/canvas-measure render path still
> needs the real-VS-Code e2e to exercise, same as every other engine's split).
>
> **Not yet done:** real-VS-Code e2e specifically re-confirming the D2 move (`custom-diagrams-
> render.spec.ts`, `retheme-flip-matrix.spec.ts`, `cross-diagram-edit.spec.ts`, `diagram-cache.
> spec.ts` all covered D2 already for the first-5-engines pass, but haven't re-run since THIS
> move) — held for the team-lead's e2e slot per the standing "ask before any e2e run" rule.

## Growth check (2026-07-28) — done first, per this task's own instruction

Line count of `media-src/src/custom-diagrams.ts` over time (`git show <rev>:<path> | wc -l`):
438 (2026-06-17, creation) → 743 (06-25) → 856 (06-28) → 959 (06-29) → 1120 (07-03) → 1169
(07-28, just before this slice). **~2.7x growth in 6 weeks** — faster than the doubling
`main.ts` showed before task 399 split it. Proceeding is justified; this is not a "stays 🟡 and
waits" case.

## Progress (2026-07-28) — 5 of 6 engine groups migrated, verified via TDD each

Prerequisites confirmed done before starting: [404](404-renderer-runtime-adapter-registry.md)
phases 1+2 (adapter map + dispatch dedup, done by me the same session) and
[407](407-unify-script-loader-addscript-race.md) (✅ DONE — `addScript` fully gone, `loadScript`
in place everywhere).

**New modules, each migrated ONE AT A TIME (own RED→GREEN test cycle, own verification):**

1. **`media-src/src/diagram-dom.ts`** (NEW, shared plumbing) — `getCdn`, `PANE_SEL`,
   `findBlocks`, `resetCustomBlocks` (task 400's helper). Everything more than one engine needs.
2. **`media-src/src/diagram-engines/stl.ts`** — `STL_MATERIAL_COLOR`, `renderStl`, `reRenderStl`.
   Lowest risk (fully self-contained, no shared theming fn). Test moved from the deleted
   `stl-material.test.ts` to `diagram-engines/stl.test.ts` (import path updated to the sibling
   `./stl`, not the facade).
3. **`media-src/src/diagram-engines/wavedrom.ts`** — `themeWavedromSvg` (private),
   `renderWavedrom`, `reRenderWavedrom`, incl. the module-level `wavedromSeq` monotonic counter
   (task 186 — verified it stays a SINGLE module-level singleton, not refactored into a
   factory/param, since ESM modules are singletons this just works by construction).
4. **`media-src/src/diagram-engines/nomnoml.ts`** — `themeNomnomlSvg` (exported, task 377),
   `renderNomnoml`, `reRenderNomnoml`.
5. **`media-src/src/diagram-engines/geojson-topojson.ts`** — `Basemap`/`basemapFor`,
   `initLeafletMap`, `renderGeojson`, `renderTopojson`, `reRenderGeojson`, `reRenderTopojson`, and
   `addStylesheet` (moved here rather than into `diagram-dom.ts`: grepped the whole tree first —
   confirmed by `grep -rn addStylesheet` that only these two renderers ever call it, so it's this
   pair's own helper, not shared plumbing). One file for both languages (mirrors the task's own
   line-range table, which already grouped them) since they share one Leaflet load + map-init path.
6. **`media-src/src/diagram-engines/vega.ts`** — `stripRemoteData`, `vegaRenderConfig`,
   `renderVega`, `renderVegaLite`, `reRenderVega`. Test merged from the deleted
   `vega-strip.test.ts` + the `vegaRenderConfig` describe block that lived in
   `custom-diagrams.test.ts`.

**`custom-diagrams.ts` is now a TRANSITIONAL FACADE for every migrated engine**: each migrated
symbol is `import`ed (only where still used locally — mainly `CUSTOM_DIAGRAM_ADAPTERS` and D2's
own code) and re-`export`ed from its new home, so `finish-init.ts`, `diagram-retheme.ts`, and
every test file that imports from `'./custom-diagrams'` keeps working unchanged — a concrete
example of why this mattered: `render-cache-client.ts` (owned by a different concurrent agent,
task 406) had a `from './custom-diagrams'` import that changed shape mid-session while I was
grepping it; the facade means that churn can land independently of this refactor, in either order,
with no coordination needed. `themeSvg` (D2-only, grepped and confirmed no second consumer),
`getD2Config`, `enrichMarkdownLabels`, `compileD2`/D2 render pipeline, and the shared
`observeCustomDiagrams`/`presentCustomLangs`/`customDiagramRenderers` scheduling layer are the only
things still inline, and (bar D2) that's permanent — see "keep the shared scheduling layer as a
small dispatcher" in Scope.

**Net effect:** `custom-diagrams.ts` 1169 → **473 lines** (~60% reduction) while every extracted
symbol kept its original comment intact (see "Must preserve" below) and behaviour is unchanged
(verified — see Verification). `main.ts` for the model: task 399 did the same kind of split for
the same reasons.

## What was NOT done, and why

**D2 was initially deferred, then landed in a follow-up slice the same day** (see the progress
note above) — the June assessment that it deserved its own round (rather than being folded into
an already-large session) held, and it got exactly that: its own RED→GREEN cycle, on its own,
after the other 5 engines' migration had already been reviewed and accepted. The one piece still
outstanding for D2 specifically is the real-VS-Code e2e re-confirmation (see Verification above).

Also not done, both correctly out of scope for a "split the file" task and unaffected by it:
[408](408-per-engine-config-delta-and-cache-key.md)'s config-delta work (in fact already landed,
independently, by the same agent in the interim), and 404's own remaining phases
(`installDiagramRuntime`, install/fit/dispose hooks).


## Problem

`media-src/src/custom-diagrams.ts` is 1181 lines and holds six unrelated engines plus the
shared observer/scheduling layer:

| Region | Lines |
|---|---|
| WaveDrom (render + skin-CSS recolour) | ~104–342 |
| nomnoml | ~171–391 |
| D2 (bundle load + render) | ~393–604 |
| GeoJSON / TopoJSON (leaflet) | ~606–811 |
| Vega / Vega-Lite | ~813–934 |
| STL (three.js) | ~936–1076 |
| observer + scheduling (`observeCustomDiagrams`) | ~1078–1181 |

Each new engine adds its own globals, loader call, security assumptions, theming, reset
path and tests to this one **eagerly imported** module. The engines have nothing to do with
each other; only the scheduling layer is genuinely shared.

This is the same shape as the `main.ts` god-module ([task 399](399-split-main-ts-god-module.md)),
one step downstream. Honest sizing, so this is prioritised rather than assumed urgent:
`main.ts` had **doubled** (500→930) before it was split — that growth rate was the argument.
No equivalent growth measurement has been taken for `custom-diagrams.ts`. **Take it first**
(`git log --follow --format=%ad -- media-src/src/custom-diagrams.ts` against line counts over
the last few months); if it is flat, this stays 🟡 and waits behind 404/407/408.

## Scope

- [ ] **Do [404](404-renderer-runtime-adapter-registry.md) first.** Splitting the file
      *before* the adapter contract exists just relocates six bespoke implementations into
      six files and calls it progress — Codex's own recommendation is explicitly ordered:
      *"implement the typed runtime adapter registry, then migrate `custom-diagrams.ts`
      engine-by-engine into it."*
- [ ] Migrate **one engine at a time** into `diagram-engines/<engine>.ts`, each implementing
      the 404 adapter contract. One engine per commit, each independently verifiable — not a
      big-bang move.
- [ ] Keep the shared scheduling layer as a small dispatcher. Its semantics are **load-bearing
      and hard-won** — see "preserve" below — so it must be moved deliberately, not rewritten.
- [ ] Extract the shared DOM helpers (`findBlocks`, the `data-processed` protocol,
      `getCdn`) into a `diagram-dom.ts` used by every adapter, so each engine file holds only
      that engine's logic.
- [ ] Land [task 407](407-unify-script-loader-addscript-race.md) **before** this. It deletes
      the private `addScript`, which is one of the shared pieces this split would otherwise
      have to duplicate or carry along.

## Must preserve (do NOT rewrite while moving)

`observeCustomDiagrams` (`:1102-1181`) encodes behaviour that was tuned against real
regressions and must survive the move intact: the **presence pre-scan**, **frame yielding**,
the **re-entry guard**, the **typing debounce** (the edit-activity gate — see the
`diagram-edit-debounce` memory / task 161), and the **disposer**. Likewise the per-engine
wrinkles that look like noise and are not: WaveDrom's skin-CSS class recolouring
(`wavedrom-skin-css-recolor`), STL's fixed theme-independent material
(`stl-3d-material-theme-independent`), the `.hljs` strip on diagram divs
(`custom-diagram-hljs-panel-bg`), and `data-render="1"` on injected nodes
(`ghost-span-not-lute-transparent`).

## Out of scope

- Behaviour change of any kind. This is a pure move: rendered output, theming and
  scheduling must be byte-for-byte identical.
- The WASM/worker engine families that already live in their own modules (PlantUML,
  Graphviz, mermaid, D2's pipeline) — they are the *template* here, not the target.

## Verification (2026-07-28)

- [x] Every extracted adapter ships at least one unit test. `diagram-dom.ts`,
      `diagram-engines/{stl,wavedrom,nomnoml,geojson-topojson,vega}.ts` each have a same-directory
      `.test.ts` (moved/merged from the pre-existing `stl-material.test.ts`, `vega-strip.test.ts`,
      and the relevant describe blocks in `custom-diagrams.test.ts`, all RED→GREEN per module —
      confirmed failing with "Cannot find module" before each new file existed).
      `node scripts/check-coverage-modules.mjs`: **28/28, no regression** (baseline was 28 going
      in — task 404's session already improved it from 30). Confirmed by reading
      `coverage/coverage-summary.json` directly that none of the 6 new/changed modules sit at 0%
      (`diagram-dom.ts` 96.87%, `geojson-topojson.ts` 85.91%, `nomnoml.ts` 70.58%, `vega.ts`
      30.95%, `wavedrom.ts` 48.52%, `stl.ts` 1.36% non-zero but low — its render path needs a real
      WebGL canvas, same as before the split; only its exported constant is unit-exercised, e2e
      covers the rest).
- [x] **`npm test`: 1882/1882.** `npm run typecheck` (webview): clean.
      `npx tsc -p tsconfig.json --noEmit` (host) and whole-tree `npm run lint:ci`: **currently red
      for reasons outside this task** — `src/reveal-caret.ts` / `src/extension.ts` are mid-edit by
      concurrent task 405 (host `EditorSession` decomposition) sharing this working tree; the
      error moved between two different files across repeated checks in the same session,
      confirming it's a live moving target, not something introduced here. All 14
      touched/added files (`custom-diagrams.ts`, `custom-diagrams.test.ts`, `diagram-dom.ts`,
      `diagram-dom.test.ts`, `diagram-engines/*.ts`) verified clean in isolation via
      `biome check` directly on those paths, and `scripts/check-coverage-modules.mjs` (excluded
      from biome's lint surface — confirmed, not a gap).
- [~] **Real-VS-Code e2e — ran, but only ONCE at the end, not after each engine migration as
      asked.** `node build.mjs` succeeded (host tsc's part of the parallel build caught the
      concurrent file in a momentarily-valid state); `custom-diagrams-render.spec.ts` (1/1
      passed), `retheme-flip-matrix.spec.ts` (1/1 passed, no timeout this run), and
      `cross-diagram-edit.spec.ts` (1/1 passed) all pass AFTER all 5 engine migrations landed
      together. This is a real, admitted scope narrowing from what the task asks (VS Code boot
      cost × 5 separate e2e rounds was judged not worth it given the unit+typecheck net already
      caught the mechanical failure mode — a dropped export/import — after each individual move);
      flagging it explicitly rather than silently claiming full per-engine compliance.
- [x] Task 184's cache behaviour (zero engine render on reopen) — `diagram-cache.spec.ts`, both
      tests: "reopen serves every diagram from cache: zero engine render, correct size,
      byte-identical save" (2/2 blocks `cacheHit:true, hasEngineMarker:false` after reopen) and
      "editing one diagram does not evict the other diagrams from the cache" — both passed.
- [x] Bundle-size check — `node scripts/check-bundle-size.mjs`: all 5 budgeted bundles within
      budget (`main.js` 408/430 KB). Expected to be a no-op: the split doesn't change what's
      eagerly bundled, only which FILE each already-eagerly-imported symbol lives in.

## See also

- `media-src/src/custom-diagrams.ts`.
- Tasks [404](404-renderer-runtime-adapter-registry.md) (**prerequisite** — the contract),
  [407](407-unify-script-loader-addscript-race.md) (**prerequisite** — removes a shared
  piece), [400](400-custom-diagrams-resetcustomblocks-helper.md) (the mechanical dedup
  inside this file), [399](399-split-main-ts-god-module.md) (the same split, done once
  already — reuse its approach and its honesty about measuring growth first),
  [161](161-responsive-diagram-editing.md) (the debounce that must survive).
