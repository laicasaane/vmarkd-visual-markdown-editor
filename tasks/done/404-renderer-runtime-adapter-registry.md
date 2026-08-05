# Task 404 — Renderer runtime adapter registry (lifecycle hooks driven from `engine-registry.ts`)

**Status:** ✅ DONE (2026-07-30) · **Impact:** 🟠 med-high (every new engine was a cross-module change) · **Origin:** Codex architecture review (2026-07-27), **re-confirmed and sharpened** by a second Codex review of the branch the same day ("if I only fixed one thing: implement the typed runtime adapter registry")

> **Phase 2 status (2026-07-28):** DONE for the render/reRender dispatch surface — see the dated
> block below. The bigger, higher-risk remainder (an asserted `installDiagramRuntime()` phase
> structure, and `install`/`fit`/`onResize`/`dispose` hooks for the native engines) is
> **deliberately NOT attempted** this pass; see "What was NOT done" below for why and what it
> would take.

> **Final phase status (2026-07-30):** DONE. `engine-registry.ts` now declares pure
> `runtime` capabilities, while the function-bearing `DIAGRAM_RUNTIME_ADAPTERS` map lives in
> the adjacent `diagram-runtime.ts` module to preserve the registry's no-import law.
> `installDiagramRuntime()` synchronously enforces configure → cache reservation → renderer
> attachment → decoration/fit/resize/dispose ordering, deduplicates shared hooks, and replaces
> each registered hook only after its prior disposer has run. `runFinishInit()` delegates all
> diagram lifecycle wiring to that installer. ECharts and Markmap resize installers are now
> fully disposable and reinstallable.

> **📌 Second review (2026-07-27) — this task is now the hub of a four-task family.** A branch-level
> review independently reached the same conclusion and named this as *the single highest-leverage
> change*. It also contributed the concrete design below and three downstream/sibling tasks:
> [407](407-unify-script-loader-addscript-race.md) (the loader bug — land FIRST, it is independent
> and is a real bug), [408](408-per-engine-config-delta-and-cache-key.md) (per-engine config-delta +
> cache-key fragments — shares this task's descriptor design, do together),
> [409](409-split-custom-diagrams-into-engine-adapters.md) (migrating `custom-diagrams.ts` onto the
> contract — strictly downstream of this).

## Concrete contract (2026-07-27) — read before implementing further phases

`engine-registry.ts`'s own header comment is a **hard constraint** on this design: *"PURE
DATA — this module must import nothing from the engine modules (they import it)."*
`EngineDescriptor` therefore CANNOT hold `render`/`reset`/`retheme` function references
directly — that would make `engine-registry.ts` import from `custom-diagrams.ts`, which
already imports the registry (circular, and violates the file's own stated law).

**Resolution:** a separate adapter map, keyed by `lang`, living where the render functions
already live (`custom-diagrams.ts`, or a new adjacent module) — NOT inside
`engine-registry.ts`. A completeness test (mirroring `engine-registry.test.ts`'s existing
`native-offscreen RENDERERS keys == native cacheable engines` pattern) asserts the adapter
map's keys equal `ENGINES.filter(e => e.family === 'custom').map(e => e.lang)` in both
directions — this is the concrete mechanism for this task's "make a partially-integrated
engine fail loudly" goal, and it's a real, running CI check, not a code-review convention.

**Phase 1 (done 2026-07-27, verified via TDD):** `CustomDiagramAdapter { render, reRender }` +
`CUSTOM_DIAGRAM_ADAPTERS: Record<string, CustomDiagramAdapter>` in `custom-diagrams.ts`,
covering all 8 `family: 'custom'` engines (wavedrom, nomnoml, geojson, topojson, vega,
vega-lite, stl, d2), with 3 bidirectional-completeness tests (verified RED — `Cannot convert
undefined or null to object` — then GREEN). `vega-lite` maps to `reRenderVega` (not a separate
`reRenderVegaLite`) — mirrors the real shared-reset relationship task 400 documented, not a
shortcut. **Nothing calls this map yet** — it's inert scaffolding proving the shape is right
before any runtime path is rewired onto it, per the "design before migration" ordering 409
depends on. Verified: 34/34 in `custom-diagrams.test.ts`, full suite 1784/1784, typecheck
clean, `lint:ci` clean, coverage ratchet OK (30/30, no regression), `node build.mjs` clean.
No real-VS-Code e2e run for this slice — deliberately: nothing in the runtime message/render
path calls `CUSTOM_DIAGRAM_ADAPTERS` yet, so there is no observable behavior for an e2e to
exercise; the next phase (wiring `finish-init.ts`/`native-offscreen.ts` onto it) is exactly
where a real-VS-Code e2e becomes mandatory per `AGENTS.md`.

**Phase 2 (done 2026-07-28, verified via TDD) — wire the adapter map into the render/reRender
dispatch surface, remove the parallel per-engine lists it made redundant:**

1. **`custom-diagrams.ts`: `observeCustomDiagrams`'s hard-coded `renderers` array deleted.**
   That array was a byte-for-byte duplicate of `CUSTOM_DIAGRAM_ADAPTERS` (phase 1 built the
   adapter map but nothing read it yet — this is the "nothing calls this map yet" phase 1 flagged
   as the next step). Replaced by a new exported `customDiagramRenderers()`, derived from
   `engineLangs(e => e.family === 'custom')` + `CUSTOM_DIAGRAM_ADAPTERS[lang].render` — same
   order (wavedrom, nomnoml, geojson, topojson, vega, vega-lite, stl, d2), same function
   references, zero behavior change. `observeCustomDiagrams` now calls it instead of carrying its
   own list.
2. **`diagram-retheme.ts`: `GEO_RERENDER` deleted; `wavedrom`/`nomnoml` rows deleted from
   `MONO_RERENDER`.** Those four rows (geojson, topojson, wavedrom, nomnoml) were a SECOND
   per-engine map next to `CUSTOM_DIAGRAM_ADAPTERS` for the exact same `family: 'custom'`
   engines, calling the identical `reRenderX` functions. Replaced with `monoOrGeoRerender(lang)`
   — a single exported dispatch function: the native map (plantuml/graphviz/abc — genuinely
   `family: 'native'`, correctly kept as its own map, not folded in) first, then
   `CUSTOM_DIAGRAM_ADAPTERS[lang].reRender` for everything else. The module-init fail-loud check
   (a registry engine tagged mono/geo with no re-render fn throws at import time) now asserts
   through `monoOrGeoRerender` instead of the two old maps directly, so it still covers both
   families. `reThemeMono` / `reThemeGeoAndD2` call sites updated to the one dispatch function.
   `vega`/`vega-lite`/`d2` were deliberately left untouched (still call `reRenderVega`/`reRenderD2`
   directly) — they have their own retheme strategies (`'vega'`, `'d2'`), not `'mono'`/`'geo'`, so
   they were never in these two maps and folding them in would have introduced a real risk: since
   `CUSTOM_DIAGRAM_ADAPTERS['vega-lite'].reRender === CUSTOM_DIAGRAM_ADAPTERS['vega'].reRender`
   (the same function reference — task 400's documented shared-reset relationship), a naive
   generic loop over both langs would call it twice per re-theme poll tick. Not folding vega/d2 in
   avoids that trap entirely; it was never exercised because the loop this task touches
   (`MONO_LANGS`/`GEO_LANGS`) contains no such aliased pair.

   **Verification:** new `media-src/src/diagram-retheme.test.ts` (did not exist before — this
   module previously had ONLY e2e coverage) + 2 new tests in `custom-diagrams.test.ts`
   (`customDiagramRenderers`), all written RED-first (confirmed failing for the expected
   `TypeError: … is not a function` reason) then GREEN. `npm test`: 1852/1852 (media-src subset
   alone: 861/861). `npm run typecheck` (webview): clean. `npx tsc -p tsconfig.json --noEmit`
   (host): **pre-existing failure in `src/extension.ts`, unrelated** — that file is mid-edit by a
   concurrent task (405, host `EditorSession` decomposition) sharing this working tree; verified
   by re-checking after a few minutes and seeing the error move to a different line number, and by
   `node build.mjs` succeeding cleanly moments earlier/later (its parallel `tsc -p ./` step
   transiently caught the file in a valid state). Did not touch, per this task's explicit
   instruction not to edit `src/extension.ts`. `npm run lint:ci`: my 4 touched files
   (`custom-diagrams.ts`, `diagram-retheme.ts`, `custom-diagrams.test.ts`, `diagram-retheme.test.ts`)
   are clean under `biome check` in isolation; the whole-tree gate also currently shows pre-existing
   formatting drift in `src/sync-state.ts` / `test/backend/doc-sync.test.ts` /
   `test/backend/host-log.test.ts` — all files this task never touched, being edited by other
   concurrent agents sharing this branch. `node scripts/check-coverage-modules.mjs`: two initial
   attempts to regenerate `coverage/coverage-summary.json` via `npm run test:coverage` collided
   with a concurrent agent's own `test:coverage` run sharing the same `coverage/.tmp` output path
   (`ENOENT`/"something removed the coverage directory"); a later retry succeeded once that
   collision cleared. Result: an IMPROVEMENT, not a regression — `diagram-retheme.ts` and
   `mermaid-retheme.ts` (pulled in transitively by the new `diagram-retheme.test.ts`'s dynamic
   import) both moved off 0% for the first time, so the ratchet script itself printed "2 baseline
   module(s) now have coverage — prune from BASELINE_ZERO"; pruned both per the script's own
   "PRUNE an entry the moment it gains unit coverage" rule in `scripts/check-coverage-modules.mjs`.
   Final: `Coverage ratchet OK — 28 source module(s) at 0% (baseline 28)` (was 30). `node
   build.mjs`: clean. Real-VS-Code e2e (both mandatory per `AGENTS.md`, run headless via
   `xvfb-run`): `custom-diagrams-render.spec.ts` — 1/1 passed; `retheme-flip-matrix.spec.ts` (the
   theme-flip spec exercising wavedrom/nomnoml/geojson through the rewired dispatch, plus d2) —
   1/1 passed on a clean run (an earlier attempt hit a 60s timeout waiting for D2's PRE-flip
   initial render on the heavier 14-engine fixture, exhausted its 2 built-in retries, then passed
   outright on a fresh re-run with zero code changes in between — consistent with the resource
   contention documented in this spec's own tier comment, "Cold VS Code boot + webview render
   under WSLg/CI is occasionally slow and racy", exacerbated here by several other agents actively
   building/testing on the same machine; the assertion that timed out is on D2's initial render,
   which this phase's dispatch changes never touch). Did not run the fast/smoke tiers or the full
   suite (not requested for this slice; the two named specs are the ones that exercise the changed
   dispatch).

**Historical Phase 2 boundary (superseded by the final phase above):** the phased, asserted
`installDiagramRuntime()` (finding 4) and the `install`/`fit`/`onResize`/`dispose` hooks folding
in the resize/fit/decorate lifecycle (finding 6) were then un-started. Both required reordering or
adding to the six interleaved, rAF-scheduled observer installs in `finish-init.ts` (edit-activity,
callouts, diagram-zoom, render-cache, custom-diagrams, echarts-resize, abc, mindmap,
mermaid-defer…), several of which carry their own scheduling — a structural reorder risks
silently reshuffling rAF callback ordering with no affordable e2e that would catch a subtle miss,
against this task's own "behavior must be preserved exactly" constraint. The one narrow,
low-risk version of the ordering-contract ask (turning the `finish-init.ts:168-175` "ORDERING
CONTRACT" **comment** into a runtime-**asserted** invariant, without reordering anything) was
scoped as a stretch goal for this session and not reached — recommended as the next slice, sized
much smaller than the full `installDiagramRuntime()` finding 4 rewrite. `native-offscreen.ts` was
inspected and needs **no change**: its `RENDERERS` map is already the registry-synced pattern this
task asks for elsewhere (`NATIVE_CACHE_LANGS = Object.keys(RENDERERS)`, pinned by
`engine-registry.test.ts`'s "native-offscreen RENDERERS keys == native cacheable engines" test) —
noting this here so a future pass doesn't invent a redundant parallel map to satisfy the task
wording literally. "Make a partially-integrated engine fail loudly" (the other finding-6 bullet) is
already satisfied by phase 1's bidirectional completeness tests plus this phase's
`monoOrGeoRerender` fail-loud throw — no further work needed there.

## Problem

`media-src/src/engine-registry.ts` centralizes engine **metadata** (`lang`, `family`) and
was introduced precisely to kill the "fixed it in 5 of 6 hard-coded lists" bug class. But
the metadata is where the centralization stops: the actual **runtime lifecycle** of a
diagram engine — invoke, reset, error-stamp, cache get/put, live re-theme — is still
implemented as parallel per-engine code spread across several modules:

- `custom-diagrams.ts` (1181 lines) — one bespoke `reRenderX` per engine, six near-identical
  bodies (this is what [task 400](400-custom-diagrams-resetcustomblocks-helper.md) targets
  mechanically).
- `diagram-retheme.ts` — a separate per-engine re-theme function set, plus the grouped
  `reThemeMonochromeGroup` special case.
- `render-cache-client.ts` — its own notion of which engines are cacheable / reusable.
- `native-offscreen.ts` — the native-Vditor-engine swap path.
- `finish-init.ts` — installs the observers, and **documents a synchronous
  installation-order requirement** between the cache observer and the renderer observers.
  Verified 2026-07-27: `media-src/src/finish-init.ts:168-175` carries an explicit
  "ORDERING CONTRACT (185/2d)" comment — the cache observer must claim `data-processed`
  before the custom engines' first pass AND stay **synchronous**. A correctness constraint
  that exists only as a comment is exactly the kind of thing that breaks silently when
  someone reorders wiring. (There is a paint-time ordering warning in `resolveRequest`,
  so it is not entirely unguarded — but the guard is a runtime warning, not a structural
  property.)

Consequence: adding an engine (or changing a lifecycle rule such as "reset also clears the
error attribute") is a multi-file operation with no single place that says what an engine
must implement. Task 152 item 3 already found one concrete drift of this shape (the D2
double-fire between `handleSetTheme` and `handleConfigChanged`), and it was fixed
point-wise rather than structurally.

## Scope

- [x] Extend the pure engine descriptor in `engine-registry.ts` with optional typed
      **lifecycle capability metadata** (`render`, `fit`, `resize`, `dispose`). Function
      hooks deliberately live in the adjacent adapter registry, avoiding circular imports.
- [x] Derive the observer dispatch and the reset path from the registry instead of the
      hard-coded per-engine lists, so a new engine is **one registry entry** — DONE for the
      render/reRender dispatch (2026-07-28, phase 2: `customDiagramRenderers()` in
      `custom-diagrams.ts`, `monoOrGeoRerender()` in `diagram-retheme.ts`; `resetCustomBlocks()`
      itself was already done in phase 1 via task 400). The install/fit/resize/dispose
      lifecycle is now derived from `DIAGRAM_RUNTIME_ADAPTERS`.
- [x] Keep genuinely engine-specific behaviour as that engine's adapter implementation —
      D2 (WASM + layout config), PlantUML (dual warm engines, see the
      `plantuml-engine-type-stickiness` memory), STL (three.js disposal), the computed-colour
      renderers that need foreground polling (`computed-color-renderers-need-fg-polling`).
      The goal is one **contract**, not one implementation.
- [x] Encode the `finish-init.ts` cache-vs-renderer observer ordering as an explicit,
      asserted property of the registry-driven installation rather than a comment.
      **Concrete design (second review, finding 4):** one `installDiagramRuntime()` with
      named, ordered phases — *configure → reserve cache → attach renderers → attach
      decoration/resize observers*. Today the ordering is a comment plus a **post-hoc runtime
      warning** in `render-cache-client.ts` (`resolveRequest`), i.e. it can only report the
      violation after it has already happened; phases make it unrepresentable instead.
- [x] **Fold the resize/fit/decorate lifecycle into the same contract (second review,
      finding 6).** `finish-init.ts:156-195` hand-wires ECharts resize, Markmap resize, ABC
      fit, Mindmap reconstruction, SMILES repair and Mermaid deferred cleanup as six separate
      imports + correctly-ordered installers a developer must remember. Give the adapter
      `install` / `fit` / `onResize` / `dispose` hooks and register their disposers uniformly
      through `Disposables`. The model to copy already exists in-tree: **zoom is already
      registry-derived** (`diagram-zoom.ts:16-20`, `diagram-zoom-gate.ts:31-37`) — this
      extends that proven pattern to the rest of the lifecycle.
- [x] **Make a partially-integrated engine fail loudly.** Verified 2026-07-27:
      `engine-registry.test.ts` asserts more than the second review credited it with — it
      pins the lang set, `NATIVE_DEFER`, the `diagram` / `measuresHidden` / `cacheable` sets,
      `zoom` static+gated, `retheme` mono+geo, error titles, and the native-offscreen map.
      But none of those assert that a `family: 'custom'` engine has a **render path**, so the
      review's growth conclusion still holds: a new `custom` row can be added, typecheck,
      pass the registry tests, and simply never render. The adapter contract should make that
      a compile error (a `custom` engine must supply `render`) or a test failure. — DONE via
      phase 1's bidirectional `CUSTOM_DIAGRAM_ADAPTERS` completeness tests
      (`custom-diagrams.test.ts`) plus phase 2's `monoOrGeoRerender` module-init fail-loud
      throw in `diagram-retheme.ts` (a mono/geo-tagged engine with no dispatch throws at import).
- [x] Fold in [task 400](400-custom-diagrams-resetcustomblocks-helper.md) as the first,
      lowest-risk step (the shared `resetCustomBlocks()` helper) rather than doing it as a
      standalone endpoint — 400 stays a valid slice, this task is its destination. — DONE
      (phase 1, `resetCustomBlocks()` in `custom-diagrams.ts`).
- [x] Refine the candidate hook set against the real call sites. The resulting runtime
      contract uses `render`, `fit`, `onResize`, and `dispose`, with per-hook phase metadata;
      cache reservation is an installer-owned phase, while reset/retheme/config/cache-key
      concerns remain in their already registry-driven task 400/408 paths.

## Out of scope

- Adding or removing any diagram engine.
- Changing render output for any engine. This is a pure restructure: the per-engine
  rendered SVG and the theme-flip behaviour must be unchanged.
- The D2-internal split (`d2-render.ts` 2344 lines, `d2-refine.ts` 1651) — that is
  [task 123](123-d2-pipeline-refactor.md)'s deferred god-module tail; the review agrees it
  should come **after** this lifecycle work, not before.

## Verification

- [x] Every existing per-engine unit test passes unmodified. Full unit suite:
      2001/2001.
- [x] Real-VS-Code e2e per `AGENTS.md`'s webview-feature mandate: the theme-flip matrix
      spec (it already covers d2 / wavedrom / nomnoml / flowchart / vega / echarts /
      mindmap / graphviz / smiles) plus a cross-diagram edit spec — this is the suite that
      would catch a lifecycle regression. Focused real-VS-Code runs passed:
      `custom-diagrams-render` 1/1, `cross-diagram-edit` 1/1, `diagram-resize` 1/1,
      `retheme-flip-matrix` 2/2, and `diagram-cache` 2/2.
- [x] The render cache still produces zero engine renders on reopen (task 184's guarantee)
      and retains the expected cache-hit attributes, verified by `diagram-cache.spec.ts`.
- [x] A "new engine" smoke check is enforced in CI: bidirectional completeness and
      capability tests require every runtime-declaring descriptor to have exactly the
      matching adapter hooks, and reject unknown adapter languages.

Additional gates: full Chromium suite 405 passed / 1 skipped; typecheck, build, and
whole-tree Biome lint passed; coverage ran across 2001 tests and the zero-module ratchet
passed at 24/24; the real-VS-Code fast tier passed 39/39. `diagram-runtime.ts` reached
93.75% statements, 100% functions, and 92.5% lines.

## See also

- `media-src/src/{engine-registry,custom-diagrams,diagram-retheme,finish-init,render-cache-client,native-offscreen}.ts`.
- **Checked for overlap 2026-07-27, none found:** [task 142](../142-renderer-feature-parity-audit.md)
  is the hub for *does renderer X support engine feature Y* (feature parity), and
  [task 146](146-theming-coherence.md) is DONE and produced ADR-0006 (theming **policy**).
  Neither owns the runtime lifecycle contract this task proposes — but 142 is the right place to
  reconcile any per-engine gap this restructure uncovers.
- Tasks [400](400-custom-diagrams-resetcustomblocks-helper.md) (first step),
  [152](152-decompose-orchestrator-state.md) item 3 (the drift evidence),
  [123](123-d2-pipeline-refactor.md) (the D2 tail that follows this),
  [184](184-persistent-diagram-render-cache.md) (the cache contract to preserve).
- Memories: `plantuml-engine-type-stickiness`, `computed-color-renderers-need-fg-polling`,
  `stl-3d-material-theme-independent` — three engines whose wrinkles must survive as
  adapter behaviour, not be flattened away.
