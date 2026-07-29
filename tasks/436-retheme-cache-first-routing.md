# Task 436 — Route the theme-flip re-render through the render cache

**Status:** 📋 **OPEN — split out of [411](411-d2-geo-retheme-double-fire-and-cache-bypass.md) on
2026-07-29** (its double-fire half is DONE; this is the half that turned out to be a design change,
not a wiring fix) · **Impact:** 🟡 only the flip-BACK case — a first flip to a new theme is a
guaranteed miss either way · **Origin:** Fable + Codex performance audits (2026-07-27), Codex #1

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

- [ ] Re-theme entry point (re-reserve + re-request), `post` stashed at install.
- [ ] Route `reRenderD2` through it; `reRenderGeojson`/`reRenderTopojson` next (verify both are
      actually `cacheable` in `engine-registry.ts` first — 411 flagged that as unchecked).
- [ ] Then the wavedrom/nomnoml/vega/vega-lite paths, which have the same bypass with a smaller
      payoff (already single-fire and change-gated).
- [ ] Unit test with a MOCKED cache client: live render NOT called on a hit, called on a miss.
- [ ] Real-VS-Code: not the hit branch (see above) — assert instead that the reserve/miss path still
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
