# Task 184 — Persistent diagram render→SVG cache (survives tab close + restart, warm-open reuse)

> **Status:** 📋 PLANNED. Engine-agnostic (mermaid, d2, echarts, graphviz, …). Grew out of the task-183
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
  offscreen path, not a raw overlay).
- **Phase 1 — host-memory cache (survives tab close):** `diagram-cache-host.ts` (memory only) + the message
  round-trip + webview paint-from-cache. Delivers the primary ask (instant reopen within a session).
  Behind `vmarkd.advanced.diagramRenderCache` (default ON once verified).
- **Phase 2 — disk persistence (survives restart):** `globalStorageUri` backing + LRU size cap + version key.
- **Phase 3 — warm-open integration:** host precomputes hashes + ships cached SVGs with the prerender so
  reopen paints diagrams pre-boot.

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
- **Rollback:** `vmarkd.advanced.diagramRenderCache=false` → engines always render live (current behaviour);
  each phase independently revertable; nothing changes the save path (cached SVG is `data-render="1"`).

## Acceptance criteria
- [ ] Close a tab with rendered diagrams, reopen the file → diagrams appear with ZERO engine render (served
      from the host cache), correctly sized.
- [ ] After a VS Code restart, reopening the same file still serves diagrams from the disk cache (Phase 2).
- [ ] `getValue()`/`serializeForHost()` byte-identical with cached SVGs injected vs a live render.
- [ ] Editing a diagram → new hash → engine renders once → new entry cached; unchanged source (mode-switch/
      theme-flip-back/duplicate) → instant cache hit, zero engine invocation.
- [ ] **Fairness:** heavily editing ONE diagram in a multi-diagram file does NOT evict the other diagrams'
      cached renders, and every diagram's LATEST render is always retained (real-VS-Code: edit A many times,
      then reopen → B/C/D still served from cache with zero engine render).
- [ ] Theme change / engine-version bump → miss (re-render), no stale SVG served.
- [ ] On-disk cache stays under its size cap (LRU prune verified).
- [ ] Coverage + lint + unit + real-VS-Code suites green, run headless by the implementer.
