# 361 — abc score disappears permanently on a theme flip

**Status: ✅ FIXED** (product fix + unit tests + strengthened e2e guard)

## Symptom

Flip the VS Code colour theme with a document containing an ```abc``` block: the rendered music
score **vanishes** and never comes back. The preview node is left completely EMPTY (no SVG, no error
box, no source text) while still carrying `data-processed="true"`, so nothing ever re-renders it.

User-visible, permanent, and silent — the same "renders nothing, says it's done" family as task 360.

## Root cause

A chain of three individually-reasonable behaviours:

1. **The patched `abcRender` keeps its source in `data-code`** (`patchAbcRender`,
   `media-src/esbuild-shared.mjs`) — it has to, because the rendered SVG clobbers `textContent`:
   ```js
   var abcCode = (item.getAttribute("data-code") || abcRenderAdapter.getCode(item) || "").trim();
   if (!abcCode) return;              // ← bails out silently when the source is gone
   item.setAttribute("data-code", abcCode);
   ```
2. **The first render happens OFF-SCREEN** (`native-offscreen.ts`): abc is one of the three native
   engines that render into a hidden sandbox and get swapped into the live node. The swap did
   `live.innerHTML = temp.innerHTML` — which copies **children only**. `data-code` was written on the
   *sandbox* node and died with it, so the live node got the picture but **never got the source**.
3. **The theme flip re-renders in place** (`reRenderLang`, `plantuml-retheme.ts`):
   ```ts
   el.removeAttribute('data-processed')
   el.innerHTML = ''        // ← the last copy of the source (textContent) is now gone too
   renderFn(pane, cdn)      // ← no data-code, no textContent → the `if (!abcCode) return` bail
   ```

So the flip destroys the render and the re-render has nothing to draw from. Permanently empty.

**Why only abc?** plantuml and graphviz use the same `reRenderLang` but are NOT in the offscreen path
(graphviz is explicitly excluded — its Viz.js engine hangs when run twice; plantuml is our own
renderer), so their `data-code` is stamped directly on the live node. mermaid re-themes from an
explicit theme argument and flowchart has no mono re-render, so neither depends on `data-code`.
abc was the only engine sitting in *both* the offscreen path and the `data-code` re-render path.

## Fix — TWO sites

The source is lost anywhere the live node's children are replaced wholesale. There are two such sites,
and fixing only the first would leave the bug alive for every user who re-opens a document.

**Site 1 — the offscreen swap (cache MISS / first render).** `media-src/src/native-offscreen.ts`, now a
testable `adoptRender(temp, live)`:

```ts
export function adoptRender(temp: HTMLElement, live: HTMLElement): void {
  live.innerHTML = temp.innerHTML
  const code = temp.getAttribute('data-code')
  if (code) live.setAttribute('data-code', code)
}
```

**Site 2 — the cache-HIT paint (re-open).** `media-src/src/render-cache-client.ts` painted
`wrapper.innerHTML = svg` without restoring the source, so a *cached* abc block died on the next flip
exactly like an offscreen-rendered one. Now stamps `data-code` from the block's known `source`.

This second site is **structurally invisible to the e2e suite**: `playwright.config.ts` sets
`VMARKD_E2E=1` → `DiagramCache` runs with `freshStart` and wipes its store per test, so every render in
every other spec is a MISS. Only a real user's re-open takes the HIT branch. It is covered by a
dedicated spec that forces a hit (below).

Both fixes are attribute-driven, so any future engine that stamps `data-code` is correct by
construction.

## Why the e2e did not catch it

`retheme-flip-matrix.spec.ts` exists precisely to catch "a flip drops a render" — and it went green
anyway, because its stability check compared before-vs-after counts:

```ts
expect(light.out[lang].svgs).toBe(dark.out[lang].svgs)   // 0 === 0 → "stable"
```

When abc was destroyed *before* the first census (i.e. whenever the workbench already sat on the
first theme, making the spec's initial `setTheme` a no-op), the count was 0 on both sides and the
assertion passed **vacuously**. When the workbench happened to start on the other theme, abc survived
the no-op and died on the real flip — 1 → 0 — and the spec failed. That order dependence is exactly
what made this look like suite flake for so long.

Added assertion (a0): every family must have DRAWN something (`svgs + canvases > 0`) on **both** sides
of the flip, so an engine that never rendered can no longer pass as "stable".

## Tests

- `media-src/src/native-offscreen.test.ts` — 3 new unit tests for `adoptRender`: children copied,
  `data-code` carried across, and not invented when the engine set none. (7 in the file total.)
- `test/vscode-e2e/retheme-flip-matrix.spec.ts` — assertion (a0) above; verified `abc: svgs 1→1`
  (was `0→0` / `1→0`) on two consecutive runs. Covers site 1 (MISS).
- `test/vscode-e2e/abc-flip-cache-hit.spec.ts` (new) — covers site 2: renders once to populate the
  cache, closes and re-opens the file to force a real HIT (asserted via `data-vmarkd-cache-hit`, so the
  spec cannot silently degrade into a second MISS and prove nothing), then flips the theme and requires
  both `data-code` and a surviving `<svg>`.

## Guard verified by mutation

The e2e guard was proven to actually catch this, not merely to pass:

| `adoptRender` carries `data-code` | `retheme-flip-matrix` |
|---|---|
| yes (fixed) | `abc: svgs 1→1` — 1 passed |
| no (temporarily reverted) | `abc: svgs 0→0` — **failed**: `abc lost its render in the flip` |

Note the reverted run fails on the AFTER-flip check even though abc was already destroyed by the
spec's first `setTheme`: that is exactly why the gate asserts the light side rather than both, with a
pre-flip poll (below) guaranteeing every family drew to begin with.

One refinement came out of the first full-suite run: asserting "drew something" on BOTH sides made
**graphviz** fail — its Viz.js WASM cold start is the slowest engine (it is deliberately excluded from
the offscreen path) and it had not finished by the baseline census under suite load. That was the
assertion being too strict, not a second bug. The spec now POLLS until all 14 families have drawn
before the baseline census, and then asserts none of them LOST its render across the flip — which
keeps the hole closed without failing a slow-but-correct engine.

## Related

- Task 360 — the sibling silent-failure in the same swap (a themed error box was dropped because the
  guard only looked for `<svg>`).
- Task 184 — the render cache / offscreen reserve machinery this rides on.
