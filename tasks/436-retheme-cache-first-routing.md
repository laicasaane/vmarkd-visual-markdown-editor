# Task 436 — Route the theme-flip re-render through the render cache

**Status:** ✅ **DONE (2026-07-29), same day it was split out of
[411](411-d2-geo-retheme-double-fire-and-cache-bypass.md)** — implemented on request after the
risks below were surfaced. · **Impact:** 🟡 only the flip-BACK case — a first flip to a new theme is
a guaranteed miss either way · **Origin:** Fable + Codex performance audits (2026-07-27), Codex #1

## Result

`rethemeCacheFirst(root, langs)` (render-cache-client.ts) reserves the ALREADY-RENDERED blocks of the
given langs and asks the host, exactly as the open path does; hits are painted, misses fall through
to the live engine. Every re-theme call site now goes through `cacheFirstThen()` in
`diagram-retheme.ts` — d2, the mono group (wavedrom/nomnoml among natives that simply find nothing),
and vega/vega-lite.

**A prerequisite bug had to be fixed first, and it is the more valuable half of this task.** A VS Code
colour-theme flip arrives as `set-theme` and NOTHING else — the host posts only that command
(`editor-session.ts`, `onDidChangeActiveColorTheme`) — but the cache's `themeKey` is
`mode|contentTheme|fontSize`. `handleSetTheme` never touched the cache config, so after a workbench
flip the key stayed at the PRE-flip mode: every render PUT afterwards was filed under the wrong
mode, and a later open in that mode could be served those SVGs — **wrong colours out of the cache,
not merely a miss**. Only `contentTheme: auto` drifted (a theme that pins its own light/dark keeps
`effectiveThemeKind` stable). Fixed in `handleSetTheme`, RED-checked, and it is what makes a
cache-first lookup possible at all: hashing under a stale key would "hit" on the pre-flip render and
paint exactly the colours the flip was supposed to change.

**How the ordering risk was removed rather than managed.** The reserved blocks KEEP the
`data-processed` they already carry, so no observer can start an engine pass while the reply is in
flight — there is never a window in which the block looks renderable. Until the reply lands the user
keeps seeing the previous render, which is what already happens during the 400 ms deferral and the
async compile after it. Blocks are hashed from `data-code`, the same attribute `reportRenders`
hashes on PUT, so GET and PUT keys agree by construction. A block that has not drawn yet is skipped
(its first render is already producing the current theme).

**geojson/topojson are out — verified, not assumed.** Both are `cacheable: false` in the engine
registry (their render is a live Leaflet map, not an SVG), so 411's geo bullet was void rather than
unimplemented. `rethemeCacheFirst` declines them and the caller re-renders live, unchanged.

## The bug this uncovered — cache POISONING on every flip (the real find)

The first implementation shipped a regression the unit tests could not see and `retheme-flip-matrix`
caught: **D2 stopped following the theme entirely.** Measured, not guessed — the numbers came from a
temporary counter and a D2-only colour digest:

```
d2 compiles: open=13  afterFirstFlip=13  afterSecondFlip=13   (i.e. ZERO live renders per flip)
D2 colours:  dark != light → FALSE                            (the drawing never changed)
```

Root cause, and it **pre-dates this task**: `reportRenders` is driven by a MutationObserver, so it
fires on the mutations a theme flip itself causes — while `themeKey` has already moved (the flip
handler updates it first) and the blocks still hold the render made under the OLD key, because the
re-theme is deferred 400 ms. Every flip therefore filed the PRE-flip SVGs under the POST-flip key.
Before this task nothing ever read those entries on a flip, so the poison sat there silently and
would surface only as "a reopened document shows the other theme's diagrams". Task 436's lookup
reads exactly those keys, so it painted the stale render straight back — turning a latent data bug
into a visible one.

**Fix: the block carries the key its current markup was produced under** (`data-vmarkd-render-key`,
`RENDER_KEY_ATTR` in `diagram-dom.ts`), and `put` refuses to report a block whose stamp is stale.
The stamp is dropped by `findBlocks` and `resetCustomBlocks` — the two places that hand a block to
an engine for a redraw — so a real re-render reports normally.

Comparing MARKUP instead was tried first and is **not sound**, which the measurement showed rather
than an argument: a cached paint re-namespaces the svg's ids (task 373) and the sizing passes
rewrite width/height, so a block that was merely REPAINTED reads as changed (`putNewKey …
markupChanged=true` for all 12 blocks). Normalising with `stripSvgIdNamespace` was not enough
either. The stamp does not depend on bytes at all.

⚠ **Scoped to the CUSTOM family on purpose.** The guard applies only where the two redraw entry
points are ours and clear the stamp. The native engines (mermaid/abc/flowchart/plantuml) redraw
through their own paths, which would never clear it — they would simply stop being cached after the
first flip. Their exposure to the same poisoning is **pre-existing and unchanged**, and is worth its
own task: the fix needs a per-engine "about to redraw" hook that does not exist today.

## Verified

- Unit: 6 tests for the lookup (reserve without un-processing, hit paints, miss un-blocks, the hash
  follows the new key, non-cacheable declined, not-yet-drawn declined) + 2 for the stale-render
  guard, RED-checked by removing the guard.
- Real VS Code (`retheme-flip-matrix.spec.ts`), now asserting the actual contract rather than the
  old "always re-renders": a **no-op flip runs the engine zero times** (the win: 12 WASM compiles
  saved), a **real light/dark change re-renders every drawn block exactly once** (not zero — the
  regression above — and not twice, task 411's double-fire), and **D2's colours really change
  across the flip**, asserted on the rendered fills rather than on a counter. The workbench theme is
  now pinned before the document opens, so "no-op" and "real" mean something deterministic.
- The hit branch itself stays unassertable in this harness (`VMARKD_E2E=1` wipes the store per
  test) — as predicted when the task was split out.

## What 411 assumed, and what is actually there

411 said the cache-GET on re-render "should generalize — the `hashOf`/local-map lookup pattern
`paintCached` already uses on open". Read closer before building on that:

`setRenderCacheConfig` (`render-cache-client.ts`, the `version`/`themeKey` guard) **clears
`localSvgByHash` whenever `themeKey` changes** — deliberately, because both fragments are folded
into every hash, so the whole map becomes unreachable at once. A theme flip changes `themeKey` by
definition. **A local cache-GET after a flip can therefore never hit.** The only path to a hit is the
host round-trip `reserveAndRequest` → `diagram-cache-get` → `applyCacheHits`.

That is not a lookup you drop into `reRenderD2`; it is a different execution model.

## What building it actually involves

1. A re-theme entry point in `render-cache-client.ts` that re-reserves the affected blocks and
   re-requests them. It needs `post`, which today only `installRenderCache` holds — stash it the way
   `cacheRoot` already is.
2. **The re-render path becomes ASYNC.** `reRenderD2`/`reRenderGeojson`/`reRenderTopojson` return
   with the blocks reserved and not yet drawn; every caller that assumes "drawn on return" has to be
   checked, including `diagram-retheme.ts`'s deferred `run()` and the specs that sample right after.
3. **Ordering.** The open path is sequenced so `installRenderCache` reserves BEFORE the first
   custom-diagram pass (`finish-init.ts`). Mid-session there is no such guarantee:
   `paintLocalHits`'s MutationObserver and `observeCustomDiagrams`' rAF pass both race a re-reserve.
   This is the part most likely to produce a "sometimes a block stays blank" bug.
4. **The hit branch is invisible to the e2e suite.** `playwright.config` sets `VMARKD_E2E=1` →
   `DiagramCache` freshStart wipes the store per test, so every suite render is a MISS by
   construction (the code says so at the `paintCached` hit site). 411's asked-for assertion — "ZERO
   live renders on a flip back to a previously-seen theme" — **cannot be written against the real
   cache in that harness.** It needs a mocked cache client at the unit layer, plus a manual check.

## Scope, if picked up

- [x] Re-theme entry point (re-reserve + re-request), `post` stashed at install.
- [x] Route `reRenderD2` through it; `reRenderGeojson`/`reRenderTopojson` next (verify both are
      actually `cacheable` in `engine-registry.ts` first — 411 flagged that as unchecked).
- [x] Then the wavedrom/nomnoml/vega/vega-lite paths, which have the same bypass with a smaller
      payoff (already single-fire and change-gated).
- [x] Unit tests (the real client + a jsdom DOM, which turned out stronger than a mock): live render NOT called on a hit, called on a miss.
- [x] Real-VS-Code: not the hit branch (see above) — assert instead that the reserve/miss path still
      draws every block exactly once, extending `retheme-flip-matrix.spec.ts`'s D2 compile counter
      (`__vmarkdD2RenderStats`, added by 411).

## Worth weighing before starting

The payoff is confined to flipping BACK to a theme already rendered this session or a previous one:
a first flip to a new theme misses either way and pays the full render. Against that: an async
re-theme path plus a mid-session reserve race, in the code that had the "flip destroys the abc
score" class of bug (task 361). Measure how often a real flip-back happens before spending it.

## Related
[411](411-d2-geo-retheme-double-fire-and-cache-bypass.md) (the done half),
[412](412-generalize-diagram-viewport-gating.md) (viewport gating — orthogonal),
[184](184-persistent-diagram-render-cache.md)/[406](406-diagram-cache-hash-width-and-hydration.md)/[408](408-per-engine-config-delta-and-cache-key.md) (the cache itself).
