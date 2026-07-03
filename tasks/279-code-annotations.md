# Task 279 — Code annotations (Quarto-style `# <1>` line markers + numbered callouts)

**Status:** planned · **Impact:** 🟡 med (runbook/tutorial authors) · **Origin:** task 192 §11

## Problem

Quarto's code annotations: lines inside a fence end with a comment marker `# <1>`, and an
ordered list right after the fence supplies the explanation texts; renders as numbered
dots on the code lines with the text below/on hover. Nothing similar exists here (grep →
only the unrelated 237); it's the cleanest way to explain a config/command block without
breaking it apart.

## Scope

- [ ] Render pass on code blocks (Preview + the ir/wysiwyg preview panels): detect
      trailing `# <N>` / `// <N>` / `-- <N>` comment markers (comment leader by fence
      language) + an immediately-following `<ol>`; hide the raw markers in the RENDERED
      block, paint numbered dots at line ends; the list renders as the legend below (or
      hover popovers — setting `below | hover`, default below).
- [ ] Source round-trips untouched (markers stay in the fence text — decoration only);
      copy-code (task 212b button) copies WITHOUT the markers (strip in the copy payload —
      pin it).
- [ ] Composes with the line-number gutter (task 73) and the hljs pipeline (dots must not
      break highlight spans — the wrapLuteFlatten discipline).
- [ ] Graceful: markers without a list, or list without markers → render as-is (no
      half-transformed state).

## Out of scope

- Quarto's `annotation: select` interactive mode, annotations in sv/source view, editing
  affordances for the markers (plain text editing suffices).

## Verification

L1: marker/legend detection units (languages' comment leaders, gaps in numbering,
marker-in-string false positive guard). L2: fixture renders dots + legend, `getValue()`
byte-stable, copy strips markers, hljs classes intact. L3 real-VS-Code (mandatory): render
under the real pipeline + theme flip keeps the dots readable.
