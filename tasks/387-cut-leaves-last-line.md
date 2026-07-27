# Task 387 — BUG: cutting a selected multi-line paragraph leaves its last line behind

**Status: 🔴 OPEN.** Root cause measured, fix NOT attempted — it means restructuring the cut path.

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

## Deterministic and pre-existing — both checked

- It fails **alone**, on every retry. This is not an ordering or isolation problem.
- It fails **identically with the collapsed-cut fix stashed out and the bundle rebuilt**, so it is
  not a regression from that work.

This corrects the record in task 385, which filed both cut tests as a "harness flake" that "passes
when the spec runs alone". That diagnosis was wrong. The instrumentation that disproved it: there
was never a stale webview (one `iframe.webview`, one tab, on every pass), and the live selection in
the frame under test was always exactly what the test had set.

## Root cause, measured

`fixCut()` (`media-src/src/utils.ts:52`) monkey-patches `document.execCommand` so a `'delete'` is
deferred into a `setTimeout`, working around a recursive-execution error. Vditor's shared `cutEvent`
calls `copy()` synchronously — which `preventDefault()`s the native cut and writes the clipboard —
and only then calls `execCommand("delete")`, which now lands a macrotask later, against whatever the
selection has become.

Instrumented in a real VS Code, the `input` event that actually arrives is:

```json
{ "type": "input", "inputType": "deleteContentBackward", "collapsed": true }
```

`deleteContentBackward`, not `deleteByCut` — i.e. the deferred delete ran as a BACKSPACE against an
already-collapsed selection, not as a removal of the range the user selected.

The recursion `fixCut` dodges is itself explained by the same instrumentation: **VS Code's webview
clipboard bridge answers Ctrl+X by calling `document.execCommand("cut")` from a host-message
handler** (stack: `HostMessaging.channel.port1.onmessage`). So the `cut` event Vditor handles was
itself raised by an `execCommand`, and calling `execCommand("delete")` from inside it is the
re-entrant case the browser refuses.

## Why it is not fixed here

Repairing it means untangling `fixCut`'s deferral from the cut path — deleting the range
synchronously (`range.deleteContents()` or equivalent) and then driving Vditor's input/serialization
pipeline by hand so undo and the spin still see the edit. That is a redesign of the most destructive
code path in the editor, on which task 385 already recorded "not something to do unreviewed". It is
scoped as its own task rather than bolted onto a stabilisation pass.

## Scope

- [ ] Delete the selected range synchronously, so the removal cannot race the selection.
- [ ] Keep undo working end to end (one Ctrl+Z restores the whole cut, matching `paste-real.spec`).
- [ ] Keep the collapsed-cut guard intact — a collapsed Ctrl+X must stay inert (task 385).
- [ ] Re-enable `test.fixme('a real selection still cuts normally')` in
      `clipboard-collapsed.spec.ts` and prove it fails without the fix.
- [ ] Cover the multi-BLOCK selection too (the fixture case is one paragraph with a soft break).

## Verification

L3 only — the defect lives in the interaction between VS Code's clipboard bridge, `fixCut` and
Vditor's cut handler, none of which the Playwright harness reproduces. Real keystrokes, real VS Code
clipboard, assert on the TextDocument.
