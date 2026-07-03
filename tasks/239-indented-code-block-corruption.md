# Task 239 — BUG: indented (4-space) code blocks destroyed by the IR save path

**Status:** planned — BUG, corruption class · **Impact:** 🔴 high · **Origin:** task 192 §10 (broad sweep, probe-verified)

## Problem

Probe-verified data loss in the DEFAULT mode: `Md2VditorIRDOM` emits an indented code block
WITHOUT open/close marker spans (unlike ``` fences), the first `SpinVditorIRDOM` degrades it
to `<p>`, and `VditorIRDOM2Md` serializes it as plain prose — the indent is gone, re-parse
gives a paragraph. Repro: `'para\n\n    code line\n    second'` → spin → `<p>code line\n
second</p>`. WYSIWYG is CORRECT (emits a fence); IR is the default (`Options.ts:47`,
not overridden) and the save path is `VditorIRDOM2Md` (`edit-sync.ts:54,78`). Open any
legacy/pandoc/email markdown with CommonMark indented code → edit anywhere → save →
every indented block in the doc becomes prose. Minimal-diff writeback can't mask it (the
region genuinely differs). Zero coverage: `torture.md` has no 4-space code.

## Scope

- [ ] Pick the fix (probe both): (a) normalize indented→fenced on IR LOAD (host lute
      prerender or webview open path — display-identical, small honest diff, simplest), or
      (b) patch Lute/Vditor so markerless IR code-blocks serialize as fences, mirroring the
      WYSIWYG behaviour (no open-time diff; deeper patch). Lean (b) if the patch anchors
      cleanly in the VDITOR_TS_PATCHES registry; else (a) with a one-time notice.
- [ ] Add an indented code block to `test/vscode-e2e/fixtures/torture.md` (the canonical
      round-trip fixture — mode-roundtrip.spec picks it up for free).
- [ ] L1 serialization unit via the Node-Lute recipe pinning the round-trip.
- [ ] L3 regression: open → type elsewhere → save → indented block byte-identical on disk.

## Out of scope

- Auto-converting indented→fenced as a formatting feature (only fidelity).
