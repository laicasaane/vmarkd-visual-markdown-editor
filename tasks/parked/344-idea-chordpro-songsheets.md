# Task 344 — ChordPro song sheets: rendered chords + one-click transpose [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit (192 §14);
NOT scheduled. Engine-registry candidate (#19/20).

## What it is & the effect

A ```` ```chordpro ```` fence (`[Am]Wish you were [G]here`) renders as a proper song
sheet — chords ABOVE lyrics, sections styled — with a **transpose ±** control (pure pitch
arithmetic; display-only, source untouched; optional write-back command). Guitarists/
worship groups/campfire folks maintain songbooks in text today with zero tooling in any
markdown editor.

## Why novel / value

ChordPro apps exist standalone; no markdown editor renders it. Deterministic, offline,
tiny — the best community-per-cost ratio of the niche dialects. Real hobbyist crowd that
shares tools by word of mouth.

## Feasibility

One registry descriptor + a small pure-TS renderer (chords-over-lyrics layout is
string-measurement we already do in d2-render's textmeasure territory); transpose = a
12-tone map; inherits theming/error-box/cache like every engine. Fixture-driven L1 tests.

## Decision

- [ ] **ADOPT**  ·  - [ ] **PARK** — reason: _______
