# 487 — Structural caret position for the undo checkpoint restore (replace the flat `textOffset`)

Status: **✅ CLOSED 2026-08-05** — implemented, verified at all layers, and accepted by the user
after checking it in their own editor.

Follow-up to [486](486-repeated-enter-after-callout-code-caret-snapback.md) and
[445](../tasks/done/) (`patchUndoCaretSplitRestore`). 486 shipped a *heuristic* on the resolve side;
this task removes the ambiguity at its source.

## The defect in the representation

`CaretIntent`'s `{ textOffset: N }` means "the caret sits after the Nth character of the editable's
text". It is used by two capture sites:

1. `patchUndoCaretSplitRestore` (`media-src/esbuild-shared.mjs`) — Vditor's `Undo.addToUndoStack` →
   `addCaret(vditor, true)` snapshots the caret ~800 ms (`undoDelay`) after an edit, then restores
   it. Task 445 replaced Vditor's stale `cloneRange` restore with a character offset because
   `range.insertNode` (the wbr marker) splits `range.startContainer` out from under the range.
2. `caret-preserve.ts` — after a full `setValue()` rebuild (external host update, Vditor #1912)
   every old node is gone, so only a character count survives.

**A flat character offset cannot address an empty block.** An empty `<p>`/`<li>` contributes zero
characters, so "caret at the end of block N" and "caret inside the empty block N+1" compute to the
*same* number — `Range.toString()` is blind to element boundaries, so even the *capture* side
collapses them. The round-trip is self-inconsistent: it cannot preserve what it cannot express.

### Observed symptom (task 486, user-reported)

Press Enter at the end of any list item / paragraph. The caret descends into the new empty line
correctly, then ~800 ms later **snaps back to the end of the previous line** — the undo checkpoint
firing and restoring an offset that can only resolve to the text end. Reproduces in *every* list
line, only after Enter (never after ArrowDown), which is exactly the fingerprint of an
edit-triggered debounced mechanism rather than anything positional.

Evidence (webview → Output channel log, task 486):

```
[486] requestCaret intent={"textOffset":11618} … at hi.addCaret … at hi.addToUndoStack
```

Positively ruled out in the same session: the `handleUpdate MISMATCH` diagnostic **never fired**, so
`caret-preserve.ts` / the message-router host round-trip is *not* this bug's trigger.

## What 486 shipped (the heuristic, to be superseded here)

`resolveTextOffset` in `caret.ts` now prefers an immediately-following EMPTY block over the text end
when the offset lands exactly at a text node's end (`nextEmptyBlockSibling`). It fixes the common
case and is unit-tested — but it is a guess made *after* the information was already lost:

- With **several** empty blocks in a row (the callout-at-EOF blank-line chain from 486) it has no
  way to pick the right one.
- It cannot distinguish "the blank line the user just made" from a coincidentally adjacent one.
- Suspected cause of the `gap-enter-chain.spec.ts` flake seen right after it landed (unconfirmed —
  the discriminating A/B run against a no-heuristic build was never completed).

## Fix: address the block, not the document

Add a structural `CaretIntent` variant and use it for the undo path, where capture and restore run
against the *same* DOM (only a within-block text split happens in between) and a block reference is
therefore fully reliable:

```ts
| { blockPath: number[]; offsetInBlock: number }
```

- `blockPath` — child indices from the editable down to the element that directly holds the caret.
  The wbr `insertNode` splits a text node *in place*; it never reorders elements, so the path
  survives the split.
- `offsetInBlock` — character offset within *that element's* text. An empty element is
  `{ blockPath: [...N], offsetInBlock: 0 }`, a **different value** from the end of the one before it.
  The ambiguity is gone by construction.

**A single top-level index is NOT enough — measured, not assumed.** The first implementation used
one `blockIndex` among the editable's top-level children, and the real-webview test still failed
exactly as before (`immediate: LI ""` → `+1200ms: LI "220-preview-checkbox…" offset 100`): inside a
list the top-level block is the `<ul>`, so every `<li>` shared one character space and the empty one
was ambiguous all over again, one level down. Hence the full path.

`{ textOffset }` **stays** for `caret-preserve.ts`: after a `setValue()` rebuild driven by *changed*
host content, block indices are not stable, so a document-wide character offset remains the right
(and only) representation there. The 486 heuristic stays with it as the best available guess for
that path.

## Checklist

- [x] `CaretIntent` gains `{ blockPath, offsetInBlock }`; `resolveCaretIntent` dispatches to a new
      `resolveBlockOffset(editor, blockPath, offsetInBlock)` (`media-src/src/editing/caret.ts`)
- [x] `resolveBlockOffset`: clamps each path step to the child list, walks that element's text nodes
      for `offsetInBlock`, returns `{ node: element, offset: 0 }` when it has no text (the empty-line
      case this whole task exists for). Clamps rather than failing — the caret authority retries a
      null forever, and landing one element early is invalidated by the next real gesture anyway.
- [x] `patchUndoCaretSplitRestore` captures `{ blockPath, offsetInBlock }` (self-contained injected
      helper `vmarkdCaretBlockOffset`, alongside the existing `vmarkdCaretTextOffset`) and restores
      through it; falls back to `textOffset`, then to Vditor's original `cloneRange`, so a harness
      without the bridge still behaves as before (`media-src/esbuild-shared.mjs`)
- [x] Unit tests in `caret.test.ts` (6 new, 43 pass): empty block; characters counted within the
      named element only; path INTO a list item; **empty `<li>`** (the regression above); index past
      the end (clamp); offset past the text (clamp); empty document → null. The empty-block test also
      asserts `{textOffset}` resolves elsewhere for the same caret, proving the two intents differ
      rather than the new one restating the old.
- [x] Real-VS-Code e2e `test/vscode-e2e/list-enter-undo-caret.spec.ts` + fixture: Enter at the end of
      a list item — caret is in the new empty `<li>` immediately AND after 1.4 s, i.e. past the undo
      debounce. The delayed assert is the one that matters; the immediate one passed even with the
      bug. Replaces the throwaway `debug486-sweep.spec.ts` probe (deleted — it hardcoded an absolute
      path to a task file).
- [x] `gap-enter-chain.spec.ts` `--repeat-each=4`: **4/4 pass**. That flake is gone, which settles the
      A/B: it was the 486 heuristic being reached through the undo `textOffset` path, and the
      structural path no longer goes there. Its `dump=` debug instrumentation is removed.
- [x] `npm run lint:ci` clean (682 files, 0 warnings); 289 editing unit tests pass
- [x] `npm run quality`: lint:ci / jscpd / depcruise / test:coverage / check:coverage-modules all
      PASS. `knip` FAILs, but every one of its 52 findings predates this change — none is in a file
      touched here (checked by filtering its output for `caret`/`trailing`/`gap-paragraph`/`editing/`:
      the only hits are `list-backspace.ts` and `links/caret-link.ts`, both untouched). Consistent
      with AGENTS.md — knip is not in CI and carries known baselines from task 469.
- [x] Rebuild + reinstall the VSIX, user verification in the real editor — accepted 2026-08-05

## What was NOT done

- **Task 486's `nextEmptyBlockSibling` heuristic in `resolveTextOffset` is still in place**, now
  reached only by `caret-preserve.ts`'s rebuild path. Deliberate: with the undo path off it, the
  suspected flake is empirically gone (4/4), and removing it would drop empty-block handling on the
  rebuild path with nothing replacing it. If `{textOffset}` is ever retired entirely, this goes with
  it.
- The coverage ratchet reported two BASELINE_ZERO modules that now HAVE coverage and could be pruned
  from `scripts/check-coverage-modules.mjs` — `media-src/src/diagrams/diagram-zoom.ts` and
  `media-src/src/links/link-click-fix.ts`. Left alone: tightening the ratchet is its own decision and
  outside this task's scope. Recorded here so it is not lost.

## Notes / risks

- The esbuild patch anchors are exact-string matches against Vditor's `undo/index.ts` and already
  throw on version drift — the new helper must be injected at the same `UNDO_CLASS_ANCHOR` so there
  is still exactly one drift-detection point.
- `blockIndex` is only meaningful relative to `vditor[vditor.currentMode].element`; a mode switch
  between capture and restore must invalidate the intent. The caret authority already drops an
  intent whose editor identity changed (`tick()`'s identity check, ADR-0007) — verify that covers it.
- Keep the capture helper free of TypeScript beyond what the injected file already uses; it is
  spliced into Vditor's `.ts` source before esbuild.
