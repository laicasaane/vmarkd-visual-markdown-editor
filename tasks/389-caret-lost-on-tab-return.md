# Task 389 — BUG: the caret disappears after leaving the editor and returning to the vMarkd tab

**Status: ✅ DONE (2026-07-27)** — reproduced, classified by measurement, fixed, RED-checked in all
three modes.

**Impact:** 🟠 medium-high (breaks the "pick up where I left off" flow; every return costs a click to
find the place again) · **Origin:** user report 2026-07-27

## What the user reported

Switch away from the vMarkd editor — to another tab, another editor group, elsewhere in VS Code —
then come back to the vMarkd tab: **the caret is gone.** Expected: it is exactly where it was left,
and blinking.

## What it actually was — measured, in a real VS Code

Three different defects present identically to a user and have different fixes, so the first job was
to tell them apart rather than guess. Probed in the real webview across the round trip:

| | `activeElement` | `rangeCount` | caret offset | does a keystroke land |
| --- | --- | --- | --- | --- |
| before leaving | `PRE.vditor-reset` | 1 | 245 → 246 | **yes** |
| after returning | **`BODY.vscode-dark`** | 1 | **246 (unchanged)** | **no** |

So it was **variant 1: focus lost — and only focus.** The panel is created with
`retainContextWhenHidden` (`src/extension.ts`), so the webview DOM and with it the DOM selection
survive the round trip completely intact: the Range is still there, still collapsed, still at the
same offset. What VS Code does not restore is focus — it hands it back to the webview's `BODY`. A
Range in an unfocused document paints no caret and receives no keystrokes, which is exactly the
report: the caret is gone, and the place is still right underneath it.

The event sequence the frame sees is `focusout` → `blur` → `focus`, with `activeElement === BODY`
already set by the time `focus` fires. That makes the window's `focus` event the signal to hang the
repair off — no host message and no `onDidChangeViewState` plumbing needed.

**This also matters for the assertion design:** a spec that checked only the caret offset would have
PASSED against this bug, because the offset was never what broke.

## The fix

`media-src/src/focus-restore.ts` (`installFocusRestore`, wired once from `main.ts`): on the window's
`focus` event, one frame later (VS Code sets `activeElement` to BODY as part of the handover, and a
synchronous restore gets undone by the rest of it), put focus back on the editable surface —

- only when focus came back to a **bare BODY**. If it landed on anything focusable (a toolbar input,
  a dialog field), the user put it there and it is not ours to take.
- the surviving Range is **snapshotted before** `focus()` and re-asserted after, because focusing a
  contenteditable is allowed to collapse the selection to its start — landing the user at the top of
  the document is the damaging variant of this bug, not a fix for it.
- `focus({ preventScroll: true })`, and no `scrollIntoView`: restoring the caret is not a licence to
  move the viewport (same rule as the toolbar focus-scroll guard, task 71).
- if no Range survived at all (a re-created webview), it falls back to the caret snapshot
  `editor-caret.ts` already keeps on `selectionchange` for this class of focus loss.
- **and it does nothing at all when there is no caret to restore.** The same `focus` event fires on
  the webview's FIRST focus after open, before the user has clicked anywhere. Taking focus there
  would be a new behaviour rather than a repair — it hands the editor keys the user has not aimed at
  it yet, and Space/PageDown over a freshly opened document is meant to scroll it (the prepaint
  scroll capture). Unit-tested as its own case.

Mode-agnostic by construction: the surface is resolved through `activeModeElement`, so IR, WYSIWYG
and sv all go through the same path — and all three are covered by tests rather than by that claim.

## Scope

- [x] Reproduce in a real VS Code and classify it as (1), (2) or (3) — it is (1), focus lost.
- [x] Restore the caret to its previous position on return, blinking.
- [x] Do not scroll the document to do it.
- [x] Check every mode: IR, WYSIWYG and split.

## Verification

- **Unit:** `media-src/src/focus-restore.test.ts` — 7 tests (restores focus; keeps the surviving
  caret rather than resetting it; inert when focus is already in the editor; does not steal focus
  from another focusable element; falls back to the tracked caret when no Range survived; does NOT
  grab focus at open when the caret was never in the editor; inert with no editor mounted). 100%
  line coverage of the module.
- **Real-VS-Code e2e:** `test/vscode-e2e/caret-tab-return.spec.ts` — 4 tests. All three modes assert
  focus, the offset, AND that a character typed after the return lands right after one typed before
  the switch — the assertion that cannot be satisfied by a cosmetic restore. A fourth test pins the
  viewport so the restore cannot scroll.
- **RED-checked:** with `focus-restore.ts` removed and its `main.ts` wiring stashed, all three
  round-trip tests fail — each three times, on every retry — on `focus returned to the editor`. The
  no-scroll test passes in both states; it is a guard against the fix, not a repro of the bug.

## Note for task 388

Task 388 (clicking outside the editable surface kills all keyboard input) reported
`activeElement === BODY` with keystrokes silently no-oping — the same end state this defect produced,
reached another way. That probe did not reproduce on any click target, but this fix repairs the
BODY-focus state whenever the webview regains focus, so 388 should be re-checked against the current
build before anything else is done to it.
