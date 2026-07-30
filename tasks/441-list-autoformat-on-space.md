# Task 441 — A list marker should become a list on the SPACE, not only after a letter

**Status:** 📋 TODO — filed 2026-07-30, measured. · **Impact:** 🟡 med, high-frequency (every new
list) · **Origin:** user report — 'po "1.<SPACE>" powinna być już lista a teraz jest dopiero jak
literkę wpiszę' (after typing "1. " it should already be a list; currently it only becomes one after
you type a letter). Split from the list-editing umbrella [428](428-list-editing-usability-vs-real-editors.md).

## Symptom (real editor baseline)

In Word / Google Docs / Notion / Typora, typing a list marker + space — `1. `, `- `, `* `, `+ ` — at
the start of a line turns it into a list item IMMEDIATELY, on the space, with the caret inside the new
empty item. In vMarkd (IR) the marker + space stays a plain paragraph; the list only forms once you
type the first content character.

## Measured cause — Vditor-native, NOT our spin-defer

Probe (`test/vscode-e2e/list-typing-probe.spec.ts`, IR): after typing `9.` + Space the IR DOM has
**`ol:0`** (no ordered list — still a paragraph); after the next letter it becomes **`ol:1`**.

Ruled OUT our task-175/180 prose spin-defer: toggling `window.__vmarkdFastProseEdit` ON vs OFF gives
the IDENTICAL result (`afterSpace ol:0` both ways), so the skip predicate is not withholding the
spin. `shouldSkipProseSpin` (spin-skip-fence.ts) even falls through for the space after `1.` (the
preceding char `.` is not alphanumeric). This is Vditor's own IR input handling: a list marker with no
content is serialised/rendered as a paragraph until content arrives.

## Scope

- [ ] On a SPACE typed right after a leading list marker (`\d+[.)]`, `-`, `*`, `+`) at the start of a
      prose block with no other content, create the empty list item immediately and place the caret
      inside it — matching the real-editor gesture. Unordered AND ordered; IR AND WYSIWYG.
- [ ] Do not disturb the existing behaviour once content exists (Vditor already forms the list then),
      and do not interfere with typing a literal "1. " mid-sentence (only at a block-leading marker
      position — the same position `shouldSkipProseSpin` already recognises as marker-committing).
- [ ] Likely a small additive handler in our webview code (the `list-backspace.ts` capture-phase
      pattern, or an esbuild patch of `ir/input.ts`), not a Vditor fork — escalate to ADR-0004's
      fork-trigger only if it genuinely can't be done as a patch/handler.

## Verification

- [ ] Unit where feasible (the marker-detection predicate).
- [ ] Real-VS-Code e2e (editor-surface behaviour, AGENTS.md): type `1. ` / `- ` / `* ` at a line start
      and assert a list element appears BEFORE any content char, caret inside the empty item, in IR
      and WYSIWYG. Extend `list-typing-probe.spec.ts` into an assertion spec.

## See also

- `media-src/src/spin-skip-fence.ts` (`shouldSkipProseSpin` — ruled out as the cause but the same
  marker-position logic is reusable), `media-src/node_modules/vditor/src/ts/ir/input.ts` (Vditor's IR
  input handler), `media-src/src/list-backspace.ts` (the capture-phase handler pattern, task 428).
- [428](428-list-editing-usability-vs-real-editors.md) (umbrella), [442](442-backspace-empty-list-item-loose.md)
  (the sibling Backspace report), [255](255-list-renumber-command.md)/[284](284-list-auto-renumber.md)
  (renumbering, if a new ordered item needs it).
