# Task 411 — D2/geojson/topojson theme-flip: double-fire + cache-bypass

**Status:** planned — bug fix · **Impact:** 🔴 high (measured-adjacent: 2× a ~365ms D2 compile per flip, worse for docs with several D2/geo blocks) · **Origin:** parallel Fable + Codex performance audits (2026-07-27), Codex finding #1

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

- [ ] Collapse `reThemeGeoAndD2`'s double dispatch to a single deferred fire — drop the
      `requestAnimationFrame(run)` leg, keep `window.setTimeout(run, 400)` (matches what every
      other already-fixed group converged to: fire once, after the content-theme `<link>` /
      settings have settled).
- [ ] Route `reRenderD2` through a cache-GET-first check before falling back to a live render —
      the `hashOf`/local-map lookup pattern `paintCached` already uses on open
      (`render-cache-client.ts`) should generalize; only clear + live-render on an actual miss.
- [ ] Extend the same cache-GET-first routing to `reRenderGeojson`/`reRenderTopojson` (verify
      geojson/topojson are actually marked `cacheable` in `engine-registry.ts` — check before
      assuming, the audits didn't explicitly confirm this the way they did for D2).
- [ ] While touching this code: apply the same cache-GET-first routing to the wavedrom/nomnoml/
      vega/vega-lite re-render paths (mono group + `reThemeVega`) for the repeated-flip case.

## Out of scope

- Viewport-gating (only re-render visible diagrams) — that's [task 412](412-generalize-diagram-viewport-gating.md), a bigger, separate generalization of task 166's pattern.
- The off-thread D2 worker (task 182) — orthogonal; this task is about redundant *calls*, not per-call cost.
- Changing the cache's own hashing/eviction design (task 184) — this task only wires existing cache read/write into paths that currently skip it entirely.

## Verification

- [ ] Unit test asserting `reThemeGeoAndD2`'s deferred callback fires exactly once per
      `rethemeDiagrams` call (was: twice).
- [ ] Unit/integration test proving a cache HIT short-circuits `reRenderD2`/`reRenderGeojson`/
      `reRenderTopojson` without touching the live engine (mock the cache client, assert the
      live-render function is NOT called on a hit, IS called on a miss).
- [ ] Real-VS-Code e2e (webview-affecting change, per AGENTS.md): `test/vscode-e2e/retheme-flip-matrix.spec.ts`
      already exercises per-engine retheme correctness on a flip — extend it (or add a case) to
      assert exactly one live D2 render fires (not two) on first flip, ZERO on a flip back to a
      previously-seen theme (cache hit), rather than writing a new spec from scratch.
- [ ] No visual regression: D2/geojson/topojson still re-theme correctly on every path that
      needs it (content-theme flip, `geoBasemap` change, `d2Layout`/`d2Theme` change) — re-run
      `retheme-flip-matrix.spec.ts` in full.
