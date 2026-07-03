# Task 245 — Pandoc-style citations `[@key]` + bibliography (design-first)

**Status:** planned — DESIGN-FIRST · **Impact:** 🔴 high (academic flagship) · **Origin:** task 192 §10

## Problem

`[@smith2020]` renders as literal text (probe-verified); zero `.bib`/CSL awareness anywhere.
vMarkd's academic base is otherwise strong (KaTeX, mhchem, abc, smiles) — citations are the
flagship missing layer (Zettlr/MPE-class).

## Scope

- [ ] Design phase: pick the formatting engine — offline `citation-js`/`citeproc-js` bundle
      (CSP-clean, matches the offline-engine ethos) vs 2-3 built-in styles (APA/IEEE/
      Chicago) hand-rolled; decide `.bib` vs CSL-JSON support order.
- [ ] Host: discover workspace `.bib`/CSL files (wiki-cache watcher pattern), parse to a
      key→entry map.
- [ ] Webview: `[@key]` round-trips byte-stable (same class as pre-phase-1 wiki links) →
      decorate as a chip (data-render discipline) with hover = formatted reference;
      unknown key styled like a missing wiki chip.
- [ ] Autocomplete on `[@` via the hint.extend vehicle (the `[[` pattern, main.ts:346-386).
- [ ] Rendered bibliography: a ```` ```bibliography ```` fence (or auto References section
      in Preview/export) listing cited entries; feeds task 53's export fidelity; pass
      `--citeproc` through 53's detected-pandoc path when present.

## Out of scope

- Zotero live integration (file-based only v1), locator syntax `[@key, p. 12]` beyond
  passthrough, per-doc CSL style switching (one workspace setting v1).

## Verification

L1: .bib parser + key map + formatter units. L2: chip render/round-trip, hint completion,
bibliography fence. L3 real-VS-Code (mandatory): workspace with a .bib → chips resolve,
hover shows the formatted entry, References renders.
