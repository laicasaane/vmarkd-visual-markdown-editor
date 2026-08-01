# Task 184 — Persistent diagram render→SVG cache (survives tab close + restart, warm-open reuse)

> **Status:** ✅ Phase 1 (host-memory, survives tab close) + Phase 2 (disk persistence via
> `globalStorageUri`, survives restart) + the per-doc PINNED current-set fairness guarantee +
> ✅ **Phase 3 for MERMAID + ABC + FLOWCHART (native-engine zero-render reuse on reopen)** IMPLEMENTED
> (2026-07-01). **ALWAYS ON — no user setting** (the `vmarkd.advanced.diagramRenderCache` opt-in flag was
> removed 2026-07-01 at the user's request; the cache runs on every open). The real-VS-Code e2e proves it
> is CORRECT (zero engine render on reopen, exact size match, byte-identical getValue) for the custom
> engines AND mermaid/abc/flowchart.
> **Paint-from-cache scope:** (1) the reusable-SVG CUSTOM-diagram engines that flow through
> `findBlocks` — **d2** (flagship) + wavedrom/nomnoml/vega/vega-lite; and (2) **native mermaid, abc,
> flowchart** (Phase 3, via `native-offscreen.ts`). The Phase-3 investigation OVERTURNED the earlier
> premise that native engines "can't be reserved without a Vditor patch": every Vditor renderer
> re-checks `data-processed` inside its DEFERRED `addScript().then()` pass, and our reserve runs
> synchronously on open (finish-init, same task) BEFORE that microtask — so `data-processed` blocks
> the engine with NO Vditor patch. A cache HIT paints the stored svg; a MISS renders offscreen via the
> generalised `renderNativeJobs` (Vditor's one-shot pass can't re-fire, so we render it ourselves; the
> sandbox inherits the live node's `color` so abc/flowchart bake the content-theme foreground off-body).
> **Excluded native engines:** **echarts/mindmap** render to a `<canvas>` (no reusable static SVG — would
> need forcing echarts' svg renderer, riskier: touches echarts-fit/retheme/mindmap); **markmap** is a live
> d3 instance (no `data-processed` signal, 3-way DOM split, a static svg would kill zoom/fit); **graphviz**
> is EXCLUDED empirically — reserving it makes Viz.js run twice (the blocked live pass still calls
> `Viz.instance()`, then our offscreen pass calls it again) and the second Viz worker hangs → the offscreen
> render never produces an svg (e2e left raw DOT). Streaming (large-doc) opens + mode-switch reuse remain
> a true host-warm-open concern (see Phase 3 note).
> The canvas/WebGL engines (stl) + Leaflet maps (geojson/topojson) are excluded (no reusable static SVG).
> Grew out of the task-183
> work + the mermaid worker-patchability research (2026-07-01): mermaid CANNOT go off-thread (it's a
> minified UMD blob measuring via live-DOM `getBBox`×119 + `foreignObject`, no injectable Sizer, and
> worker `measureText` is font-unfaithful per 183 Phase 0.2), so the ONLY way to stop paying its
> ~284 ms render on repeat is to NOT render at all — cache the rendered SVG keyed by content.
> **Goal:** the cache must **survive closing a tab** and make **reopening the same diagram files fast**
> while working in a project (and, with disk persistence, survive a VS Code restart).
> **Value / Risk:** 🟢 high (instant reopen + no redundant re-render, all engines) / 🟡 medium (host↔
> webview plumbing + a bounded on-disk store; the render is our own output so fidelity is safe).
> **See also:** 183 (capture/re-home + the reverted in-webview cache idea — this is the *persistent*
> version done right), 182 (off-thread classification — why mermaid needs the cache not a worker),
> 170 (host-preload diagram scripts), `[[worker-measuretext-ignores-fontface]]` context.
> **Files that already exist to build on:** `src/lute-host.ts` + `media-src/src/prerender-overlay.ts`
> + `media-src/src/stream-chunk.ts` (warm-open prerender), `src/extension.ts` (host provider +
> `globalState`; add `globalStorageUri` blob store), `media-src/src/mermaid-retheme.ts:49-82` (the
> offscreen render+atomic-swap primitive), `media-src/src/custom-diagrams.ts` (`findBlocks`/`data-code`),
> `media-src/src/edit-activity.ts` (`renderCache` — the in-memory, per-session precedent).

## Why this exists

Diagram engines render in the WEBVIEW (they need a DOM); the host can't render them. Today every diagram
re-renders from scratch on every open — mermaid ~284 ms, d2 a WASM compile + ELK layout, echarts canvas,
etc. Opening a diagram-heavy file (or reopening one you just closed) pays that cost every time. A rendered
SVG is a **pure function of `(engine, engine-version, theme, source-text)`** — deterministic, so it can be
cached and reused verbatim with zero fidelity loss.

**The user's ask:** working in a project and frequently reopening the same files with diagrams should be
fast; the cache must outlive the editor tab (a webview is destroyed on tab close, so an in-webview cache —
the reverted task-183 idea — cannot satisfy this).

## What this is NOT

- **NOT a forward-typing speedup.** Typing changes the source → new hash → miss → the engine still renders
  once (at settle). Only a worker removes that, and mermaid can't (task 182/183). This cache targets
  REOPEN + REPEAT (undo/redo, theme-flip-back, mode-switch, duplicate diagrams, reopen).
- **NOT a worker.** No off-thread anything. Renders stay main-thread + font-faithful.

## Architecture

A rendered-SVG store that lives in the HOST (survives tab close) and on DISK (survives restart), served
back to the webview on open so diagrams paint without re-rendering.

### Key
`hash(lang | engineVersion | themeKey | sourceText)` — FNV-1a/SHA-256 hex.
- `engineVersion`: a per-build asset version (a build pins fixed engine versions — mermaid 11.15.0, the
  d2 wasm `D2_VER`, echarts, …). A single `assetsVersion` bumped in `build.mjs` is enough; a bump makes
  all old entries miss (correct — old-engine SVGs must not be reused).
- `themeKey`: EVERYTHING that changes the render — `contentTheme` + `mermaidTheme`/`echartsTheme`/d2 cfg +
  `themeVariables` + `fontFamily`. Same `themeKey()` the render path already derives.
- `sourceText`: the exact fence body the engine renders (the webview's `data-code` / the markdown fence).

### Where it lives (two tiers + a per-doc PINNED current-set)
- **Tier A — host memory (survives tab close):** an LRU `Map<hash, svg>` on the extension host (module
  or on `VmarkdEditorProvider`). The host process spans the whole VS Code window session, so it outlives
  every webview. This alone satisfies the primary ask (reopen within a work session = instant).
- **Tier B — disk (survives restart):** persist under `context.globalStorageUri` (one file per hash, or a
  sharded index + blobs — NOT `globalState`, which is for small values). LRU-pruned by a size/count cap.
- **⭐ Per-document PINNED current-set (the eviction-fairness guarantee):** on top of the LRU, the host keeps,
  per `docUri`, a small manifest = the hash of the CURRENT render of EACH diagram in that doc (one entry per
  diagram, updated when that diagram's render report arrives). Every hash in a known doc's current-set is
  **PINNED — never LRU-evicted**. So editing diagram A (which floods the LRU with A's intermediate/settled
  states) can NEVER evict diagram B/C/D's latest render, and every diagram's LAST render is always retained.
  The LRU only reclaims UNPINNED surplus: superseded states (A's old versions after you edit A), and
  closed-doc renders once memory pressure hits. This is what makes "edit one diagram ≠ clear the others,
  and the last render is always cached" a structural property, not luck.

### Flow
1. **Webview finishes a render** (cache miss / after an edit) → posts `{command:'diagram-render-cached',
   hash, svg}` to the host → host stores it (memory + disk, LRU).
2. **On open** the host serves the doc's cached SVGs so the webview paints them WITHOUT running the engine:
   - **Phase-1 form (request/response):** webview extracts each diagram block (`findBlocks`), computes the
     hash, requests `{command:'diagram-cache-get', hashes[]}` → host replies with the hits → webview injects
     each cached SVG via the existing offscreen render+atomic-swap primitive (`mermaid-retheme.ts`-style),
     skipping the engine.
   - **Phase-3 form (true warm-open):** the HOST precomputes candidate hashes from the markdown + config
     (it already parses the doc for the `lute-host` prerender) and ships the cached SVGs INLINE with the
     initial payload/prerender HTML, so diagrams paint before the engines even boot. Fallback to a live
     render on any miss/mismatch.
3. **Edit** changes the source → new hash → miss → engine renders once → posts the new SVG to the host.

### Injected-SVG fidelity
The cached SVG is re-injected into the editable surface, so it MUST carry `data-render="1"` (Lute skips it
→ `getValue()`/`serializeForHost()` byte-identical present vs absent — the same discipline as the task-161
overlay and task-183 re-home). It is OUR OWN prior render output, so there is no untrusted-content concern;
CSP already allows inline SVG in the webview.

### Modules to add / change
- **NEW `src/diagram-cache-host.ts`** — `class DiagramCache`: `get(hash)`, `put(hash, svg)`, LRU + size cap;
  disk backing under `context.globalStorageUri` (lazy read, debounced write, prune on cap). Pure, unit-tested.
- **CHANGE `src/extension.ts`** — instantiate the cache with `context` in `VmarkdEditorProvider`; handle the
  new webview messages; (Phase 3) precompute hashes for the warm-open payload.
- **NEW `media-src/src/render-cache-client.ts`** — webview side: `hashOf(lang, source, themeKey)`, request
  cached SVGs on open, receive + paint via the offscreen swap, post fresh renders back. `themeKey()` shared
  with the render path.
- **CHANGE `media-src/src/custom-diagrams.ts` + the mermaid/native render completion path** — on a completed
  render, post `{hash, svg}` to the host; on open, consult the cache before invoking the engine.
- **CHANGE `src/protocol.ts`** — add the `diagram-cache-get` / `diagram-render-cached` message types.
- **CHANGE `media-src/build.mjs`** — expose an `assetsVersion` (engine-version stamp) into the webview + host
  so it's part of the hash and a bump invalidates old entries.
- **(Phase 3) CHANGE `src/lute-host.ts` / `media-src/src/prerender-overlay.ts`** — fold cached diagram SVGs
  into the warm-open prerender so reopen paints diagrams pre-boot.

## Lifetime + eviction
- **Never TTL-expires** — an SVG is a pure function of `(engine, version, theme, source)`, so an entry can't
  go stale; lifetime is purely memory/disk management, not freshness.
- **Fairness (the user's requirement):** the per-doc PINNED current-set means **editing one diagram never
  evicts another diagram's cache**, and **every diagram's LATEST render is always retained** (pinned while
  its doc is known/open; retained on disk after close, subject only to the disk cap). Eviction touches only
  UNPINNED surplus: a diagram's SUPERSEDED older renders (dropped once you edit past them — you won't reopen
  a half-typed state) and closed-doc renders under pressure.
- **Memory (Tier A):** the VS Code window session. Cleared on host reload. Current-set stays pinned.
- **Disk (Tier B):** across restarts; **LRU by last-use, capped** (e.g. ~50 MB or N entries) so a large
  project can't grow it unbounded. Pinned current-set entries are preferentially retained; only genuinely
  cold, unpinned entries are pruned. `engineVersion` in the key → old-version entries never match (and are
  pruned).
- **Theme change:** new `themeKey` → miss + re-render; the old entry stays for an instant flip-back (until
  evicted).

## Phased plan
- **Phase 0 — spike (real-VS-Code):** confirm host↔webview round-trip on open is fast enough that painting
  from cache beats a live render, and confirm the offscreen-swap paints a host-supplied SVG cleanly (no
  flash, correct size — the task-183 overlay-size trap must NOT recur; use the proven `mermaid-retheme`
  offscreen path, not a raw overlay). — folded into Phase 1; the `diagram-cache.spec.ts` e2e IS the proof
  (reopen: exact width match 219/227/241 before==after, byte-identical getValue).
- **Phase 1 — host-memory cache (survives tab close): ✅ DONE.** `diagram-cache-host.ts` (`DiagramCache`,
  Tier A memory) + the `diagram-cache-get`/`diagram-cache-hits`/`diagram-render-cached` message round-trip
  + `media-src/src/render-cache-client.ts` (reserve-then-paint on open; reserve sets `data-processed` to
  block the engine, a hit paints into the LIVE constrained `.language-X` div (offscreen-swap discipline,
  no 183 size jump), a miss unblocks the engine). **Always on** (no user setting) — see Status.
- **Phase 2 — disk persistence (survives restart): ✅ DONE.** `<globalStorageUri>/diagram-render-cache/`
  = `index.json` + `blobs/<hash>.svg`, lazy read + debounced write, LRU byte cap (~50 MB), version-key
  invalidation (a stored-version mismatch wipes the store on load). `engineVersion` = the extension
  version (lowest-risk existing constant, threaded via `collectConfigOptions` → init options → the webview
  hash; a bump changes every hash). Unit-tested (disk round-trip, version-bump wipe, cap-prune in a tmp dir).
- **Phase 3 — native-engine reuse: ✅ DONE for MERMAID + ABC + FLOWCHART (webview reserve, no host
  prerender needed).** The investigation (2026-07-01, agent-mapped with file:line citations) found native
  engines CAN be reserved from the webview after all — their `data-processed` check is inside a DEFERRED
  `addScript().then()`, which our synchronous open-time reserve beats. So these engines get zero-render
  reuse by EXTENDING `render-cache-client.ts` (reserve the preview-pane `.language-<lang>`; hash from the
  editable marker source; HIT → paint; MISS → offscreen re-render via the generalised `renderNativeJobs`
  in the new `native-offscreen.ts`; the sandbox inherits the live node's `color` so abc/flowchart bake the
  content-theme foreground off-body). Proven by `diagram-cache-mermaid.spec.ts` (reopen: `data-vmarkd-cache-hit`
  for all three, mermaid additionally byte-identical svg — same `"mermaid"+genUUID()` id — correct size
  439/438/328 == first open, byte-identical getValue). NO Vditor source patch. **Excluded / deferred:**
  (a) **graphviz** — EMPIRICALLY BLOCKED: reserving it double-invokes Viz.js (blocked live pass + our
  offscreen pass) and the second Viz worker hangs (e2e left raw DOT); left un-reserved so it renders live
  as before. (b) **echarts/mindmap** — canvas output, needs the echarts svg-renderer flip. (c) **markmap**
  — live d3 instance (no `data-processed`, 3-way DOM split). (d) **streaming (large-doc) opens** — finishInit
  (and thus the reserve) runs at stream `onDone`, after the per-chunk render already ran the engines, so
  no reserve win there (same limitation as the custom-diagram cache); (e) **mode-switch / theme-flip-back**
  native reuse (the reserve installs once per init). These are what the true host warm-open prerender —
  precompute hashes + ship SVGs inline with the initial payload — would additionally cover.

## Test plan (per the mandate)
- **Unit (vitest):** `hashOf` determinism + sensitivity (source/theme/lang/version change ⇒ different hash);
  `DiagramCache` get/put, LRU eviction, size-cap prune, disk read/write round-trip (tmp `globalStorageUri`),
  version-key invalidation.
- **Chromium harness e2e:** open a fixture, render a mermaid, spy the engine render count; re-trigger with an
  unchanged source (mode-switch/theme-flip-back) → assert ZERO engine invocations + identical svg.
- **Real-VS-Code e2e (`test/vscode-e2e`, xvfb):** THE acceptance — open a diagram file, let it render, CLOSE
  the tab, REOPEN it → assert each diagram is present with ZERO engine render (host-marker/render-counter
  proves the cache served it) and is correctly sized (no task-183 size jump). Plus: `getValue()` byte-
  identical with the cached SVG injected; edit a diagram → new hash → re-render → new cache entry; theme
  change → miss → re-render; forced disk-cache clear → falls back to a live render.
- Coverage verified on the new modules; `npm run lint:ci` + unit + real-VS-Code green, headless.

## Risks + rollback
- **Disk growth** — hard LRU size cap + prune; store under `globalStorageUri` (user-clearable).
- **Stale engine version** — `engineVersion`/`assetsVersion` in the key; bump on any engine re-pin.
- **Host↔webview hash agreement** — the webview is the authority on what it rendered (it posts the exact
  hash it computed); the host serves by that hash; Phase-3 host-precompute must use the identical source
  extraction + `themeKey`, with a live-render fallback on any mismatch.
- **Injected-SVG size jump** (the task-183 trap) — paint via the proven offscreen render+swap
  (`mermaid-retheme`), not a bare overlay created mid-spin.
- **Rollback:** the cache is now always on (the opt-in flag was removed per the user). It never changes
  the save path (cached SVG is `data-render="1"` → byte-identical getValue), and a cold cache / miss / the
  2 s host-reply timeout all fall back to a normal live render — so the worst case is the pre-cache
  behaviour. To hard-disable, revert the `installRenderCache` call in `finish-init.ts`.

## Acceptance criteria
- [x] Close a tab with rendered diagrams, reopen the file → diagrams appear with ZERO engine render (served
      from the host cache), correctly sized. — `diagram-cache.spec.ts`: reopen `cacheHit:true` +
      `hasEngineMarker:false` for all 3 d2; widths 219/227/241 == first open (±0px). (Custom SVG engines.)
- [x] **Native MERMAID + ABC + FLOWCHART (Phase 3):** reopen → each is served from cache with ZERO fresh
      render. — `diagram-cache-mermaid.spec.ts`: reopen `data-vmarkd-cache-hit` for all three; mermaid
      additionally BYTE-IDENTICAL svg (same `"mermaid"+genUUID()` id as first open — a fresh render would
      differ); widths 439/438/328 == first open; byte-identical getValue. No Vditor source patch.
      (graphviz BLOCKED — Viz.js double-invoke worker hang; echarts/mindmap canvas; markmap live-d3; streaming
      + mode-switch — all remain follow-ups.)
- [~] After a VS Code restart, reopening the same file still serves diagrams from the disk cache (Phase 2).
      — the DISK LAYER is implemented + unit-tested (round-trip: a fresh `DiagramCache` on the same dir
      serves the render; version bump wipes it). A true cross-restart real-VS-Code e2e isn't run (the
      harness can't cleanly restart VS Code mid-spec); the disk round-trip unit test is the proof.
- [x] `getValue()`/`serializeForHost()` byte-identical with cached SVGs injected vs a live render. —
      `diagram-cache.spec.ts` asserts `after.value === before.value`; injected div carries `data-render="1"`.
- [x] Editing a diagram → new hash → engine renders once → new entry cached; unchanged source → instant
      cache hit, zero engine invocation. — `hashOf` sensitivity (unit) + the reopen zero-render e2e.
      (Mode-switch/theme-flip-back reuse for native engines is Phase 3.)
- [x] **Fairness:** heavily editing ONE diagram does NOT evict the other diagrams' cached renders, and every
      diagram's LATEST render is always retained. — unit-tested rigorously with a tiny cap (edit A 40× →
      B/C + latest-A retained, A's early renders reclaimed; pinned set survives even over the cap); e2e:
      edit A + reopen → the other diagrams still cache-served.
- [x] Theme change / engine-version bump → miss (re-render), no stale SVG served. — themeKey + version
      folded into the hash (unit: theme/version change ⇒ different hash); disk store wiped on version
      mismatch (unit).
- [x] On-disk cache stays under its size cap (LRU prune verified). — unit: `persisted store stays under the
      byte cap`; pinned current-set preferentially retained.
- [x] Coverage + lint + unit + real-VS-Code suites green, run headless by the implementer. — unit 1127 pass;
      `diagram-cache.spec.ts` 2/2 pass headless (xvfb); `lint:ci` exit 0 (only pre-existing warnings);
      coverage: `diagram-cache-host.ts` 88% lines, `render-cache-client.ts` 89.7% lines (uncovered =
      defensive disk-error catches + the PUT observer, which the e2e exercises).

## Implementation notes (2026-07-01)
- **Files added:** `src/diagram-cache-host.ts` (pure `DiagramCache`, no vscode),
  `media-src/src/render-cache-client.ts`, `test/backend/diagram-cache-host.test.ts`,
  `media-src/src/render-cache-client.test.ts`, `test/vscode-e2e/diagram-cache.spec.ts`,
  `test/vscode-e2e/fixtures/diagram-cache.md`.
- **Files changed:** `src/protocol.ts` (3 message types + the `assetsVersion` config field), `src/extension.ts`
  (lazy `DiagramCache` on the provider + `diagram-cache-get`/`diagram-render-cached` handlers + register/close
  doc + `assetsVersion` in `collectConfigOptions`), `media-src/src/main.ts` (`setRenderCacheConfig` at init +
  config-reload + the `diagram-cache-hits` handler + `themeKey`),
  `media-src/src/finish-init.ts` (install the client BEFORE `observeCustomDiagrams`),
  `test/backend/manifest.test.ts` + `test/backend/editor-session.test.ts` (signature).
- **Deviation from the plan's module list:** PUT is done by a DOM MutationObserver in the client (walk
  rendered `.language-X svg`, dedupe by hash), NOT by editing each engine's completion point in
  `custom-diagrams.ts` — engine-agnostic + a much smaller, lower-risk diff (custom-diagrams.ts is
  unchanged). GET/skip-engine works by RESERVING blocks (`data-processed="true"`, which the engine
  skips) then filling hits / unblocking misses on the host reply.
- **Phase 3 (mermaid + abc + flowchart) — files (2026-07-01):** NEW `media-src/src/native-offscreen.ts`
  (generalised offscreen render→swap `renderNativeJobs(lang, jobs, cdn, theme)` + `nativeSourceForPane` +
  `NATIVE_CACHE_LANGS = [mermaid, abc, flowchart]`; the sandbox sets `color` from the live node so
  abc/flowchart bake the content-theme fg off-body; graphviz deliberately NOT in the map — Viz double-invoke
  hang). `media-src/src/mermaid-retheme.ts` (now delegates `reRenderMermaid` to `renderNativeJobs('mermaid')`).
  `media-src/src/render-cache-client.ts` (reserve each `NATIVE_CACHE_LANGS` preview target, hash from the
  marker source, `kind:'native'` miss → `renderNativeJobs(lang, …)` grouped by lang, native branch in
  `reportRenders`). `media-src/src/main.ts` (thread `cdn` + `mode` into the cache config). Tests:
  `render-cache-client.test.ts` (+native reserve/hit/miss incl. an abc generalisation case), fixture
  `diagram-cache.md` (+ mermaid/graphviz/abc/flowchart blocks; graphviz renders live, un-cached),
  `test/vscode-e2e/diagram-cache-mermaid.spec.ts` (parametrised over mermaid/abc/flowchart). NO
  esbuild/Vditor patch. The `MAX_POLL_FRAMES` in `renderNativeJobs` was raised to 1200 (a leak-guard only;
  normal renders exit on `done`) after finding a too-short cap starved the slower cold engine loads.
  Coverage: `render-cache-client.ts` ~90% lines; the offscreen native-miss render is exercised by the e2e.
- **docUri:** the webview does NOT send it; the host attaches its own panel's `activeUri`, so a webview
  can't pin renders under another document.
- **Always on (no flag), why:** originally shipped behind `vmarkd.advanced.diagramRenderCache` (default OFF,
  opt-in) like task 183's `stableRenderNode`; the user directed (2026-07-01) that the cache should always be
  on, so the setting was removed (package.json property, the protocol field, the extension read, and the
  webview `enabled` gate all deleted — `installRenderCache` now installs unconditionally). Safe as a default
  because engine coverage that isn't reused (graphviz/echarts/markmap + streaming/mode-switch) simply falls
  back to a normal live render, a cold cache / miss / 2 s host-reply timeout all fall back too, and the save
  path is untouched (cached SVG is `data-render="1"`). The e2e run WITHOUT setting any flag proves the cache
  is active by default.
