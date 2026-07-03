# Task 246 — Numbered equations + `\label`/`\eqref` cross-references

**Status:** planned · **Impact:** 🟡 med-high (academic) · **Origin:** task 192 §10

## Problem

Bundled KaTeX 0.16.9 has `\tag` (manual) but ZERO `\eqref`/`\label`/auto-numbering (grep
of the katex bundle → 0 hits) — "see Eq. (3)" workflows are impossible; renumbering by hand
is the exact pain LaTeX users fled.

## Scope

- [ ] Pre-process display-math before `katex.render`: assign sequential numbers (injected
      `\tag{N}` or CSS-counter chrome), collect `\label{id}` → number map (strip labels
      from what KaTeX sees).
- [ ] Rewrite `\eqref{id}`/`\ref{id}` occurrences — in MATH and in PROSE (`$\eqref{x}$` and
      a bare `\eqref{x}` convention — decide + pin) — into anchor links that live-renumber
      on edit (decoration pass, serialization byte-stable).
- [ ] Idempotence across re-render/re-theme (the diagram-render lessons — numbering must
      not increment on every spin); numbering scope = document order of display-math
      blocks; setting `vmarkd.math.autoNumber` (`off` default — changes visual output).
- [ ] Anchors: numbered equations get ids so `[](#eq-x)` also works (share task 243's
      resolution helper).

## Out of scope

- `align` per-row numbering nuances beyond KaTeX's own handling, theorem/lemma
  environments, mhchem numbering.

## Verification

L1: label-collect + renumber units (insert an equation mid-doc → later refs shift).
L2: render + edit → renumber, round-trip byte-stable, re-theme idempotent. L3: fixture
with 3 labeled equations + prose refs → correct numbers under the real pipeline.
