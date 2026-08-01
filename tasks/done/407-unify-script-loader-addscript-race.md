# Task 407 — Delete `addScript()`: the same load race, fixed 3× point-wise, still ships for 6 engines

**Status:** ✅ DONE (2026-07-27) · **Impact:** 🔴 high (silent non-render, non-deterministic) · **Origin:** Codex branch review (2026-07-27), finding 5 — verified and escalated here

## Outcome

Fixed via strict TDD. Wrote a failing regression test first
(`custom-diagrams.test.ts`, describe block `renderGeojson + renderTopojson sharing
vditorLeafletScript (task 407)`): `renderGeojson` and `renderTopojson` both request
`vditorLeafletScript`; the test dispatches the topojson script's `load` event *before*
leaflet's, with `window.L` still unset at that point — reproducing the exact ordering the
review described. Verified RED (`expected null to be 'true'` on the topojson block's
`data-processed` attribute — it never rendered).

Fix: repointed all 7 remaining `addScript(...)` call sites (wavedrom `:275`, nomnoml `:341`,
geojson `:725`, topojson `:748-749`, vega `:885`, vega-lite `:898`, stl `:1031`) at the
existing `loadScript` import, then **deleted** `addScript` entirely — a drop-in swap, no other
changes needed since both share the same signature and never-reject behaviour. `addStylesheet`
was checked and left as-is: it's synchronous/void, nothing awaits it or reads a global it's
supposed to populate, so it can't observe a half-applied stylesheet the way a script load can be
observed half-executed (documented inline at its definition).

Verified GREEN: the new test passes, all 24 tests in `custom-diagrams.test.ts` pass, full
unit suite (1774/1774) green, typecheck clean, `lint:ci` clean (497 files), `node build.mjs`
clean, coverage ratchet OK (`npm run test:coverage && npm run check:coverage-modules` — no
new modules added, no regression).

**Follow-up filed, not smuggled in here:** the race is gone, but a genuinely *failed* CDN
load (not a race, an actual network failure) still silently blanks geojson/topojson/nomnoml/
stl — `loadScript` resolves on `onerror` too, and those four only show an error box from
their own render-time catch, never from a load failure. wavedrom/vega are already covered via
`faithfulRender`. → [task 410](410-loud-failure-on-script-load-failure.md).

## Problem

`media-src/src/custom-diagrams.ts:62-75` has a private `addScript(src, id)` whose dedup is
the naive one:

```ts
if (document.getElementById(id)) { resolve(); return }
```

That resolves the moment the `<script>` **tag exists** — not when it has **executed**. A
second concurrent caller for the same `id` therefore proceeds while the global it needs is
still undefined.

This exact race is **already diagnosed and fixed, three separate times**, each time
point-wise instead of at the primitive:

1. **Task 347 (PlantUML stdlib)** → `media-src/src/load-script.ts`. Its header comment is
   an autopsy of this bug: *"The old 'if the `<script id>` already exists, resolve' path let
   the 2nd caller resolve on the half-created tag — BEFORE the script had executed — so it
   read an unpopulated `window.__vmarkdPumlStdlib` (verified: mapKeys=0), its `!include
   <lib/…>` didn't expand, and the diagram failed to render ('Syntax Error' / mis-detected
   type), **non-deterministically**."* The fix was an in-flight `Map<id, Promise>` so
   concurrent callers share the real load.
2. **Task 165 (D2 engine bundle)** → `custom-diagrams.ts:468-470`, `d2EnginePromise`. Its
   comment names the culprit **by name**: *"the bare `addScript()` dedup (getElementById)
   resolves the moment the `<script>` tag EXISTS — before it has executed — so blocks 2..N
   would read an undefined global and boot-error."*
3. **`elk-layout.ts` `bootElk`** — the same shared-promise shape again.

`custom-diagrams.ts` already imports the fixed `loadScript` (`:16`) — but uses it at
**exactly one** site (`:477`, the D2 bundle). The other **seven** calls still go through the
defective `addScript`.

### Who is exposed

`addScript` call sites: `:286` (wavedrom), `:352` (nomnoml), `:736` (geojson→leaflet),
`:759-760` (topojson→leaflet + topojson-client), `:896` (vega), `:909` (vega-lite),
`:1042` (stl).

### Concrete repro — two engines sharing one script id

The race needs two overlapping loads of the **same id**. That is not hypothetical here,
because two *different* render functions load the *same* asset:

- `renderGeojson` (`:736`) and `renderTopojson` (`:759`) both load
  **`vditorLeafletScript`**.
- `renderVega` (`:896`) and `renderVegaLite` (`:909`) both load **`vditorVegaScript`**.

So a document containing **a `geojson` block and a `topojson` block** (or a `vega` and a
`vega-lite` block) triggers two concurrent same-id loads on open. Whichever render function
runs second resolves on the not-yet-executed tag.

### Why the failure is silent

Every call site has the same shape — await, then read a global and bail:

```ts
addScript(...).then(() => {
  if (!window.L) return        // ← undefined because the tag exists but hasn't run
  blocks.forEach(...)          //   never reached
})
```

Bailing on a missing global is correct **as an availability check**, but under this race it
turns a timing bug into a **silent non-render**: no error box, no log, no fallback — the
block just stays unrendered, non-deterministically. That is worse than a loud failure and
directly contradicts the faithful-by-construction principle the rest of the diagram layer
follows (`diagram-error.ts`, `faithful-render.ts`, task 151 item 7).

## Scope

The fix is a **drop-in substitution** — verified by reading all seven call sites:
`loadScript(src, id)` has the identical signature, identical never-reject / resolve-on-error
behaviour (`s.onerror = () => resolve()`), and adds only the in-flight sharing.

- [x] Repoint all seven `addScript(...)` calls at `loadScript` from `./load-script`.
- [x] **Delete** the private `addScript` so the defective primitive cannot come back. This is
      the point of the task — a fourth point-wise fix would leave the trap in place.
- [x] Check `addStylesheet` (`:78`) for the same shape. A stylesheet has no executed-global to
      race on, so it is probably fine as-is — but confirm rather than assume, and if it is
      fine, say so in a comment so the next reader doesn't re-open the question. **Confirmed
      fine** — comment added at its definition.
- [x] Consider whether `loadScript` should be the *only* exported loader (i.e. whether
      `d2EnginePromise` and `bootElk`'s bespoke caching can now collapse onto it). Do NOT
      force this — those two also cache the *resolved engine object*, not just the script,
      which is a different concern. **Left as-is** — `d2EnginePromise` layers "cache the read
      of `window.__vmarkdD2`" on top of `loadScript`'s "cache the script load," a genuinely
      different concern; the stale comment referencing the now-deleted `addScript` was updated
      to explain this instead.

## Out of scope

- The broader per-engine adapter restructure ([404](404-renderer-runtime-adapter-registry.md) /
  [409](409-split-custom-diagrams-into-engine-adapters.md)) — this fix must land
  **independently and first**; it is a bug fix, and it should not wait on a refactor.
- Making a failed load loud (an error box instead of a silent `return`). Genuinely worth
  doing and adjacent to task 151 item 7, but it is a behaviour change and belongs in its own
  task — record it there, don't smuggle it in here.

## Verification

- [x] **Unit** — added `renderGeojson + renderTopojson sharing vditorLeafletScript (task 407)`
      to `custom-diagrams.test.ts` (not `load-script.test.ts` — the bug was in
      `custom-diagrams.ts`'s OWN loader, not in `load-script.ts` itself, so the regression
      belongs where the buggy code lived). Verified RED before the fix, GREEN after.
- [x] **Real-VS-Code e2e** (per `AGENTS.md`'s webview mandate) — ran (not just inspected)
      `xvfb-run -a npm --prefix test/vscode-e2e test -- custom-diagrams-render.spec.ts` after
      `node build.mjs`. Its fixture (`fixtures/all-renderers.md`) already has **both** a
      `geojson` and a `topojson` block (sharing `vditorLeafletScript`) and **both** `vega` and
      `vega-lite` blocks (sharing `vditorVegaScript`) in the same document — the real-world
      repro this task needed, already in place. **1 passed** (16.9s): `leaflet:
      {"geojson":{"paths":4,"visible":true},"topojson":{"paths":2,"visible":true}}` — both
      render correctly under real concurrent loading. Updated the spec's top comment (it named
      `addScript`, now deleted).
- [x] Existing per-engine render specs stay green (wavedrom, nomnoml, vega, stl all pass in
      the same spec run — see the `info` dump in its output; the `stl` "Error creat…" text
      visible in that dump is a pre-existing three.js/environment quirk unrelated to this
      change, not a new failure — the spec asserts `stl.processed` ≥ its target count and it
      passed).

## See also

- `media-src/src/custom-diagrams.ts:62-75` (`addScript`), `:468-470` (the comment naming the
  bug), `:16`+`:477` (the one correct call), `media-src/src/load-script.ts` (the fix,
  task 347), `media-src/src/elk-layout.ts` (`bootElk`, the third instance).
- Tasks [347](347-plantuml-stdlib-include-expander.md)-family (where the in-flight map came
  from), [165](165-code-split-d2-pipeline.md) (`d2EnginePromise`),
  [151](151-typed-failloud-boundary.md) item 7 (faithful-by-construction — why a silent
  non-render is the wrong failure mode),
  [409](409-split-custom-diagrams-into-engine-adapters.md) (the restructure this must precede).
