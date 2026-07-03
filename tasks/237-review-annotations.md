# Task 237 — Review annotations / comments (design-first)

**Status:** planned — DESIGN-FIRST, uncertain value · **Impact:** ⚪ low-med (PM/review) · **Origin:** task 192 §9

## Problem

No way to leave a review note on a doc without polluting the prose. Real-time collaboration
is architecturally off the table (Live Share does not reach custom-editor webviews), but an
asynchronous, file-based annotation layer is feasible — Google-Docs-style comments reduced
to what plain markdown can carry.

## Scope

- [ ] **Design phase must weigh CriticMarkup first** (added 2026-07-03): `{>>comment<<}`
      is the established plain-text interchange for exactly this (Pandoc/iA Writer), and
      task 249 already builds CriticMarkup rendering for the change-tracking marks —
      adopting its comment mark here (instead of bespoke HTML comments) would make 237 a
      thin extension of 249. Decide there before committing to the shape below.
- [ ] **Design phase first — validate the want with the user before any code.** Proposed
      shape: HTML comments anchored to the preceding block,
      `<!-- @rev anna 2026-07-03: needs a diagram -->` — invisible on GitHub/other
      renderers (comments already hidden in our preview), fully diff-able, no sidecar.
- [ ] If green-lit: render as margin/inline note chips in edit+preview surfaces
      (data-render, theme-aware); add-comment UI (selection → context-menu item once
      task 215 lands) writes the comment line; resolve = delete the line; an "annotations"
      list panel for jump-to (reveal machinery from task 52).

## Out of scope

- Real-time co-editing/presence (impossible here), threads/replies v1, identity beyond a
  free-text name (no auth), notification of mentions.

## Verification

- Design exit: mockup + user go/no-go recorded here.
- If built — L1: comment parse/anchor unit; L2: chip renders, add/resolve round-trip
  byte-stable (comment syntax EXACT — this file format is the API), invisible in preview
  panes stays true for non-annotation comments; L3 real-VS-Code: add → save → disk;
  GitHub-invisibility asserted by rendering the fixture through plain Lute preview.
