# 373 — mermaid / flowchart lose every arrowhead after a mode switch

**Status: ✅ FIXED** — and it was a REGRESSION I introduced in tasks 365/366.

## Report

> "flowchart i mermaid nie mają strzałek pomiędzy preview i ir"

## Cause — the reuse duplicated every id

The same-session render reuse paints a **verbatim copy** of the other pane's SVG. That duplicates
every `id` in the document, and `url(#id)` resolves to the **first match in DOCUMENT ORDER** — which
is the ORIGINAL pane's element. While one pane is shown the other is `display:none`, and a marker
inside a `display:none` subtree is **not painted**: every arrowhead disappears.

Measured before the fix, in the Preview pane:

```
url(#mermaid…_flowchart-v2-pointEnd)  →  owner pane: IR   (display:none)
duplicate ids: …-pointEnd ×2, …-pointStart ×2, "111" ×4 (flowchart/raphael)
```

## Fix

`uniquifySvgIds()` re-namespaces every id (and every `url(#…)` / `href="#…"` reference to it) with a
per-paint `-vmN` suffix before the markup is injected. Anchored on the closing quote / paren so an id
that is a PREFIX of another (`111` vs `1111`) can never be partially rewritten.

Plus `stripSvgIdNamespace()`: the local map is fed from `wrapper.innerHTML` **after** a paint, so
without stripping, suffixes ACCUMULATE across switches (`m-vm10-vm12`). Storing the stem keeps every
paint exactly one level deep. Found by a unit test, not by reasoning.

## Consequence for the parity specs — ids now differ ON PURPOSE

`mode-switch-render-reuse` and `wysiwyg-parity` asserted byte-identical markup between panes. Ids
must now differ, so those comparisons normalise the `-vmN` suffix and still assert byte-identity of
everything else. `diagram-cache-mermaid` used the mermaid uuid as a "was it re-rendered?"
fingerprint — it now compares the stem. Each change is commented in place; none of them weakens what
the spec was written to catch.

## Verification

- e2e `svg-marker-refs.spec.ts` (new): for every `url(#id)` in the visible pane's mermaid/flowchart
  SVG, the first element with that id must be in the SAME pane. **Mutation**: painting without the
  namespace fails with `…pointEnd -> IR pane (hidden)` — the exact mechanism.
- It deliberately does NOT fail on a reference defined NOWHERE: mermaid emits
  `url(#…-gradient)` without ever defining the gradient. Pre-existing, unrelated, logged not asserted
  — otherwise the spec would be red for something it does not guard.
- Unit: 5 new cases (rename + references together, a fresh namespace per paint, prefix-id safety,
  `xlink:href`, no-op without ids) + the accumulation guard.
- Regression: diagram-cache, diagram-cache-mermaid, mode-switch-render-reuse (6),
  ir-inline-code-line, d2-label-halo green.

## Honest note

Two verification runs earlier were **worthless** because I ran two e2e suites concurrently and VS
Code failed to launch ("Process failed to launch!") — environmental, not real. Re-run sequentially
for the results above. Concurrency is exactly what I had just capped in the harness config for the
same reason.
