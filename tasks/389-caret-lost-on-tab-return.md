# Task 389 — BUG: the caret disappears after leaving the editor and returning to the vMarkd tab

**Status: 🔴 OPEN — reported by the user, not yet reproduced here.**

**Impact:** 🟠 medium-high (breaks the "pick up where I left off" flow; every return costs a click to
find the place again) · **Origin:** user report 2026-07-27

## What the user reports

Switch away from the vMarkd editor — to another tab, another editor group, elsewhere in VS Code —
then come back to the vMarkd tab: **the caret is gone.** Expected: it is exactly where it was left,
and blinking.

## What "gone" has to be pinned down to

Three different defects present identically to a user, and the fix differs for each. The first job
is to tell them apart:

1. **Focus lost.** The webview is showing but nothing is focused, so there is no caret to blink and
   the next keystroke goes nowhere (or to VS Code). Check `document.activeElement` and
   `document.hasFocus()` in the webview after the return.
2. **Focus kept, selection lost.** The editable surface is focused but `getSelection().rangeCount`
   is 0, or the range collapsed to the document start. Typing would then land at the top of the file
   rather than where the user was — the more damaging variant.
3. **Focus and selection kept, caret not PAINTED.** A rendering issue only: a real caret exists and
   typing works, but nothing blinks. This one is CSS/compositing, not state.

## Leads worth checking first

- vMarkd already has caret-preservation machinery (`caret-preserve.ts`) and a documented rule that
  focus-related behaviour is driven from `selectionchange` rather than `:focus-within`, because the
  latter does not work on Vditor's editable IR. A tab return may not fire whatever that machinery
  hangs off.
- The custom editor's webview is retained or re-created depending on `retainContextWhenHidden`; if
  the webview is torn down and rebuilt, the DOM selection is gone by construction and the caret has
  to be restored from saved state rather than expected to survive.
- Related but distinct: task 388 reports keyboard input dying after a click outside the editable
  surface, which did NOT reproduce on any target probed. If this defect reproduces, check whether
  388 is the same focus handling seen from another angle before treating them separately.

## Scope

- [ ] Reproduce in a real VS Code and classify it as (1), (2) or (3) above — do not design a fix
      before that is settled, they have different fixes.
- [ ] Restore the caret to its previous position on return, blinking.
- [ ] Do not scroll the document to do it — the view must stay where the user left it
      (`preview-scroll-preserve` and the focus-scroll rule already constrain this).
- [ ] Check every mode: IR, WYSIWYG and split.

## Verification

Real-VS-Code e2e in `test/vscode-e2e/`: place a caret at a known offset, switch editors, switch
back, then assert BOTH that the selection is where it was AND that a typed character lands there —
the second assertion is what separates a real restore from a cosmetic one.
