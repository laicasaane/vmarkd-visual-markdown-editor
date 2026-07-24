# 363 — a theme switch DURING the first render can permanently blank a diagram

**Status: 🔍 OPEN — reproduced and root-caused, NOT fixed** (worked around in the e2e specs only).

## Symptom

Change the content theme (or flip the VS Code theme) while a document is still performing its INITIAL
diagram render, and a diagram that had not finished yet ends up **permanently empty** — no SVG, no
error box, no source text. It never recovers.

Observed with the two slowest engines, which are simply the ones wide enough to be caught mid-render:
**graphviz** (Viz.js WASM) and **plantuml** (TeaVM). Given a 120-second poll they still drew nothing.

## Root cause

`reRenderLang` (`media-src/src/plantuml-retheme.ts`) re-renders in place:

```ts
el.removeAttribute('data-processed')
el.innerHTML = ''        // ← destroys whatever is there, INCLUDING the source in textContent
renderFn(pane, cdn)      // ← the renderer reads data-code, falling back to textContent
```

That is safe once a render has finished, because the patched renderers stamp the source into
`data-code` as they draw. But **before** the first render completes, `data-code` is not there yet and
the source lives only in `textContent` — which the `innerHTML = ''` just deleted. The re-render then
has nothing to draw from and bails, leaving the node empty forever.

Same source-loss shape as task 361, different trigger: 361 lost the source through a DOM copy that
skipped attributes, this loses it through a clear that races the first render.

## Reproduction

Any spec that switches `theme.content` right after `vscode.openWith` on a diagram-heavy document
(e.g. `test/vscode-e2e/fixtures/all-renderers.md`) reproduces it: graphviz and plantuml stay blank.
Moving the config update BEFORE the open makes it disappear — which is exactly the workaround applied
to `retheme-flip-matrix`, `mermaid-flip-gate` and `parity`.

## Why it is not fixed here

The fix belongs in the product, not the tests, and there is a real design choice to make:

1. Make `reRenderLang` capture the source BEFORE clearing (`data-code` ?? `textContent`) and skip the
   re-render entirely when it has neither — the smallest, most obvious fix.
2. Or have it skip blocks that are not yet `data-processed`, leaving the in-flight render to finish
   (it will draw in the new theme anyway if the foreground is already updated).

Option 1 is the safer of the two, but either changes live re-theme behaviour for every mono engine
(plantuml/graphviz/abc/wavedrom/nomnoml), so it wants its own verification pass rather than being
folded into the suite-stabilisation work.

**Real-world exposure:** the user has to change theme within the first seconds of opening a heavy
document — narrow, but not impossible, and the result is silent and permanent.

## Related

- Task 361 — the abc source-loss (fixed): same failure shape, different mechanism.
- Task 360 — the dropped error box in the offscreen swap.
