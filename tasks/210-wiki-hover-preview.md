# Task 210 — Hover preview of wiki-linked notes

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §3

## Problem

Wiki chips carry only a static tooltip ("Open wiki page X" — `custom-renderer.ts:116-119`).
Obsidian users expect a rendered page preview on hover.

## Scope

- [ ] Hover (with ~400ms intent delay) on a resolved chip → popover with the target's
      rendered first N blocks; host round-trip to read the file (reuse/extend the task-204
      content-fetch protocol message — build whichever lands first, share the wire), render
      via the Lute preview path into a `data-render` container.
- [ ] Cache per target+mtime; dismiss on mouse-leave/scroll/Escape; position within the
      viewport; CSP-safe (no inline handlers); dark/light themed.
- [ ] Missing pages: no popover (chip style already communicates it).
- [ ] **Footnote hover popups** (added 2026-07-03, Quarto/MPE parity — Quarto ships it ON
      by default): the CHEAPEST case of this popover family — the note body is already in
      the rendered document, so no host round-trip and no cache; hovering a footnote ref
      shows the rendered note text. Build it FIRST to de-risk the popover UI, then the
      wiki case rides the same component (and task 245's citations later).

## Out of scope

- Hover on regular `[]()` links, editing inside the popover, pinning the popover.

## Verification

- L1: cache/mtime invalidation unit.
- L2: harness with mocked host reply — popover renders, delay respected, dismiss paths,
  no serialization impact (`getValue()` stable while hovering during edit).
- L3 real-VS-Code (mandatory): real two-file fixture — hover renders target content over
  the real wire under the webview CSP.
