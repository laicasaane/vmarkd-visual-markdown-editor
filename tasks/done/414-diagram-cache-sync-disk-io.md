# Task 414 — `DiagramCache.ensureLoaded()` blocks the extension host on synchronous disk I/O

**Status:** 🟢 DONE (2026-07-28) — measured, then fixed via lazy per-blob hydration (same work
as [task 406](406-diagram-cache-hash-width-and-hydration.md) §2; this file is now the owner of
that work — 406 §2 points back here). · **Impact:** 🟡 low-medium (bounded, one-time per
session, but on the shared extension-host thread) · **Origin:** parallel Fable + Codex
performance audits (2026-07-27) — found independently by both

> **Measured (gate, `tmp/414-bench/bench.ts`, throwaway, gitignored):** a fresh `DiagramCache`
> reading a disk store scaled to the 50 MB cap (2385 entries, distribution modeled on the real
> sample: 60% ~2-15 KB / 30% ~15-40 KB / 10% ~40-170 KB) — `ensureLoaded()` (via the first
> `get()`, matching the real first-cache-message path) cost **157-252 ms** across 3 runs (old,
> synchronous, read-every-blob implementation). Split: the per-blob `readFileSync` loop was the
> dominant share (~70-80 ms warm-cache-adjusted; the cold first pass inside `ensureLoaded()`
> itself, before the OS page cache warms, is the ~150-250ms figure above), the `gcOrphanBlobs`
> readdir+stat sweep a smaller share (~10-15 ms). At TODAY's real cache size (170 entries /
> 4.15 MB, task 406's own re-measurement) the equivalent cost is **~9-20 ms** — at or just past
> the task's own "sub-10ms, not worth it" bar already, and scaling toward the cap. Decision:
> **worth fixing**, and cheaply — see Scope.
>
> **After (same bench, same 50 MB / 2385-entry populated dir, same `ensureLoaded()`-via-`get()`
> measurement):** **4.8-11.6 ms** across 3 runs — a **~95% reduction** (157-252ms → ~5-12ms) —
> because `ensureLoaded()` now parses only `index.json` (bytes+lastUsed per hash) and defers
> reading blob CONTENT to the first `get()` of that specific hash. In the real first-cache-
> message path a doc has a handful of diagrams (not 2385), so the real-world win is larger
> still: the old code paid for the WHOLE store on every session's first cache hit-check
> regardless of the open doc's size; the new code pays only for the index parse (small,
> constant-ish) plus O(diagrams-in-this-doc) individual blob reads.

## Problem

`src/diagram-cache-host.ts:109-137` (`ensureLoaded`) is lazy-loaded on the FIRST diagram-cache
message per session — correctly off the activation critical path for documents with no
diagrams. But the load itself, when it does fire, is a **synchronous** `fs.readFileSync` call
**per cached blob** (cache cap: `DEFAULT_MAX_BYTES`, 50MB default) plus a `fs.readdirSync` +
`statSync` orphan-GC sweep (`gcOrphanBlobs`) — all on the extension host thread, which also
serves every other VS Code extension-host RPC for this and every other extension.

For a long-lived VS Code session with a well-populated cache (many previously-opened diagram-
heavy docs), this could be a few hundred synchronous file reads blocking the host process for a
noticeable stretch, right at the moment the first diagram-heavy file is opened in that session.

Neither audit measured the actual magnitude (no profiling run against a populated 50MB cache) —
this is a real, unambiguous mechanism, but unconfirmed impact.

## Scope

- [x] Measure first: populate a cache near the 50MB cap (many small SVG blobs, realistic file-
      size distribution) and profile `ensureLoaded()`'s actual wall-clock cost on the extension
      host. If it's sub-10ms even at cap, this may not be worth the churn — record the number
      either way before deciding to proceed. — done, see the measured block above (157-252ms
      at cap; ~9-20ms already at today's real size).
- [x] If worth fixing: ~~convert the per-blob `readFileSync` loop to async~~ — **chose lazy
      per-blob hydration instead** (task 406 §2's own "likely better" alternative): `index.json`
      is still read synchronously (small, near-constant cost), but blob CONTENT is only read the
      first time a specific hash is actually requested via `get()`. This eliminates the
      O(store-size) cost entirely rather than moving it off-thread, and needs no `async`/await
      anywhere — every public method stays synchronous, so no caller (including
      `src/extension.ts`) needed to change. The `gcOrphanBlobs` readdir+stat sweep was
      DELIBERATELY left synchronous (see "GC sweep stayed synchronous" below) — it's a small
      share of the cost (~10-15ms of ~150-250ms at cap) and an existing test
      (`test/backend/diagram-cache-host.test.ts` — "orphan blobs are GC-ed on load once aged")
      depends on the sweep completing before the first `get()` returns.
- [x] Preserve the existing behavior contract: cache must be fully loaded (or determined absent)
      before the first diagram-cache-hits reply is sent — an async conversion must not
      accidentally let a request race an incomplete load. — **satisfied structurally, not by a
      guard**: `ensureLoaded()` is still fully synchronous (index parse + GC sweep), so by the
      time it returns, every hash the store knows about (and its total size) is known — just not
      yet its blob content. There is no async/partially-loaded window to race in the first
      place. `get()`'s lazy hydration read is itself synchronous too (a single `readFileSync`),
      so no request ever sees a promise or an intermediate state.

### GC sweep stayed synchronous — why

`gcOrphanBlobs` (readdirSync + statSync, no blob content read) was considered for deferral via
`setImmediate` per 406 §2's phrasing, and profiled separately (see the measured block): it's a
real but minor share of the total (~10-15ms of ~150-250ms at the 50MB cap). Deferring it would
have required changing an EXISTING test's synchronous assumption (`"orphan blobs are GC-ed on
load once aged; fresh strays survive the grace window"` asserts the aged orphan is gone
immediately after `get()` returns) for a marginal additional win once the dominant cost (the
per-blob read loop) was already eliminated by lazy hydration. Not done — flagged here rather
than silently skipped.

## Out of scope

- The cache's hashing/eviction/pinning design (task 184) — this task is purely about the I/O
  being synchronous, not about what's cached or for how long.
- Any change to when `ensureLoaded()` first fires (already correctly lazy/off-activation).

## Verification

- [x] Before/after profiling numbers (extension-host thread block time) at a realistic populated-
      cache size — this task isn't done until there's a measured before/after, not just "made it
      async." — 157-252ms → 4.8-11.6ms at the 50MB-cap bench (see measured block above);
      ~9-20ms → sub-ms at today's real 170-entry/4.15MB size (only a single hash is hydrated per
      `get()` call, and a doc's first cache-hits check touches only its own diagrams' hashes).
- [x] Unit test for the (lazy-hydration) load path: 4 new tests in
      `test/backend/diagram-cache-host.test.ts` — hydrates only the requested blob on restart
      (`memoryEntries` goes 0→1→2 as each hash is individually requested, not 0→2 on the first
      `get()`); `totalBytes` is correct from the index alone before any hydration; eviction can
      reclaim disk-only (never-hydrated) LRU entries without ever reading their blob; the
      `flushNow()` heal-loop never writes a literal `"undefined"` blob for an un-hydrated entry
      (the hazard a naive single-map implementation would hit — avoided here structurally by
      keeping hydrated (`entries`) and not-yet-hydrated (`diskOnly`) as separate maps, so the
      heal loop, which only iterates `entries`, never sees an entry without its `svg` in hand).
      Full suite: 1841/1841 green (grew from 1793 baseline — other agents' concurrent work +
      these 4 additions).
- [x] Real-VS-Code e2e: diagram-cache-hit round trip still works correctly after the conversion
      (a doc with cached diagrams opens showing cached SVGs, not a live re-render). — RUN
      2026-07-28 after task 405 landed (`node build.mjs` green, 0 tsc errors):
      `diagram-cache.spec.ts` 2/2 green (`reopen serves every diagram from cache: zero engine
      render, correct size, byte-identical save`; `editing one diagram does not evict the other
      diagrams from the cache`) and `abc-flip-cache-hit.spec.ts` 1/1 green (`a cached abc render
      survives a theme flip`) — all headless via `xvfb-run`, first attempt, no flakes/re-runs.
