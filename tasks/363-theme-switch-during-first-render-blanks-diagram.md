# 363 — a theme switch DURING the first render can permanently blank a diagram

**Status: ✅ FIXED** (product fix + unit tests + e2e + mutation-verified).

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

## Fix — capture the source before the clear (option 1)

`reRenderLang` now reads the source FIRST and hands it to the renderer through the attribute the
renderer reads before `textContent`, so the clear cannot lose it:

```ts
const stamped = el.getAttribute('data-code')
// Only trust textContent while the node still holds RAW SOURCE — once the engine has put an element
// in there, textContent is svg/markup text, and stamping THAT as the source would turn a recoverable
// node into a permanently broken one.
const raw = el.firstElementChild ? null : el.textContent?.trim() || null
const source = stamped ?? raw
if (!source) continue          // nothing to redraw from → leave the in-flight render alone
el.setAttribute('data-code', source)
el.removeAttribute('data-processed')
el.innerHTML = ''
renderFn(pane, cdn)
```

Two guards beyond the plain "capture first":

- **Never mistake rendered markup for source.** Mid-render the node may already hold an `<svg>`;
  its `textContent` is markup text. Stamping that would have replaced a recoverable failure with a
  permanent one.
- **No source at all → do not touch the node.** Clearing it would destroy an in-flight render that
  was going to succeed; leaving it lets that render finish.

Option 2 from the original analysis (skip anything not yet `data-processed`) was NOT taken: plantuml
sets `data-processed` EARLY, before its async render, so that test does not actually distinguish
"finished" from "in flight" for the very engine most affected.

## Verification

- **Mutation**: with the capture removed, `theme-flip-during-first-render.spec.ts` fails with exactly
  `graphviz#0: permanently blank after the flip` and `plantuml#0: …` — the reported symptom. With it,
  green.
- Unit: `plantuml-retheme.test.ts` (new, 5 cases) — finished render stays re-renderable, unrendered
  source gets stamped, no-source node is left alone, rendered markup is never taken for source, and
  abc goes down the same path.
- Regression: `retheme-flip-matrix`, `mermaid-flip-gate`, `graphviz`, `abc-flip-cache-hit`,
  `abc-edit-jump` all green.

## Note on the e2e workarounds

The specs that pin `theme.content` BEFORE `openWith` (`retheme-flip-matrix`, `mermaid-flip-gate`,
`parity`) were left as they are. That ordering is still wanted for an unrelated reason — cross-spec
config pollution via `userDataDir` — and the new spec deliberately does the OPPOSITE (flips right
after the open) so the bug itself stays guarded.

## Related

- Task 361 — the abc source-loss (fixed): same failure shape, different mechanism.
- Task 360 — the dropped error box in the offscreen swap.
