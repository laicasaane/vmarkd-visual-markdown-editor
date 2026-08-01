# Task 411 — D2/geojson/topojson theme-flip: double-fire + cache-bypass

**Status:** ✅ **DONE as scoped (2026-07-29) — the double-fire is fixed and pinned; the cache-first
routing moved to [436](436-retheme-cache-first-routing.md)** (see "What the cache half turned out to
be" below — the user's call after the finding was surfaced) · **Impact:** 🔴 high (measured-adjacent:
2× a ~365ms D2 compile per flip, worse for docs with several D2/geo blocks) · **Origin:** parallel
Fable + Codex performance audits (2026-07-27), Codex finding #1

## Result

The rAF leg is gone; `reThemeGeoAndD2` fires ONCE per flip. It was not merely a redundant render but
the **wrong** one: it lands ~16 ms in, before the content-theme `<link>` settles — which is the whole
reason this group is deferred 400 ms — so it painted the pre-flip palette and was immediately
overwritten. Every flip now pays one D2 WASM compile + layout per diagram instead of two, and one
tile fetch per map instead of two.

⚠️ This group remains **UNGATED** by design, and "fires once" must not be read as "fires only when
something changed": unlike every other group it has no change-gate, because a `geoBasemap` /
`d2Layout` / `d2Theme` change must re-render without moving the editor foreground that a poll could
observe (task 164 §3).

Pinned at two layers, both RED-checked by re-adding the rAF leg:
- unit (`diagram-retheme.test.ts`) — counted at the ENGINE entry point, not on the timers: what the
  bug cost was live renders, and a timer assertion would keep passing if the two legs were ever
  merged into one callback that still ran the engine twice.
- real VS Code (`retheme-flip-matrix.spec.ts`) — a new `__vmarkdD2RenderStats.compiles` counter in
  `renderD2`, because the double-fire was **invisible in the DOM** (both fires produce the same SVG,
  the second overwriting the first), so the spec's existing element census could never have caught
  it. Measured 13 compiles per flip for the fixture's 13 D2 blocks; 26 with the leg restored.

## What the cache half turned out to be

Bullets 2-4 below assumed the cache-GET "should generalize" from the open path. It does not:
`setRenderCacheConfig` **clears the local SVG map whenever `themeKey` changes**, and a flip changes
`themeKey` by definition — so a local GET after a flip can never hit, and a hit requires the async
host round-trip. That is a design change with a real ordering-race surface, and its payoff is
confined to flipping BACK to an already-rendered theme. Split into
[436](436-retheme-cache-first-routing.md) with the full analysis rather than folded in here.

## Problem

`media-src/src/diagram-retheme.ts` is the single re-theme authority (task 152 item 3). Every
other engine group in it was fixed by task 164 to fire **once**, gated on an actual change
(mermaid/echarts/mindmap: signature-gated; mono group + flowchart/vega: settled-foreground
poll). `reThemeGeoAndD2` (lines 166–178) was deliberately left un-pollable (correctly — geo
must also react to a `geoBasemap`-only setting change, D2 to `d2Layout`/`d2Theme`, neither of
which moves the editor foreground) but that only justifies the deferred-poll-free trigger, not
what actually ships:

```ts
requestAnimationFrame(run)
window.setTimeout(run, 400)
```

Both calls are unconditional — `run()` (which calls `reRenderD2`/the geo re-renders) fires
**twice**, every single theme flip, with no change-gate at all.

Compounding this: `reRenderD2` (`custom-diagrams.ts:586-602`), `reRenderGeojson` and
`reRenderTopojson` (`custom-diagrams.ts:777-787`) unconditionally clear `data-processed` and
re-invoke the live engine — verified by reading the code: no cache-GET check anywhere in these
functions — even though D2 is `cacheable: true` in `engine-registry.ts` and the render-cache
observer (`reportRenders`, `render-cache-client.ts:152`, wired via `installRenderCache` in
`finish-init.ts:178`) is running persistently. A theme flip pays a full D2 WASM-compile + ELK/
dagre layout **twice** per diagram, and a geojson/topojson doc with a remote basemap re-fetches
tiles **twice** — with zero reuse even when flipping back to a previously-rendered theme.

Wavedrom/nomnoml/vega/vega-lite re-render (mono group + `reThemeVega`) have the same
cache-bypass pattern, but lower incremental impact — they're already single-fire and
change-gated, so the bypass only matters on a repeated flip between the same known themes.
Bundled into this task's cache-routing fix rather than filed separately.

## Scope

- [x] Collapse `reThemeGeoAndD2`'s double dispatch to a single deferred fire — drop the
      `requestAnimationFrame(run)` leg, keep `window.setTimeout(run, 400)` (matches what every
      other already-fixed group converged to: fire once, after the content-theme `<link>` /
      settings have settled).
- [ ] → [436](436-retheme-cache-first-routing.md): Route `reRenderD2` through a cache-GET-first check before falling back to a live render —
      the `hashOf`/local-map lookup pattern `paintCached` already uses on open
      (`render-cache-client.ts`) should generalize; only clear + live-render on an actual miss.
- [ ] → [436](436-retheme-cache-first-routing.md): Extend the same cache-GET-first routing to `reRenderGeojson`/`reRenderTopojson` (verify
      geojson/topojson are actually marked `cacheable` in `engine-registry.ts` — check before
      assuming, the audits didn't explicitly confirm this the way they did for D2).
- [ ] → [436](436-retheme-cache-first-routing.md): apply the same cache-GET-first routing to the wavedrom/nomnoml/
      vega/vega-lite re-render paths (mono group + `reThemeVega`) for the repeated-flip case.

## Out of scope

- Viewport-gating (only re-render visible diagrams) — that's [task 412](412-generalize-diagram-viewport-gating.md), a bigger, separate generalization of task 166's pattern.
- The off-thread D2 worker (task 182) — orthogonal; this task is about redundant *calls*, not per-call cost.
- Changing the cache's own hashing/eviction design (task 184) — this task only wires existing cache read/write into paths that currently skip it entirely.

## Verification

- [x] Unit test asserting exactly one live re-render per `rethemeDiagrams` call (was: two) —
      counted at the engine, not on the timers; RED-checked.
- [ ] → [436](436-retheme-cache-first-routing.md), and note it needs a MOCKED cache client: the real
      hit branch is invisible under `VMARKD_E2E=1` (the store is wiped per test). Was: test proving a cache HIT short-circuits `reRenderD2`/`reRenderGeojson`/
      `reRenderTopojson` without touching the live engine (mock the cache client, assert the
      live-render function is NOT called on a hit, IS called on a miss).
- [x] Real-VS-Code e2e: `retheme-flip-matrix.spec.ts` extended with the D2 compile counter —
      exactly one live render per block per flip (13/13, was 26). The "ZERO on a flip back" half
      goes to [436](436-retheme-cache-first-routing.md) and cannot be written in this harness at all.
- [x] No visual regression: the same spec's colour-digest + per-family census assertions stayed
      green, i.e. D2/geojson/topojson still re-theme correctly on every path that
      needs it (content-theme flip, `geoBasemap` change, `d2Layout`/`d2Theme` change) — re-run
      `retheme-flip-matrix.spec.ts` in full.
