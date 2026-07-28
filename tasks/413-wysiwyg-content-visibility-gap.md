# Task 413 — Extend the big-doc `content-visibility:auto` fix to WYSIWYG mode

**Status:** planned — bug fix, CSS · **Impact:** 🟠 medium-high (large WYSIWYG docs keep the exact whole-window freeze the fix exists to kill) · **Origin:** parallel Fable + Codex performance audits (2026-07-27) — found independently by both

## Problem

`media-src/src/main.css` (~line 1007) carries the "big-doc freeze fix": VS Code 1.123 /
Chromium 148 froze the whole window when a large retained webview re-laid-out/re-painted on tab
switch, fixed by applying `content-visibility: auto` (O(viewport) instead of O(document) repaint)
to `body.vmarkd-large-doc .vditor-ir > pre.vditor-reset > *`.

The triggering class, `vmarkd-large-doc`, is set purely from document size
(`vditor-init.ts:126-136`, `docChars >= CONTENT_VIS_MIN_CHARS` at 100,000 chars) — **mode-
independent**. But grepping `main.css` confirms there is no equivalent `.vditor-wysiwyg`
selector anywhere. A ≥100KB document opened or edited in WYSIWYG mode gets the `vmarkd-large-doc`
class but no containment — it still pays the full O(document) layout/paint cost on every tab
switch, the exact symptom this fix was built to eliminate, just silently unfixed in one mode.

No task file mentions this gap (only task 168 references the `content-visibility` rule, and it's
unrelated to mode scope) — this reads as an oversight in how the original fix was scoped, not a
deliberate exclusion.

## Scope

- [ ] Confirm WYSIWYG's rendered DOM shape actually mirrors IR's `pre.vditor-reset > *` block
      structure (both are rendered via a parallel `.vditor-{mode} > pre.vditor-reset` container
      per `lute-host.ts` — likely yes, but verify before assuming the same selector shape works).
- [ ] Add a parallel `body.vmarkd-large-doc .vditor-wysiwyg > pre.vditor-reset > *` rule, carrying
      the same exclusions the IR rule has (headings/TOC/footnote or whatever else is currently
      excluded — check the IR rule's own exceptions, don't just copy the selector blind).
- [ ] Verify `contain-intrinsic-size` (if used on the IR side) doesn't need a different value for
      WYSIWYG's typically-taller rendered blocks (WYSIWYG shows full rendered content per block,
      not just source markers).

## Out of scope

- Any change to the IR-side rule or the `CONTENT_VIS_MIN_CHARS` threshold itself.
- WYSIWYG's incremental-serialize gap ([task 167](167-incremental-serialize-wysiwyg.md)) — a
  related but separate large-doc WYSIWYG cost; don't conflate the two fixes in one PR.

## Verification

- [ ] Real-VS-Code e2e (webview-affecting CSS change, per AGENTS.md — this is exactly the class
      of bug `vmarkd-visual-debugging` skill exists for, and the original freeze was a real-
      VS-Code/Chromium-only symptom, not reproducible in the chromium harness): open a ≥100KB doc
      in WYSIWYG mode, switch tabs away and back, confirm no freeze/long-task and that
      `content-visibility: auto` is actually applied (check computed style or a perf trace) —
      mirror however the IR-mode fix was originally verified.
- [ ] Confirm the IR-mode fix still works unchanged (no regression from touching the same file).
- [ ] `npm run test:visual` if any pixel-visible change results from the new rule (contained
      blocks sometimes affect scrollbar/layout in subtle ways — check).
