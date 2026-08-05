# Task 406 — Diagram render cache: hash width + synchronous hydration

**Status:** 🟢 DONE (2026-07-28) — **hash-width half (§1) DONE** (2026-07-27); **synchronous-
hydration half (§2) DONE** (2026-07-28) via [task 414](414-diagram-cache-sync-disk-io.md), which
is the SAME work and is now the owner — its status block has the measurement + implementation
detail; this file just points there rather than duplicating it. · **Impact:** 🟡 med (a hash
collision renders the WRONG diagram; hydration cost grows with the cache) · **Origin:**
Codex architecture review (2026-07-27)

> **🟢 §1 DONE — `hashOf` widened to 64-bit-class (2026-07-27):** `media-src/src/render-cache-client.ts`
> now runs FNV-1a as **two 32-bit lanes** with different offset-basis seeds, concatenated into a
> 16-hex-char key (was 8). TDD: added a failing test asserting `/^[0-9a-f]{16}$/` (verified RED
> against the old 8-char output) + a 2000-source zero-collision regression test, then implemented.
> Paired with a **deliberate cache-format-break tag**: `DiagramCache`'s `version` (`src/extension.ts`,
> the `diagramCache` getter) is now `` `${extensionVersion()}:h64` `` — a code-controlled suffix
> independent of the extension's user-facing semver, so shipping this forces exactly one clean disk
> wipe (per this task's own ask: "should be a deliberate version bump rather than an accident"),
> rather than leaving old 8-char and new 16-char keys mixed in the same index (which would have been
> harmless — different lengths never collide — but silent).
> **Re-measured against a REAL cache directory** (not the estimate in the Problem section):
> `~/.vscode-server/.../diagram-render-cache` — **170 entries, 4.15 MB total, sizes 1.9–170 KB
> (median 11.5 KB, mean 24.4 KB)**. At the mean size the 50 MB cap holds ~2048 entries (the Problem
> section's ~2500 estimate was the right order of magnitude); 32-bit collision probability at that
> n was ~0.049% — now irrelevant at 64-bit. Verified: 2 new + 34/34 in
> `render-cache-client.test.ts`, full unit suite 1793/1793, typecheck (host + webview) clean,
> `lint:ci` clean, and the **real-VS-Code e2e correctness proof**
> (`test/vscode-e2e/diagram-cache.spec.ts`, both specs: zero-engine-render-on-reopen + edit-doesn't-
> evict-siblings) green — 2/2, headless via `xvfb-run`. Also re-ran `abc-flip-cache-hit.spec.ts`
> (a THEME-FLIP cache hit — `themeKey` changes mid-session, a different path from reopen-with-the-
> same-key) — 1/1 green, closing a verification gap the first pass left.
> **Correction to the implementation comment:** the two FNV-1a lanes run the identical recurrence
> over the identical input string, so they are CORRELATED, not two independent 32-bit hashes —
> effective entropy is meaningfully under a true 64 bits, though still an enormous improvement over
> bare 32-bit and exactly task 406's own prescription ("two 32-bit rounds with different offsets,
> concatenated"). Comment in `render-cache-client.ts` corrected to say so.
> **§2 (lazy/async hydration) — DONE 2026-07-28, via task 414 (same work, now the owner):**
> measured first (50MB-cap bench: 157-252ms sync `ensureLoaded()`; ~9-20ms already at today's
> real 170-entry/4.15MB size), then implemented as **lazy per-blob hydration** — `index.json`
> stays a synchronous read (small, near-constant), but blob CONTENT is only read the first time
> `get()` is actually called for that hash. No `async`/await needed anywhere (every public method
> stayed synchronous), so `src/extension.ts` needed zero changes. After: 4.8-11.6ms at the same
> 50MB-cap bench — ~95% reduction. 4 new unit tests (hydration-count, totalBytes-from-index-alone,
> eviction-of-never-hydrated-entries, heal-loop "undefined"-write safety); full suite 1841/1841
> green. Full detail + the measured numbers live in
> [task 414](414-diagram-cache-sync-disk-io.md)'s status block — this entry doesn't repeat it.
> **Real-VS-Code e2e re-run — DONE 2026-07-28** (after task 405's concurrent `src/extension.ts`
> refactor landed and `node build.mjs` was green again, 0 tsc errors): `diagram-cache.spec.ts`
> 2/2 green + `abc-flip-cache-hit.spec.ts` 1/1 green, headless via `xvfb-run`, first attempt, no
> flakes. See task 414 for the full run detail.

## Problem

Two independent properties of the task-184 render cache, both fine at today's scale and
both scaling in the wrong direction.

### 1. The cache key is a 32-bit hash — a collision silently renders the wrong diagram

`media-src/src/render-cache-client.ts:123` `hashOf(lang, source)` is FNV-1a **32-bit**,
emitted as 8 hex chars, over `` `${lang} ${cfg.version} ${cfg.themeKey} ${source}` ``. The
host is a dumb hash-keyed store, so the hash is the **entire** correctness layer: two
different diagram sources that collide produce a cache HIT that paints the wrong SVG —
silently, with no error and no visual cue that anything is wrong.

Quantified rather than hand-waved: the store is capped at 50 MB
(`DEFAULT_MAX_BYTES`, `src/diagram-cache-host.ts:59`). At a typical rendered SVG of
~20–50 KB that is roughly 1 000–2 500 live entries. Birthday collision probability at
n = 2500 over a 2^32 space is about n²/(2·2^32) ≈ **0.07 %** — low, and it is why this is
🟡 and not 🔴. But the failure mode is *wrong content*, not a miss, and the cap is a
tuneable that could be raised.

The fix is cheap: widen the key. A 64-bit FNV-1a (or two 32-bit rounds with different
offsets, concatenated) keeps it dependency-free and deterministic, which are the only
properties the module's own header comment requires, and pushes the collision probability
into irrelevance. Note this **invalidates every existing cache entry** — acceptable, since
the cache already invalidates on `cfg.version`, but it should be a deliberate version bump
rather than an accident.

### 2. Hydration reads the index and every blob synchronously into extension-host memory

`src/diagram-cache-host.ts` `load()` does `fs.readFileSync(this.indexPath)` (`:113`), then
a `fs.readFileSync` **per blob** (`:125`) inside a loop, plus a `fs.readdirSync` (`:144`);
writes are `fs.writeFileSync` (`:320`, `:331`). Up to 50 MB of SVG text is pulled into the
extension host's memory and held there.

The mitigating fact — verify it before treating this as urgent — is that the cache is
**lazily** constructed (`src/extension.ts:1244`, `private get diagramCache()`, with an
explicit comment that disk is only touched on the first cache message). So this does **not**
block `activate()`; it blocks the first diagram-cache message of a session. That is a far
smaller problem than the review's "startup-blocking" framing implies, and this task should
say so rather than repeat it.

## Scope

- [x] Widen `hashOf` to a 64-bit-class key (FNV-1a 64 via two 32-bit lanes, or an
      equivalent dependency-free construction — the webview has no crypto guarantee worth
      pulling a dependency for). Keep it deterministic and synchronous.
- [x] Treat the change as a cache-format break: confirm the `cfg.version` component (or an
      explicit format tag) forces a clean rebuild rather than mixing 8-char and wider keys
      in one index. — `:h64` tag added at the `DiagramCache` construction site.
- [x] Re-measure and record the actual entry count and blob-size distribution from a real
      cache directory, so the collision math above rests on data rather than an estimate.
      — 170 entries / 4.15 MB / median 11.5 KB, see status block above.
- [x] Make blob reads/writes async, OR — **done: lazy per blob** — load the index eagerly
      (small) and read a blob only on the hash that is actually requested, so memory tracks the
      working set instead of the whole store. — DONE 2026-07-28 via
      [task 414](414-diagram-cache-sync-disk-io.md); see that task's status block for the
      measurement + implementation detail.
- [x] Confirm the lazy-construction claim above still holds after the change (the cache
      must not become an `activate()` cost). — holds: `ensureLoaded()` is still only triggered
      by the first cache message (unchanged trigger point), and is now CHEAPER than before
      (index-only parse instead of every blob), so if anything the activation-adjacency margin
      improved, not regressed.

## Out of scope

- Changing the eviction policy, the 50 MB cap, or the per-doc pinned-current-set fairness
  guarantee (task 184) — those are working as designed.
- The paint-from-cache scope (which engines are cacheable) — that is
  [task 404](404-renderer-runtime-adapter-registry.md)'s territory.

## Verification

- [x] Unit: `hashOf` is stable across calls for the same `(lang, source, themeKey, version)`
      and differs for a one-character source change; a corpus of the repo's diagram
      fixtures produces zero collisions. — existing determinism/sensitivity tests unchanged +
      2 new tests (16-hex-char format, 2000-source zero-collision corpus).
- [x] Real-VS-Code e2e per `AGENTS.md`: task 184's zero-render-on-reopen spec still passes
      (exact size match + byte-identical `getValue`) — that spec is the cache's correctness
      proof and must survive both changes. — `diagram-cache.spec.ts`, 2/2 green (headless,
      `xvfb-run`), including the sibling-eviction spec.
- [x] A cold-open with a populated cache directory shows no regression in time-to-first-paint.
      — measured via `tmp/414-bench/bench.ts` (see task 414): 157-252ms → 4.8-11.6ms at a
      50MB-cap-scaled disk store, an improvement rather than a regression. Real-VS-Code re-run
      (once task 405's concurrent `src/extension.ts` refactor landed and `node build.mjs` was
      green again): `diagram-cache.spec.ts` 2/2 + `abc-flip-cache-hit.spec.ts` 1/1, all green,
      first attempt, no flakes — see task 414's Verification section for the full detail.

## See also

- `media-src/src/render-cache-client.ts:123` (`hashOf`), `src/diagram-cache-host.ts`
  (`load`, `blobPath`, `DEFAULT_MAX_BYTES`), `src/extension.ts:1244` (lazy construction).
- Task [184](184-persistent-diagram-render-cache.md) (the cache itself and its guarantees),
  [352](../parked/352-plantuml-render-cost-rebuild-cache.md) / [348](348-plantuml-render-cache.md)
  (the PlantUML-specific cache work that shares this key).
