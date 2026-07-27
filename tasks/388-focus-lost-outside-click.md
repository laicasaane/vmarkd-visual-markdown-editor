# Task 388 — REPORTED: clicking outside the editable surface kills all keyboard input

**Status: ⚪ NOT REPRODUCED (2026-07-27).** Filed as a negative result, not as a confirmed bug —
needs repro steps from the reporter before any fix is designed.

**Impact:** would be 🔴 high if real (typing stops working) · **Origin:** task 385's second
investigation (a parallel agent), reported alongside findings that DID hold up

## What was reported

Clicking outside the editable surface — the toolbar, or the webview padding — leaves
`document.activeElement === BODY` with no Range, after which **all** keyboard input silently
no-ops: typing included, not just paste.

## What was measured

Probed in a real VS Code against `torture.md`, in the current build. Every candidate for "outside
the editable surface" was clicked at its extreme edge (position `1,1`, i.e. padding rather than any
child control), after first placing a caret in a paragraph and confirming a baseline keystroke
lands:

| clicked | `document.activeElement` | ranges | did a subsequent keystroke land in the document |
| --- | --- | --- | --- |
| `.vditor-toolbar` | `PRE.vditor-reset` | 1 | **yes** |
| `.vditor` | `PRE.vditor-reset` | 1 | **yes** |
| `body` | `PRE.vditor-reset` | 1 | **yes** |
| `.vditor-ir` | `PRE.vditor-reset` | 1 | **yes** |

`activeElement` never became `BODY`, the selection never dropped to zero ranges, and typing landed
in the TextDocument every time. The reported symptom does not reproduce on any of those targets.

## Why this is filed rather than dropped

A negative result is worth keeping: without it the next person reads the claim in task 385 and
either re-runs the same probe or, worse, "fixes" a defect that is not there. The claim is not
disproved in general — only on the four targets above, driven by a synthetic Playwright click.
Plausible gaps this probe does not cover:

- a REAL mouse click (Playwright's click is a trusted input event, but the reporter may have used a
  different route entirely — a keyboard shortcut, a VS Code panel, an editor-group switch);
- focus leaving VS Code altogether and coming back;
- a different build — the reporter's environment was not pinned, and the user's installed VSIX was
  **1.2.2** while the repo was at **1.2.3**;
- a mode other than IR.

Note the overlap with the separately reported caret defect in task 389 (caret gone after leaving and
returning to the vMarkd tab) — if that one reproduces, this report may be the same underlying focus
handling seen from a different angle, and should be re-checked against it rather than probed again in
isolation.

## Scope

- [ ] Get concrete repro steps (which mode, what was clicked, what stopped working, VSIX version).
- [ ] Re-probe against those steps; if it reproduces, promote this file to a real bug task.
- [ ] If it reproduces only via task 389's path, fold it in and close this one.
