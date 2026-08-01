# 368 — table arrow-nav no longer auto-scrolls the caret into view (harness spec red)

**Status: ✅ FIXED — it was a HARNESS gap, not a product regression.**

## Symptom

`media-src/e2e/keybugs.spec.ts:353` — "🟢 arrow nav through table cells keeps the caret on screen
(auto-scroll) (ir)" fails: after 30 `ArrowDown` presses through a 40-row table in a 500px-high
editor, the scroller's `scrollTop` is unchanged, i.e. the caret walks off-screen exactly as it did
before the fix that test was written to guard.

The rest of the harness suite is green (387 passed, 1 skipped).

## Cause — nothing on the harness page was scrollable

Measured after 30 ArrowDowns in the harness: the caret's cell had reached y=1195 in a 720px viewport,
and **every ancestor up to `<html>` reported `scrollHeight === clientHeight`**:

```
PRE.vditor-reset  oy=auto     sh=1554 ch=1554 st=0
DIV.vditor-ir     oy=visible  sh=1554 ch=1554 st=0
DIV.vditor-content oy=visible sh=1554 ch=1554 st=0
DIV.vditor        oy=hidden   sh=1590 ch=1590 st=0
document.documentElement: scrollable = false
```

The harness never set a height, so Vditor grew to fit its content and there was no scroller at all.
The spec's own comment ("leave the 500px-high editor viewport") describes a precondition the page did
not provide — so `scrollTop` could not change no matter what the product did. Navigation itself was
working the whole time (the caret walked r0a → r30a).

## The product is fine — verified where it matters

`test/vscode-e2e/table-nav-scroll.spec.ts` (new) runs the same 40-row walk in the REAL VS Code
webview, where the pane IS height-constrained: the scroller moves, and the caret's row ends up inside
the viewport. It asserts `canScroll` FIRST, so it can never repeat this failure mode.

## Fix

- `keybugs-harness.ts` takes an opt-in `?height=<px>`; without it the editor still grows (other specs
  rely on that), with it the pane scrolls.
- The nav spec opens with `?height=500` and asserts something is scrollable before measuring — the
  precondition is now explicit instead of assumed.
