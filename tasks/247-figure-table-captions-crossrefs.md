# Task 247 — Figure/table captions + numbering + cross-references

**Status:** planned · **Impact:** 🟡 med-high (writer/academic) · **Origin:** task 192 §10

## Problem

Standalone images render as bare `<p><img></p>` (probe) — no `<figure>`/`<figcaption>`
anywhere, no Figure N numbering, no cross-refs that renumber. Spec/paper authors maintain
"Figure 3" by hand.

## Scope

- [ ] Decoration-only (round-trip byte-stable): a solo-image paragraph becomes figure
      chrome — caption from the alt text (or a following `*Figure: …*` em-line convention;
      decide + pin ONE) with a CSS-counter number; tables with an adjacent caption line get
      the same treatment.
- [ ] Cross-refs: adopt the pandoc-crossref convention `[@fig:id]`/`[@tbl:id]` with ids
      from `{#fig:id}` attributes (pairs with task 243's id work) — decorated to
      "Figure 3" links that live-renumber; unknown ref styled as missing.
- [ ] One shared reference-decoration pass with task 245 (citations) and 246 (equations) —
      design the three together: single scanner, three resolvers.
- [ ] Setting-gated (`vmarkd.captions`, default off); Preview + edit surfaces + export
      (53) all consistent.

## Out of scope

- Writing numbers back into the source, list-of-figures generation (later, trivial once
  the map exists), subfigures.

## Verification

L1: caption-detection + numbering map units. L2: figure chrome renders, refs resolve +
renumber on insert, byte-stable round-trip. L3: fixture with 2 figures + 1 table + refs.
