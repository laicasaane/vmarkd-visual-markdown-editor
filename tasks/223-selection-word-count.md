# Task 223 — Selection-scoped word count in the status bar

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §5

## Problem

The status bar shows whole-document reading time + word count (`src/status-bar.ts:59`);
a non-collapsed selection shows nothing scoped ("N of M words" is standard editor UX,
Typora has it).

## Scope

- [ ] Webview: on selectionchange (debounced ~150ms, piggyback an existing selectionchange
      listener — do NOT add a new global one; see the observer-fleet perf work), when the
      selection is non-collapsed post `selection-stats {words, chars}` computed from
      `range.toString()`; collapsed → post a clear.
- [ ] Host: status bar renders `N of M words` while stats are present; existing text
      otherwise. Modes: ir/wysiwyg/sv edit surfaces (preview selection too — same listener).
- [ ] Keep the whole-doc counter's existing behaviour (per-keystroke Vditor counter stays
      off — main.ts:317 rationale).

## Out of scope

- Char/line breakdown UI, per-selection reading time, counting markdown markers vs
  rendered words distinction (use rendered text — document it).

## Verification

- L1: word-count fn shared with `src/reading-time.ts` (unify if trivially possible) —
  unicode/punctuation cases.
- L2: harness message spy — select → one debounced stats post; collapse → clear.
- L3 real-VS-Code (mandatory): select in the real webview → status bar item text shows
  `N of M`; collapse → reverts.
