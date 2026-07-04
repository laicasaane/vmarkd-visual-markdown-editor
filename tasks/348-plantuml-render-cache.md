# Task 348 — PlantUML in the persistent render cache (instant reopen)

> **Status:** ✅ DONE (2026-07-04). PlantUML now rides the task-184 render cache as a dedicated
> **LIVE-miss** tier, so reopening a document paints its diagrams from the host cache with ZERO engine
> render. Measured (real VS Code, 5 C4/AWS/Azure diagrams): first open ~7.7–10.8 s (cold, unchanged),
> **reopen ~1.5–2.0 s** (warm) — a **4–6× speed-up**, deterministic 5/5 cache hits across 4 runs.
> Builds on 347 (loadScript dedup + render-queue serialisation — the safety this rides on) and 184
> (the cache itself).

## Why the cache didn't cover PlantUML before
PlantUML was `cacheable: false` (engine-registry.ts). The task-184 cache had two tiers — CUSTOM
(d2/wavedrom/nomnoml/vega, observer re-trigger on miss) and NATIVE-OFFSCREEN (mermaid/abc/flowchart,
`renderNativeJobs` on miss). PlantUML fit neither cleanly and (with graphviz) was left out. graphviz is
excluded for a HARD reason — reserving it double-invokes Viz.js (Vditor's renderer still calls
`Viz.instance()` on a reserved block, then the offscreen miss calls it again → the second Viz worker
hangs). PlantUML shares Viz.js, which is why the same suspicion hung over it — but the registry comment
already flagged the real status: *"plantuml … simply not cached yet."*

## Why PlantUML is actually SAFE to reserve (verified empirically)
Our `plantumlRender` is OUR code and, unlike Vditor's built-in graphviz renderer, it **cleanly skips any
`data-processed` block up front** (plantuml-render.ts) — BEFORE loading the engine or Viz.js. So a
reserve makes the whole engine path a no-op for that block: **Viz.js is never invoked → no double-invoke,
no hang.** Confirmed: the 5-diagram repro renders all blocks with the reserve in place, deterministically
(`plantuml-multiblock.spec.ts` still green; the new cache spec renders 5/5 every run).

## Design — a third cache tier: reserve + paint + LIVE-miss
PlantUML is NOT put in the offscreen tier because our engine sets `data-processed` EARLY (before the
async render), which the offscreen poll (`native-offscreen.ts`) would mis-read as "done" and swap an
empty node. Instead (all in `render-cache-client.ts`, `NATIVE_RESERVE_LANGS = [...NATIVE_CACHE_LANGS,
'plantuml']`):
- **Reserve** (on open, synchronous in finish-init — same ordering contract as the native engines):
  set `data-processed` on each `.vditor-ir__preview .language-plantuml` target; hash from the editable
  marker source (`nativeSourceForPane`); request the cached SVGs from the host.
- **HIT:** paint the stored SVG into the live node (`data-vmarkd-cache-hit`, `data-render="1"`), keep
  `data-processed` → the engine never runs. Zero engine work, byte-identical svg, byte-identical
  `getValue()`.
- **MISS:** un-reserve (drop `data-processed`) and re-call `plantumlRender(root, cdn)` ONCE — it re-scans,
  skips the still-reserved hits, and renders the unblocked blocks **live/incrementally** with their own
  task-139 "Rendering…" placeholder (so first-open UX is unchanged). Its render queue + loadScript dedup
  (task 347) serialise the misses exactly like a normal open.
- **PUT:** after any plantuml render lands, report `{hash, svg}` to the host (marker source → hash),
  same observer as the other engines.

Kept as an explicit named tier here rather than flipping the registry `cacheable` flag: that flag is
coupled (engine-registry.test.ts) to the offscreen `RENDERERS` set, which plantuml's live-miss path is
deliberately not part of. The registry `cacheable` JSDoc now says so.

## Files
- `media-src/src/render-cache-client.ts` — the plantuml tier (NATIVE_RESERVE_LANGS, `kind: 'plantuml'`
  reserve, live-miss re-render, `cacheRoot` capture, PUT).
- `media-src/src/engine-registry.ts` — `cacheable` JSDoc updated (plantuml IS cached, via the live-miss
  tier; flag stays false because it means the offscreen tier).

## Tests
- `test/vscode-e2e/plantuml-cache.spec.ts` (NEW) — cold open renders 5/5 (no hit marker), reopen serves
  5/5 from cache (`data-vmarkd-cache-hit`, byte-identical svg, unchanged `getValue`), and `warmMs <
  coldMs/2`. Logs `coldMs/warmMs/hits`. Deterministic 4/4 runs (5/5 hits, warm ≈ ¼ cold).
- `media-src/src/render-cache-client.test.ts` — 3 new unit tests: plantuml reserve (marker hash), HIT
  (paint + no engine work), MISS (un-reserve + `plantumlRender(root, cdn)`, NOT `renderNativeJobs`).
- No regression: `diagram-cache-mermaid` / `diagram-cache` e2e green; all 10 other plantuml e2e green;
  full unit 1314 pass; typecheck + `lint:ci` clean.

## Notes / non-goals
- First open is unchanged (~7–8 s cold) — the cache only removes the REPEAT-open cost. Warm-loading the
  engine to shrink the first open is task 139's parked option 2 (separate).
- A theme flip changes `themeKey` → different hash → next open is a miss (correct: re-render for the new
  palette). Live flips are still handled by `rethemeDiagrams` ('mono' plantuml path).

## Related
Task 347 (the concurrency safety this rides on), 184 (the cache), 139 (placeholder + the ~1 s/block cost
that makes reopen worth caching), 87/136 (the engine + stdlib).
