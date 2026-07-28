# 395 — D2 diagrams are too tightly packed: edges/labels overlap adjacent node boxes

**Status: 📋 TODO, reported not yet measured.** Found 2026-07-27, same real-editor review pass as
task 394.

## Report

> "tu jest wszystko jakos za mocno upakowane" — the `|md` pipeline diagram
> (`notes -> ship: gate` / the `pipeline` container block): the "Release checklist" `|md` node is
> tall (heading + list + a `verified by`-labelled edge running through it), and the `gate` edge
> label sits ON TOP of the "parity spec green" list line and bleeds into the "Ship it" box below.
>
> "a tu verified by tez za mocno upakowane zachodzi na boxa" — the `snippet -> pipeline.checklist:
> verified by` edge: the `verified by` label overlaps the bottom edge of the "Escape hatch" code
> panel box above it.

## What was checked

Not yet measured beyond eyeballing the screenshots — the pattern is that BOTH overlap sites involve
a source node whose rendered height depends on its content (`|md` prose/list/code panels have
variable, sometimes large, height) feeding into ELK/dagre layout as if the node were a plain small
label. Worth checking:

- Does the layout engine (default ELK, task 127) get the actual measured `|md` node height before
  placing edges/labels, or a stale/approximate one?
- Is the edge-label midpoint placement (which drives where `verified by`/`gate` are centered)
  computed from the FINAL routed geometry, or from a pre-layout estimate that doesn't yet know a
  `|md` node grew taller than a plain label?
- Is this specific to `|md`/`|`-labelled nodes (foreignObject + Lute render, task 154) or does a
  tall plain-text-shape node reproduce it too?

## Not done

- No root cause. No fix. This needs the same kind of DOM/geometry measurement task 394 started
  (real webview, `all-renderers.md`, the exact two diagrams quoted above) before touching layout
  code — layout surgery without a confirmed cause is exactly the kind of speculative fix the
  project's systematic-debugging rule forbids.
