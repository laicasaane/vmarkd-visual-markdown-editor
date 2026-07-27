# Task 387 — BUG: cutting a selected multi-line paragraph leaves its last line behind

**Status: ✅ DONE (2026-07-27)** — root cause measured, fixed for IR + WYSIWYG (sv was never
broken), including multi-block selections (measured to already be data-loss-free; a boundary-merge
gap was found and fixed). RED-checked throughout.

**Impact:** 🔴 high (silent partial data loss on the most destructive path) · **Origin:** found while
stabilising task 385's two `test.fixme` cut tests

## The defect

Select a whole paragraph in IR, press Ctrl+X. Most of it is cut — and the paragraph's **last line
stays in the document**. Measured on `test/vscode-e2e/fixtures/torture.md`: the paragraph is

```markdown
A paragraph with **bold**, *italic*, `inline code`, and a [link](https://example.com).
Anchor line BRAVO with a second sentence.
```

and after the cut the document is 85 characters shorter — the first line is gone, `Anchor line BRAVO
with a second sentence.` is still there. The user sees a cut that half worked.

## Root cause, measured — shared with task 393, confirmed by the same instrumentation

`fixCut()` (`media-src/src/utils.ts:52`) monkey-patches `document.execCommand` globally so any
`'delete'` call is deferred into a `setTimeout`, to dodge a recursion error. `cutEvent` calls
`copy()` synchronously — which writes the clipboard — then calls `execCommand("delete")`, which
now lands a macrotask later, against whatever the selection has become.

Task 393's instrumented `document.execCommand` probe (depth counter + forced-synchronous test)
settled *why* the deferral exists and *why* it's the wrong fix: VS Code's webview clipboard bridge
answers Ctrl+X by calling `document.execCommand("cut")` from a host-message handler
(`HostMessaging.channel.port1.onmessage`), so `cutEvent`'s own `execCommand("delete")` runs WITH
execCommand already on the call stack — genuinely re-entrant. Forced synchronous, it is **silently
refused** (`execCommand` returns `false`, nothing deleted, no throw) — not merely mistimed.
`fixCut()`'s deferral dodges the refusal, but only by moving the delete to a macrotask where the
selection has already collapsed elsewhere. Instrumented: the `input` event that actually arrives is
`{ inputType: "deleteContentBackward", collapsed: true }` — a BACKSPACE, not a removal of the
selected range. That is the measured 85-character loss.

## The fix

`patchCutDeleteSync` (`media-src/esbuild-shared.mjs`, chained onto task 385's
`patchClipboardCollapsed` on the same vendored `util/editorCommonEvent.ts`) replaces
`execCommand("delete")` with a synchronous `range.deleteContents()` — a plain DOM mutation, not an
editing command, so Chromium's recursion guard never applies and it cannot race a later selection
state.

Unlike task 393's `insertHTML` delete, cut has no manual re-spin afterward to fall back on:
normally `execCommand("delete")`'s native `"input"` event drives Vditor's own `input()` pipeline
(spin the edited block, add one undo-stack entry), and `deleteContents()` fires no such event. So
the fix re-drives that pipeline BY HAND — `IRInput(vditor, range)` / `input(vditor, range)` for
wysiwyg — the exact pattern this same vendored file already uses elsewhere for the identical
situation (`fixCodeBlock`'s Enter handler, after its own `range.extractContents()`). Not a new
mechanism, a precedented one.

**sv is deliberately excluded, and it took a real regression to find why.** Measured, twice
(a minimal fixture and the full torture.md fixture): sv's cut was **never broken** — its
`execCommand("delete")` is not refused there the way ir/wysiwyg's is. The first version of this fix
routed sv through the same `deleteContents()` path anyway (fewer branches, looked harmless) — and
that **broke sv**: the DOM mutation happened, but sv has no `IRInput`/`wysiwyg input` equivalent to
re-drive by hand, so nothing told sv's own render/sync pipeline the edit happened and the cut
silently no-opped. An e2e regression pin caught it before it shipped; sv keeps its original,
already-correct `execCommand("delete")` call, still routed through `fixCut()`'s deferral (which
remains load-bearing for this one caller — not dead code).

## Multi-block selections — measured before writing any code, then fixed

Follow-up: the first version of this fix deliberately left multi-block selections unverified
rather than ship them blind (a selection spanning several top-level paragraphs, not just a
soft-break within one). Measured instead of assumed: cutting across three paragraphs on the
already-shipped single-block fix **lost no data at all** — the clipboard held exactly the selected
span, the removed range was exactly correct, and one Ctrl+Z restored the document byte-for-byte.
The one real defect: `Range.deleteContents()` does not merge block-level ancestors the way a
native contenteditable delete does — it only removes/splices nodes between the boundary points, so
the leftover prefix and suffix of the cut stayed as **two separate `<p>` elements** (a spurious
blank line) instead of joining into one paragraph.

Fixed by merging the two boundary paragraphs back by hand — moving the end paragraph's children
into the start paragraph and removing the now-empty end paragraph — **scoped to the plain case**:
both sides are ordinary `<p>` elements that are direct children of the editor root. This is the
single-soft-break-paragraph case the bug was originally reported against, generalised to N
adjacent top-level paragraphs; anything structurally more exotic (a selection crossing into a list
item, blockquote, table, or code block) is deliberately left **unmerged**, not unhandled —
`deleteContents()`'s default (no data loss, just two fragments where a merge would have made one)
is safe, and inventing a general block-type-pairwise merge algorithm for every combination would
be exactly the redesign-scale risk this task was scoped to avoid. Measured directly: a selection
crossing from a paragraph through a heading into a list's first item cuts correctly, loses
nothing, and correctly does NOT attempt to merge into the list.

The pre-existing reference-link reordering artifact found while testing this (undoing a cut on
`torture.md` swaps the trailing `---` and its reference-link definitions) is **not** part of this
fix — reproduces identically with and without the patch, so it predates this work and is a
separate, unfiled quirk in Vditor's own re-spin/undo mechanism for that document shape.

## Scope

- [x] Delete the selected range synchronously, so the removal cannot race the selection.
- [x] Keep undo working end to end (one Ctrl+Z restores the whole cut, matching `paste-real.spec`)
      — verified byte-for-byte on a fixture proven to reproduce the bug, and on a 3-paragraph
      multi-block cut (see Verification).
- [x] Keep the collapsed-cut guard intact — a collapsed Ctrl+X must stay inert (task 385) — the
      existing collapsed-guard tests in `clipboard-collapsed.spec.ts` still pass unchanged.
- [x] Re-enable `test.fixme('a real selection still cuts normally')` in
      `clipboard-collapsed.spec.ts` and prove it fails without the fix — done, RED-checked.
- [x] Cover the multi-BLOCK selection too — measured (no data loss, ever), fixed the paragraph-merge
      gap it surfaced, scoped and tested; see "Multi-block selections" above.

## Verification

- **Unit** — `test/backend/vditor-source-patches.test.ts`, `describe('patchCutDeleteSync…')` (9):
  pre-patch guard, the execCommand→deleteContents swap with the mode gate, sv's `execCommand`
  call left untouched, the new IRInput/wysiwyg-input/hasClosestBlock imports, the paragraph-merge
  condition and DOM-move calls, start/end blocks captured BEFORE `deleteContents()` collapses the
  range, anchor-drift throws.
- **Real-VS-Code e2e**:
  - `clipboard-collapsed.spec.ts` — the original `test.fixme`, now real and passing: the whole
    paragraph is cut (not 85 of 96 characters), no stray fragment survives, the rest of the
    document survives, and the whole cut paragraph reached the clipboard.
  - `cut-selection.spec.ts` (4) — IR: one Ctrl+Z restores the document byte-for-byte; WYSIWYG:
    cutting removes exactly the paragraph and the clipboard is correct; a 3-paragraph multi-block
    cut merges the remainder into ONE paragraph (not two), clipboard/caret/undo all correct; a
    selection crossing from a paragraph into a list does not merge across the boundary and still
    loses nothing. The single-block tests use a fixture that is `torture.md` with only its
    reference-links section removed — **measured, not assumed**, that a minimal single-paragraph
    document does NOT reproduce this bug at all (the unpatched build cut it correctly), so a
    fixture stripped down further than "torture.md minus the one confounding section" would
    silently stop testing anything.
  - `cut-selection-sv.spec.ts` (1) — the sv regression pin, in its own file: the identical
    selection+cut sequence, byte-for-byte the same code, mysteriously no-ops when it runs as a
    later test inside a multi-test file but works as the file's only test — a harness isolation
    quirk, not the product behaviour, isolating the file was cheaper than chasing it.
- **RED-checked:** with the patch stashed out, `clipboard-collapsed.spec.ts`'s re-enabled test
  fails on every retry (reproducing the exact original 85-character-loss signature); the
  `cut-selection.spec.ts` single-block tests were ALSO verified against the unpatched build with
  the correct (bug-reproducing) fixture before being trusted; the multi-block merge test fails
  (two unmerged paragraphs) with just the merge-logic hunk reverted, keeping the base cut fix.
- No regressions: the pre-existing collapsed-cut/collapsed-copy tests in the same file (task 385)
  are unchanged and still pass.
