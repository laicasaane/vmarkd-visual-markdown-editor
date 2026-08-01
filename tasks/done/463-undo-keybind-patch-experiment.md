# Task 463 — `undo-keybind.ts`: settle patch-vs-runtime with a two-line experiment

**Status:** ✅ DONE — **experiment ran; verdict: the patch DOESN'T fully replace the module** ·
**Impact:** 🟢 `undo-keybind.ts` kept, header rewritten with the measured reason; no shipped code
change (patch tried, measured insufficient, reverted) ·
**Origin:** patch-vs-runtime audit 2026-07-30. **Related:** ADR-0004,
[task 465](465-adr-0004-doctrine-gaps.md).

## Why this exists

`undo-keybind.ts` intercepts Ctrl/Cmd+Z·Y and manually calls what Vditor's toolbar undo button calls.
The reason it has to is a one-condition gate in a file **we already patch three times**
(`util/editorCommonEvent.ts`, chained: `patchIrBlurExpand`, `patchClipboardCollapsed`,
`patchCutDeleteSync`):

```ts
// editorCommonEvent.ts:153
if (matchHotKey("⌘Z", event) && !vditor.toolbar.elements.undo) {
// editorCommonEvent.ts:160
if (matchHotKey("⌘Y", event) && !vditor.toolbar.elements.redo) {
```

Vditor binds the keys **only when the toolbar buttons are absent**. We ship undo/redo buttons
(`toolbar.ts:149-150`; they are not in `stubUnusedVditorButtons`'s stub list), so Vditor's own branch
is permanently dead in our config, and the keys fall through to the browser's native contenteditable
undo *and* VS Code's document-level undo — the latter force-pushes a full `update` → `setValue`
re-render, which makes the editor jump.

Dropping `&& !vditor.toolbar.elements.undo` (two lines, two anchors) makes Vditor handle its own keys.

## Why this is NOT filed as "just do it"

`undo-keybind.ts`'s own comment claims VS Code's forwarding listener sits on `window` in **bubble**
phase and that an editor-element bubble handler "fires too late". That does not match standard
bubble-phase ordering (child fires before parent) — **unless** VS Code's real forwarding mechanism
isn't a plain bubble-phase DOM listener at all. That mechanism lives in VS Code's webview host,
outside this repo, and **cannot be verified from source here**.

The precedent from the modules that legitimately use capture-phase `stopImmediatePropagation` on
`document` (`gap-paragraph.ts`, `callout-nav.ts`, `hr-nav.ts`) does **not** transfer: those beat
**Vditor's** handler, a different competitor than the VS Code forwarder this module targets.

So: reasoning from source is exhausted. Measure instead.

## The experiment (minutes, not hours)

- [x] Write `patchUndoToolbarGate` — anchor-asserted, dropping the two `!vditor.toolbar.elements.*`
      conditions; chain it into the existing `editorCommonEvent.ts` registry entry.
- [x] Add `event.stopPropagation()` in Vditor's branch (its handler is bound on the editor element in
      bubble phase; without this, a `window`-level listener still sees the event).
- [x] `node build.mjs`, then run the real-VS-Code undo/redo spec.
- [x] **Observe, don't assume:** does VS Code's own document-level undo still fire (editor jumps /
      scroll resets)? Does the toolbar button still behave identically to the keys?

## Outcomes — both are a completed task

- **Works** → delete `undo-keybind.ts`, keep the patch, note the result in ADR-0004 as a worked
  example of the "Vditor's own wrong condition → patch" rule.
- **Doesn't work** → keep the runtime module and **write the measured reason into its header**,
  replacing the currently unverifiable bubble-phase claim. That claim being wrong-or-unprovable is
  itself a defect worth fixing: it is the justification the next person will read.

## Verification — RAN, real VS Code, all 3 modes, all 3 chords

Extended `test/vscode-e2e/undo-redo-steps.spec.ts` (folded into its one existing `test()`, one VS
Code boot) with a discriminator that names the ENGINE, not just the resulting text — text alone is
identical whether Vditor's own undo/redo ran or VS Code's native document-level undo/redo did:

- `engineCalls.{undo,redo}` — wraps `vditor.undo.undo`/`.redo` (one `Undo` instance, shared across
  all 3 modes) so ANY call, from either mechanism, is counted.
- `doc.version` delta across one keypress, read only after settling past Vditor's own debounce
  cascade (`undoDelay` 800ms → `execAfterRender`'s own 800ms → `pending-edit.ts`'s 250ms
  host-forward debounce — ~1250ms minimum; a tight retry loop was tried first and produced a false
  "extra native undo" signal by resetting these nested timers every iteration).

`engineDelta === 1 AND versionDelta === 1` for one keypress means exactly one engine handled it and
nothing else mutated the document.

**Step 1 — the patch alone (interceptor disabled).** Widened the redo match to `matchHotKey("⌘Y",
event) || matchHotKey("⇧⌘Z", event)` (required — see finding 2 below) plus `stopPropagation()` in
both branches. Result: **GREEN across all 3 modes × all 3 chords** — `engineDelta=1`,
`versionDelta=1` everywhere, focus inside the editable element.

**Step 2 — the decisive check (focus OUTSIDE the editable element).** Vditor's handler (explicit
gate + toolbar-hotkey fallback) is bound on the EDITOR ELEMENT (`hotkeyEvent(vditor, this.element)`,
all 3 modes), not `window`. Set up a real pending redo, moved DOM focus to a throwaway button
outside `.vditor-ir`, pressed `⇧⌘Z`: **`engineDelta=0`, `versionDelta=0` — the key did NOTHING**, not
even VS Code's native redo. **Verdict: the patch does NOT fully replace the module** — it silently
loses "undo/redo keys work from anywhere in the webview," a real capability the window-bound
interceptor has and a source patch on Vditor's own (editor-scoped) code structurally cannot.

**Two findings that revise the task's own premise** (measured, not from source-reading):

1. Plain Ctrl/Cmd+Z and +Y were **already working correctly without `undo-keybind.ts` OR the
   patch**. `hotkeyEvent`'s generic toolbar-hotkey fallback loop (below the explicit gate, same
   function) matches those two hotkeys against the toolbar config regardless of button-presence and
   dispatches a synthetic click on the real Undo/Redo buttons — which calls `vditor.undo.undo/redo`
   directly and calls `event.preventDefault()`. Measured: with NEITHER mechanism, `⌘Z`/`⌘Y` still
   scored `engineDelta=1, versionDelta=1` — VS Code's native undo/redo never fired for those two.
2. Ctrl/Cmd+Shift+Z is the ONE gap neither the explicit gate nor that fallback loop covers — Vditor's
   toolbar config never declares a `⇧⌘Z` hotkey, so `preventDefault()` never runs for it in vanilla
   Vditor. RED run (neither mechanism) failed exactly and only there:
   `engineDelta=0` on `Control+Shift+z`, confirming this is the module's real, unique job.

**Red-then-green, twice.** With the FINAL test file, disabled `setupHistoryKeybind(window)` (patch
already reverted) → RED, same failure point (`⇧⌘Z` `engineDelta` `0` vs expected `1`). Restored the
call → GREEN, 1.4 min, including the focus-outside leg.

**What shipped:** `undo-keybind.ts` kept, unchanged in behavior. Its header comment rewritten (the
old "bubble-phase race" claim was the exact unverifiable/wrong thing this task called out — replaced
with the two measured findings above). `patchUndoToolbarGate` was written, proven to throw correctly
on a corrupted anchor (`node build.mjs` failed loudly, verbatim: `patchUndoToolbarGate: undo/redo
anchors not found in vditor util/editorCommonEvent.ts (version drift?)`), measured GREEN for the
in-editor case, then fully reverted (function, registry chaining, unit tests) rather than left as
dead code that the interceptor's capture-phase precedence would make unreachable — keeping unused
code that quietly never runs is worse than not having it, and would mislead a future reader into
thinking it does something. `test/vscode-e2e/undo-redo-steps.spec.ts` keeps the full matrix as a
permanent regression test for the shipped mechanism (interceptor), including the focus-outside leg.

**For task 465 (ADR-0004 doctrine):** this is a case where "Vditor's own wrong condition → patch"
looked applicable from source but wasn't the deciding factor — the deciding factor was reach
(window vs. editor-element scope), which no source patch on Vditor's own code can replicate without
becoming a `window`-bound module itself. Worth adding as a counter-example to that rule: check
whether the fix needs to work OUTSIDE the scope Vditor's own source can bind to before assuming a
patch is equivalent to a runtime interceptor.
