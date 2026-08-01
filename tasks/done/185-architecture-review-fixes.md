# 185 — Architecture-review fixes (2026-07 audit)

**Status:** DONE (2026-07-02) — every item implemented or explicitly resolved; two items
deferred by design (observer bus, goldens-in-CI — see Deferred section). All gates green;
VSIX rebuilt + installed for user eval (NOTE: echarts muted-tone delta from 1f).
Verification also surfaced two PRE-EXISTING nightly reds unrelated to this task: a rotted
count assertion in custom-diagrams-render.spec (FIXED here — expectations now derive from
the DOM target count; STL assertion made WebGL-availability-aware) and a real wavedrom
zero-height-in-Preview bug → filed as task 186.

## Context

A full architectural audit (2026-07-02) rated the codebase strong on anti-drift discipline
(33 Vditor patches with anchor asserts + tests, sha-pinned vendoring), host module isolation
(15/19 `src/` files vscode-free), the typed `protocol.ts` contract, and the 4-layer test
pyramid — but surfaced a prioritized list of traps, structural debts, and hygiene items.
This task implements all of them except two explicitly deferred items (rationale below).

## P1 — traps (cheap, real blast radius)

- [x] **1a. `patchDmpInterop` gets an anchor assert + unit test** (`media-src/esbuild-shared.mjs:129`).
  Today it is the ONLY patch of 33 with neither: a plain `.replace` that silently no-ops when
  the `import * as DiffMatchPatch` anchor drifts → undo breaks at runtime ("is not a
  constructor" — the exact bug it fixes). Add the fail-loud throw + a
  `test/backend/vditor-source-patches.test.ts` entry (bug-exists-pre-patch / fixed-post-patch /
  throws-on-drift, same style as the other 30).
- [x] **1b. Build-time patch-coverage assert (file-RENAME blind spot).** esbuild applies
  patches via `onLoad` path filters — a Vditor file rename silently skips the patch (the
  anchor throw never runs because the transform never runs); only the unit suite catches it.
  Fix in `media-src/esbuild-shared.mjs`: track which `VDITOR_TS_PATCHES` entries matched during
  a build; `onEnd`, IF the build loaded ≥1 vditor file, throw listing any unmatched entries.
  (Guard on "loaded ≥1 vditor file" so vditor-free bundles like `elk-entry` don't false-fail.)
- [x] **1c. Quarantine spike specs from the release gate.** 13 `*spike*` specs currently run in
  `npm run test:vscode` = the release-blocking nightly/tag gate (`test/vscode-e2e/playwright.config.ts`
  has no `testIgnore`). Add env-gated `testIgnore: '**/*spike*'` + a `test:spikes` script to run
  them on demand.
- [x] **1d. Remove leftover `console.log('setValue')`** (`media-src/src/main.ts:590`) — violates
  the logs→Output-channel convention.
- [x] **1e. `git-diff.ts` logs its failures.** Both swallow sites (`git-diff.ts:40-42`, `:80-82`)
  degrade with NO diagnostic — git-gutter failures are invisible. Inject an optional logger
  (keep the module vscode-free/DI) and log at trace from `extension.ts`.
- [x] **1f. Unify the palette-derivation primitive.** `echarts-theme.ts:92-101` re-derives
  bg/fg/line/accent/muted inline with a DIFFERENT muted mix (0.55 vs 0.5) instead of using
  `deriveDiagramColors` (`mermaid-palettes.ts:202`) — echarts can drift from mermaid on the same
  palette. Route it through the shared primitive (echarts-specific grid/surface derivations stay).
  NOTE: subtle visual delta on echarts muted tones — flag for user eval via VSIX.

## P2 — structural debts (the big levers)

- [x] **2a. `EngineDescriptor` registry — collapse the 12-site engine-knowledge scatter.**
  Per-engine behavior is encoded in ~12 independent lists across 8 files with no single source
  of truth: `CUSTOM_LANGS` (code-source.ts:20), `NATIVE_DEFER`/`CACHED`/`MEASURE_LANGS`
  (edit-activity.ts:130/143/163), `CACHEABLE_LANGS` (render-cache-client.ts:35),
  `NATIVE_CACHE_LANGS` (native-offscreen.ts:41), `STATIC_SVG_DIAGRAM` (diagram-zoom.ts:16),
  `RENDERED_DIAGRAM` (diagram-zoom-gate.ts:33), `ENGINE_TITLES` (diagram-error.ts:21, duplicated
  as hand-synced inline markup in esbuild-shared.mjs), the renderer array (custom-diagrams.ts:893),
  the retheme grouping (diagram-retheme.ts:107-188), and the two retheme flag sets in main.ts.
  Build `media-src/src/engine-registry.ts` (one descriptor per engine: family, cacheable,
  measuresHidden, deferClass, retheme strategy, zoom mode, hljs-exclude, error title); derive
  every list from it. PURE refactor: unit tests pin each derived set to its exact current
  membership, plus consistency rules (e.g. measuresHidden ⊆ deferred). Add a sync-test that the
  esbuild-inlined error-box markup matches `diagram-error.ts` output (kills the hand-sync).
- [x] **2b. Finish the stalled `extension.ts` SRP refactor** (was 1874 LOC, 18 responsibilities;
  the file's own comments documented the plan as mid-flight). Extracted along the 6 identified seams:
  tab/URI targeting → `tab-targeting.ts` (78 LOC), `setupStatusBar` → `status-bar.ts` (116 LOC),
  command registrations → `commands.ts` (176 LOC, `registerCommands(context, deps)`), write-back logic
  → `writeback-controller.ts` (143 LOC, `WritebackController` class), provider static config/CSS readers
  → `editor-config.ts` (203 LOC, free functions), and `EditorSession.start()`'s listener-wiring body →
  private `installListeners()` + `buildMessageHandlers()`. Also: deduped the 4 `open*` command prologues
  into one `resolveOpenTarget` helper; merged the doubled `onDidChangeTextDocument` registrations in both
  start() (content-sync + title-marker) and activate() (status-bar + outline); dropped the redundant
  `debouncedOutline` alias. Behavior-identical: `src/extension.ts` 1891→1302 LOC (measured); the config/CSS readers
  keep thin static aliases on `MarkdownEditorProvider` for the test API (logic lives in `editor-config.ts`).
  Gates: 1157 unit tests green, host + webview typecheck clean, `node build.mjs` green, no new lint/format
  diagnostics in the touched files.
- [x] **2c. rAF-debounce the 5 un-debounced synchronous observers.** code-source.ts:72,
  callouts.ts:447, html-comment.ts:97 + :112, echarts-fit.ts:87 each run a synchronous full
  subtree walk per mutation batch; 13 observers share the `#app` subtree so per-keystroke work
  amplifies. IMPLEMENTED as leading(sync)+trailing(rAF) coalescing (observe-coalesce.ts): the first batch of a frame still runs synchronously (preserves the documented no-flash-before-paint design of these observers), later same-frame batches fold into ONE pre-paint rAF re-run.
  DECISION: disconnect-brackets (as in wysiwyg-code-highlight:335) were considered and REJECTED
  for these — disconnecting drops concurrent Vditor mutations (missed re-decoration risk);
  rAF-debounce + existing idempotency converges safely instead.
- [x] **2d. Guard the reserve-beats-deferred-render ordering (native diagram cache).** The
  cache-hit path depends on `installRenderCache` running synchronously before Vditor's deferred
  `addScript().then()` render pass (render-cache-client.ts:37-44, finish-init.ts:149-157). An
  e2e canary exists (diagram-cache-mermaid.spec fails if ordering breaks). Add the explicit
  cross-module contract comments + a dev-time console-to-host warning when a reserve finds an
  already-rendered SVG (ordering violated).

## P3 — hygiene

- [x] **3a. `cursor-offset` joins the typed handler map with `requestId`.** Today it bypasses
  the compile-checked dispatch (one-shot `onDidReceiveMessage`, `msg:any`, fixed 1000 ms timeout —
  extension.ts:399-408). Add `requestId` to `get-cursor-offset`/`cursor-offset` in protocol.ts,
  route through the handler map + pending map (same pattern as diagram-cache-get).
- [x] **3b. DiagramCache disk tier: atomic + multi-window-safe.** `flushNow`
  (diagram-cache-host.ts:249-282) writes `index.json` non-atomically (torn JSON on crash) and
  serializes only the local process's entries (two windows on shared globalStorage =
  last-write-wins, orphan blobs, cross-window evictions). Fix: temp+rename for the index,
  read-merge-union on flush (prefer newer lastUsed; keep own pins), orphan-blob GC against the
  merged index. Unit tests: torn-write recovery, two-cache merge, GC.
- [x] **3c. Harden the soft `?v=` cache-busters.** SMILES inline (esbuild-shared.mjs:1230-1240),
  abc (:1073), markmap (:976) are `includes()`-guarded with NO throw — drift silently skips the
  cache-buster and a stale webview serves OLD renderer bytes across an update. Make them throw.
- [x] **3d. Enforce `lute.min.js.map` sha.** `source.json` declares `mapSha256` but `syncVendored`
  never checks it — false sense of coverage. Verify it (or move lute to the `files:{}` shape).
- [x] **3e. Dedupe md primitives.** `FENCE` regex ×3 (table-pipe-escape.ts:25,
  minimal-diff-writeback.ts:21 byte-identical; outline-tree.ts:4 indent-capturing variant) → one
  shared `src/md-scan.ts` (fences + row split in one line-scanning module). Table-row cell split ×2 (`cellCount` table-pipe-escape.ts:31,
  `splitRow` minimal-diff-writeback.ts:156) → one shared helper.
- [x] **3f. Remove dead exports:** `selectionForOffset` (reveal-range.ts:15, prod-dead),
  `resolveVisibleTargets` (wiki-cache.ts:163, prod-dead) + their orphaned tests.
  (`_resetCacheMap` stays — documented test hook.)
- [x] **3g. Split the `utils.ts` dumping ground** (404 LOC, 8 unrelated exports) into focused
  modules (responsive-tables / link-cut fixes / toolbar actions); update importers.
- [x] **3h. `WikiCache` multi-consumer `onChange`.** `getOrBuildCache` (wiki-cache.ts:184) binds
  only the FIRST caller's callback; a second consumer of the shared cache silently gets no
  notifications. Change to a listener set.
- [x] **3i. CSP narrowing — EMPIRICAL, verdict recorded.** `worker-src` NARROWED (blob: dropped — no engine spawns workers; elk in-process fake worker, viz/plantuml in-process WASM; renderer suite green). `script-src` narrowing to wasm-unsafe-eval was TRIED and REVERTED with evidence: wavedrom eval()s its relaxed-JSON source and vega-embed compiles expressions via eval/new Function — the real-VS-Code renderer spec failed under the narrowed policy. Both outcomes documented in html-builder.ts + pinned by html-builder.test.ts (unsafe-eval REQUIRED pin; no-blob worker-src pin). Try `'wasm-unsafe-eval'` in place of broad
  `'unsafe-eval'` (html-builder.ts:60) and audit `worker-src blob:` (d2/elk run in-process;
  check how graphviz's worker is constructed). Verify by running the full real-VS-Code
  all-renderers suite; if any engine breaks, revert that directive and document WHY it must stay.
- [x] **3j. Real-VS-Code e2e for large-file streaming.** test/vscode-e2e/stream-large-file.spec.ts — generates a ~744k-char doc in tmp, polls all 1200 sections streamed in, asserts the tail section present, contenteditable restored, stream spinner gone. RUN GREEN headless (7.4s). (missing per the AGENTS mandate —
  streaming is exactly the custom-editor-pipeline class). New spec: >streaming-threshold fixture,
  assert progressive render + final content + editability.
- [x] **3k. PR-scoped real-VS-Code smoke job in CI.** The webview-only bug class currently gets
  a signal only nightly/tag. Add a path-filtered PR job running a small smoke subset (VS Code
  download cached); nightly stays the full release gate.

## Deferred / won't-do (decisions)

- **Observer BUS (single MutationObserver → dispatcher):** deferred by design — the audit's own
  plan says do it AFTER 2c lands and is measured. 2c removes the amplification cheaply; the bus
  is a bigger redesign to be justified by measurement.
- **Goldens in CI: WON'T DO** — @visual goldens are local-only BY DESIGN (runner fonts differ →
  false diffs); the numeric layout guards are the CI net. Documented, not a gap.
- **`main.ts` coverage exclusion stays** — it is the boot/wiring file (Vditor construction);
  its logic already lives in extracted, covered modules (live-config, vditor-options, edit-sync,
  finish-init). Gated e2e coverage would be the alternative if this ever bites.

## Gates (all met, 2026-07-02)

- [x] `npm test` — 98 files, 1157 tests green (incl. new: patchDmpInterop + ?v= suites, 6 cache
  multi-window tests, md-scan, observe-coalesce, engine-registry pins, wiki multi-listener, CSP pins)
- [x] typecheck host (`tsc -p .`) + webview (`npm run typecheck`) clean
- [x] `npm run lint:ci` — exactly the 11 pre-existing warnings, none new
- [x] `node build.mjs` green — incl. the new patch-coverage assert (negative-tested: a bogus
  unmatched registry entry fails the build with exit 1) and the lute mapSha256 verification
- [x] harness e2e: 332 passed / 1 known skip. Real-VS-Code (headless xvfb): webview boot,
  custom-diagrams-render (all renderers — after fixing its pre-existing rotted counts),
  diagram-cache + diagram-cache-mermaid (2d ordering canary), stream-large-file (3j, 7.4s),
  callout/codenav/wysiwyg-modegate/html-comment (observer-coalescing nets) — green; parity.spec
  red is PRE-EXISTING (reproduced on clean b0e4d55) → task 186. Spikes excluded by default,
  `npm --prefix test/vscode-e2e run test:spikes` runs them (114 tests listed with the flag)
- [x] coverage spot-check: observe-coalesce 100% lines; diagram-cache-host ~90% lines (new
  merge/heal/GC paths exercised); md-scan + engine-registry exercised by their suites
- [x] VSIX packaged + installed (`code --install-extension`) for user eval
