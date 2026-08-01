# Task 260 — Presentation mode for PLAIN markdown (HackMD-style)

**Status:** planned · **Impact:** ⚪ low-med · **Delta vs:** task 107 (Marp) · **Origin:** task 192 §10

## Problem

Task 107 hard-gates on `marp: true` frontmatter — a plain note cannot be presented at all.
HackMD presents ANY note: split on `---` (or headings) into fullscreen slides, arrow-key
navigation. Much thinner than Marp and reuses the existing render pipeline wholesale.

## Scope

- [ ] Command `vMarkd: Present this document`: fullscreen overlay in the webview; slides =
      doc sliced on `---` thematic breaks (fallback: H1/H2 when no breaks — setting);
      each slide rendered via the EXISTING Lute preview render (diagrams/math/callouts
      work for free, render cache warm).
- [ ] Navigation: arrows/space/PgUp-PgDn, Escape exits, slide counter, optional click-to-
      advance; scale-to-fit typography (CSS, content untouched).
- [ ] Explicitly reconcile with 107 in its file: 107 = Marp decks (marp syntax, themes,
      export); 260 = zero-syntax instant present; a marp:true doc routes to 107's path.

## Out of scope

- Speaker notes, export to PPTX/PDF (107 phase 2 territory), per-slide transitions,
  presenter view.

## Verification

L1: slicing unit (`---` inside code fences must NOT split — reuse the fence-aware
scanner). L2: overlay renders N slides, arrows navigate, Escape restores editor state
(scroll/caret), `getValue()` untouched. L3 real-VS-Code (mandatory): present the torture
fixture — diagram slide renders, key nav under real key capture.
