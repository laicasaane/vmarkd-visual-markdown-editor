# 374 — mermaid renders as black boxes in a default font

**Status: ✅ FIXED** — a regression inside yesterday's task-373 fix.

## Report

> "coś popsułeś, mermaid powinien wyglądać tak [themed] a wygląda tak [black boxes, default font]"

## Cause — mermaid scopes its whole stylesheet on the svg's id

Task 373 renamed **every** id in a painted copy to keep `url(#marker)` from resolving into the
hidden pane. But mermaid emits its entire stylesheet as rules scoped under the root svg's id:

```
<style>#mermaid83e4…{font-family:sans-serif;fill:#ccc;}
       #mermaid83e4… .node path{fill:#1f2020;stroke:#ccc;}</style>
```

That selector lives in **CSS text**, which the rename never touched — so renaming the `id`
attribute orphaned every rule at once. Nothing styled the diagram any more: SVG's initial black
fill, the default font, black markers. Exactly the screenshot.

## Fix — rename only the ids that are actually REFERENCED

Uniqueness is only needed where a reference can be stolen, i.e. ids reachable via `url(#…)` or
`(xlink:)href="#…"`. Those are collected and renamed; every other id is left exactly as it is.

- `…-pointEnd` / `…-pointStart` are referenced → still renamed → **arrowheads stay fixed**.
- mermaid's root id is only ever a CSS *scope*, never url-referenced → untouched → the stylesheet
  keeps matching **by construction**, with no CSS parsing anywhere.
- `url(#…)` forms **inside** a `<style>` block were already covered: the reference rewrite runs over
  the whole markup, style blocks included.

### Why not rewrite the ids inside the CSS instead

That was the obvious alternative and it is **unsafe**: flowchart emits `id="111"`, and `#111` is
equally a valid hex colour. A CSS-text pass would corrupt `fill:#111` into `fill:#111-vm1`, and no
lookahead distinguishes the two — `#111;` and `#111{` are both syntactically fine. WaveDrom's
embedded skin contains exactly such literals.

### Evidence the two id sets never overlap

Scanned all 33 SVGs in the on-disk render cache (every engine): **zero** url-referenced ids used as
a CSS selector, and **zero** CSS scope ids that are url-referenced. The sets are disjoint in
practice, not just in theory. `stripSvgIdNamespace` needed no change — suffixes still only ever land
before a `"` or `)` — so no cached blob is poisoned and no version bump is required.

## Verification

- e2e `mermaid-style-scope.spec.ts` (new), two independent assertions:
  1. **structural** — every mermaid svg's id must still equal the id its `<style>` scopes on;
  2. **computed** — the painted pane's node `fill`/`stroke` must EQUAL the natively rendered pane's
     and must not be the initial `rgb(0, 0, 0)`. This is the user-visible symptom, and it also
     covers a CSS rewrite that renames both sides but corrupts a hex colour.
  **Mutation**: restoring the rename-everything version fails it with
  `Received: "mermaiddd44600b-…-vm10"` against the scope id — the exact mechanism.
- Unit: the scope-id case, the hex-colour case, an `url(#…)` inside `<style>`, plus the paint-path
  test asserting end-to-end that a referenced marker IS namespaced while the stylesheet survives.
  The older paint tests now assert unreferenced ids are left ALONE, so reinstating blanket renaming
  fails there too.
- Regression, run sequentially: svg-marker-refs (arrowheads still guarded),
  mode-switch-render-reuse (6), wysiwyg-parity (3), diagram-cache-mermaid. Unit 1418 / 113 files.

## Note

Task 373's `svg-marker-refs` spec could not have caught this: it checks where a *reference*
resolves, and the styling never was a reference. The lesson is in the spec added here — the check
that would have caught it is a **cross-pane computed-style** comparison, not a structural one.
