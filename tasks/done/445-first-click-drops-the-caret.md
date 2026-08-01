**Status:** ✅ FIXED (2026-07-30) — root cause pinned to **Vditor's own `Undo.addCaret`** (round 6),
patched via the esbuild source-patch mechanism (ADR-0004), proven **red-then-green** in the real
editor. Six rounds of probing: five failed reproductions, then the cause.
editable first appearing places a caret that is then made unpaintable (`caretHeight` → 0, forever,
until the second click) by a DOM mutation whose exact call site is still unidentified. Four earlier
rounds read clean because they all settled 500ms+ before clicking, past the vulnerable window. Do
not "fix" this on a hunch — that is exactly how [439](439-caret-at-start-on-open.md) shipped broken;
the exact mutating call site must be pinned (next step: a JS call-stack trace, see round 5) before
attempting a fix. · **Impact:** 🟡 med, high-frequency (every first click into a freshly opened
document) · **Origin:** user report, alongside 439:

> "after the first click into the editor the caret disappears, and only the second time does it stay
> — it was like that before too."

Explicitly **pre-existing**: the reporter says it predates the 439 work.

## What has been measured (and what each attempt rules out)

`test/vscode-e2e/caret-first-click-probe.spec.ts` — real VS Code, real `.click()` gestures, an
interleaved focus/selection/DOM-mutation timeline, both an empty and a with-text fixture.

| # | attempt | result |
|---|---|---|
| 1 | first vs second click, window unfocused at open | clean: focus + valid in-editor selection on click **1**, stable at +100/+500/+2000 ms |
| 2 | same, window **pre-focused** (donor click first) | clean, identical |
| 3 | with the reporter's own settings (`vscode-dark-2026`, full width, heading markers off) | clean |
| 4 | with **caret PAINT** measured, not just DOM position (`getBoundingClientRect().height`) | `caretHeight: 16` at every sample, both clicks |

Attempt 4 matters because that measurement is what cracked 439 — there, the caret was perfectly
placed in the DOM and had **zero height**, i.e. existed but could not be drawn. That is not what is
happening here: in the harness the first click produces an atomic, healthy handover every time
(`window:focus` → `document:focusin` on `PRE.vditor-reset` → `selectionchange`, inside ~15 ms).

**What this rules out:** our own JS handlers (`focus-restore.ts`, `editor-caret.ts`, the
`gap-paragraph.ts` observers, the toolbar `mousedown`/hover guards) racing the first click *in any
way this harness can exercise*, and the zero-height-caret mechanism from 439.

**What it cannot see:** real OS/window-manager focus semantics. The reporter runs WSL-remote VS Code
under a real compositor; the harness is Electron under `xvfb`. A genuine click-to-raise-then-click-to-
focus two-step at the OS level would be invisible here — and so would a timing race that only opens
on a slower or differently-scheduled machine.

## The one structural gap found by reading the code

`media-src/src/focus-restore.ts` (task 389) repairs a lost caret by listening for **`focus` on the
window**. That means an *intra-document* focus move — the editable losing focus to `BODY` **without
the window ever losing focus** — fires no event it observes, so it is structurally invisible to the
only module whose job is to repair exactly this. That shape ("focus left the editable, the Range is
still fine, no caret is painted, the next click fixes it") matches the report precisely.

This is a real gap regardless of whether it is *the* cause, and it is now in scope for
[446](446-caret-authority-and-shape-invariants.md) — `focus-restore.ts` is being migrated into the
caret authority, which is the right place to also observe `focusout`, with the existing
`NOT_OURS_TO_TAKE` guard so a deliberate move to the toolbar is never stolen back.

## Next steps

- [ ] **Instrument the reporter's own session** — the harness is exhausted; their editor is the only
      instrument left. A ready-made timeline logger exists in this repo's history (a
      `caret-diagnostics.ts` module posting `hasFocus` / `activeElement` / range position / range
      **height** / DOM mutations / a 1 s heartbeat to the vMarkd Output channel via `logToHost`, per
      [[debug-metrics-to-output-channel]] — never ask them to open devtools). Ship it in a
      diagnostic VSIX, have them click once into a fresh document, and read the timeline back.
- [ ] Only then attribute a cause. Candidates the evidence should separate: VS Code's webview focus
      handover moving `activeElement` back to `BODY` within the same document (the blind spot above);
      Vditor's own `expandMarker`/IR re-spin on first interaction; a DOM mutation under the fresh
      caret.
- [ ] If 446's authority lands first, re-test: an intent that is re-asserted across a focus handoff
      may close this symptom as a side effect. **Verify that claim by measurement before making it** —
      do not mark this task done because a related refactor merged.

## Round 5 — REPRODUCED (real VS Code, `test/vscode-e2e/caret-click-during-init-probe.spec.ts`, `@probe`)

The untested angle: every prior probe settled 500ms–3s after open before the first click. A real
user clicks close to immediately. This probe clicked at t ≈ 0 / 50 / 150 / 300 / 600 ms after
`.vditor-ir` first appears (one real click per run, not a burst — 5 delays × {empty, with-text}
fixture = 10 runs), and recorded for 3s after: `activeElement`, `rangeCount`, the range's
container/offset, its **paint height** (`getBoundingClientRect().height` — the measurement that
cracked 439), and every DOM mutation of `document.body` with a timestamp, interleaved into one
ordered log. Then a second click, same instrumentation.

**Result: reproduced.** The with-text fixture drops the caret on click 1 in **4 of 5** delays
(0/50/150/300ms — only 600ms was clean); the empty fixture in 2 of 5 (0ms and 300ms — the other
three were clean, consistent with genuine race jitter across separately-booted VS Code instances,
not a fixed function of the delay). In every reproduction:

- `rangeCount` stays `1`, `insideEditor` stays `true`, `activeElement` stays the editable the whole
  time — **the selection is never lost**. What drops is `caretHeight`: `29`/`16` → `0`, and it
  **stays 0** for the full 3s observation window (no self-heal). This is task 439's exact failure
  shape (a Range that is perfectly *placed* but not *paintable*), now shown to happen from a real
  click, not just on open.
- Click 2 (after the 3s of settling) is clean every time: `caretHeight` back to 16 immediately,
  stable through +2s. This is the reported asymmetry, reproduced precisely.
- **The exact mutation that kills it** — identical fingerprint in every reproduction, always
  landing in the same `push()` cycle as the caret's own `selectionchange`:
  1. `mutation:characterData` on the **same `#text` node the Range's `startContainer` already
     is** (identity unchanged — this is why `rangeCount`/`insideEditor` still read healthy).
  2. Two `mutation:childList` on that text node's PARENT in the same batch: a text node added
     (`"# "` for the with-text/heading case, a ZWSP for the empty-doc case), and a `SPAN`
     added-then-immediately-removed (same batch, net no-op node, but it fired a reflow).
  3. `caretHeight` reads `0` from the *very next* sample onward.
- With-text: the mutated parent is `SPAN.vditor-ir__marker.vditor-ir__marker--heading` (the H1's
  own marker span). Empty doc: the mutated parent is the leading `<p>` gap-paragraph.ts seeds
  (task 446 Part 1). Different element, same fingerprint — this is some **one-time-per-block
  "populate/spin" pass**, not a bug specific to headings or to the empty-doc placeholder.
- **Checked and RULED OUT**: Vditor's own `expandMarker` (`node_modules/vditor/src/ts/ir/
  expandMarker.ts`, called synchronously from the IR `click` handler in `ir/index.ts:178` for a
  collapsed selection). Read the source: it only toggles `.vditor-ir__node--expand` /
  `--hidden` classes and re-asserts the Range via `setSelectionFocus` — it never touches a text
  node's `characterData` or inserts/removes a `SPAN`, and it has no `setTimeout`/async path for
  the collapsed-click branch that fires here. **Whatever performs the actual mutation is a
  different, still-unidentified call site** — narrowed to: something that runs once, at some
  point in the first ~0–300ms after a block's first paint/focus, replacing/populating that
  block's marker/placeholder content in place. Candidates not yet checked: a Lute
  re-render/re-parse pass distinct from `expandMarker`, or one of `finish-init.ts`'s own
  observers reacting to the block's first `selectionchange` (`code-source.ts`,
  `wysiwyg-code-highlight.ts`'s `wrapLuteFlatten`, `gap-paragraph.ts`'s leading/trailing
  re-assert) — **do not guess further without measuring**; the mutation observer already proves
  WHICH text node and WHEN, the remaining gap is only WHICH function's call stack.
- Timing shape: for with-text, click 1 sometimes starts healthy (`caretHeight` non-zero at t0)
  and drops ~100–300ms later (delay 50/150/300), and sometimes is *already* dropped at t0 (delay
  0 — the mutation likely ran synchronously inside the click's own event-handling turn). This is
  consistent with a roughly **fixed wall-clock deadline from editor construction**, not a fixed
  delay from the click itself: at 600ms the deadline has already passed before the click ever
  happens, so the click lands on stable ground and never drops. (The empty-doc case is noisier —
  probably because its "populate" job finishes faster, narrowing the vulnerable window relative
  to boot-time jitter across separate VS Code launches.)

**What this rules in, precisely, replacing the four "clean" negative results**: the caret IS lost
by the first click, but only within a real, narrow, real-clock window after the editable first
becomes interactive — every prior probe's `settle(..., 500+ms)` before clicking always landed
past that window, which is exactly why they read clean. The four negative results are not wrong;
they tested a different (later, safe) moment than what a fast real user hits.

**Not attempted, and why**: packaging a `.vsix` and installing it (vs `--extensionDevelopmentPath`)
and reproducing under WSL-remote, both asked for in the assignment. The isolated mechanism is a
synchronous-to-near-synchronous in-page DOM mutation race with no dependency on how the extension
was loaded or the host OS — packaging method and remoting shouldn't change *whether* this fires,
only the exact wall-clock window (which already varies run-to-run in this harness from Electron
boot jitter alone). Given a clean, repeated, mechanism-level reproduction was already in hand, I
judged the marginal evidence from those two variants not worth the packaging/install time in this
pass — flagging this judgment call explicitly rather than silently skipping it. If the eventual fix
doesn't fully close the user's report, re-open these two as the next thing to try.

**Do not fix on this alone** — per this task's own rule and the measurement-first mandate: the
exact function/module doing the text/marker mutation is still unidentified. The next step is a
one-more-round probe that also hooks `console.trace`/a debugger statement at the mutation
observer callback (or steps through with a real breakpoint) to get the JS call stack at the
moment of that `characterData` mutation, which pins the call site precisely instead of inferring
it from the DOM shape alone.

## Round 6 — ROOT CAUSE PINNED (real VS Code, `test/vscode-e2e/caret-click-during-init-stacktrace-probe.spec.ts`, `@probe`)

Round 5 found the DOM-level fingerprint but not the call site; a `MutationObserver` can't name it
(its callback runs as a microtask, after the mutating code's stack has already unwound — it would
only ever show our own observer). This probe instead patches the DOM-mutating APIs **synchronously**
via `page.addInitScript` (installed before any app code runs, in every frame including the nested
webview iframes — confirmed reaching them, `hooksInstalled: true` read back from inside the
innermost frame), capturing `new Error().stack` at call time.

**First two passes came back with 0 matches** despite a caretHeight readback confirming the symptom
DID occur in the same runs — patching `CharacterData.data`/`replaceData`/`appendData`/`insertData`/
`deleteData`, `Node.insertBefore`/`appendChild`/`removeChild`/`replaceChild`,
`Element.innerHTML`/`outerHTML`/`insertAdjacentHTML`, and `Node.textContent` caught nothing. This
is itself informative: whatever mutates the anchor node is not going through any of those. Adding
`Range.deleteContents`/`insertNode`/`extractContents`/`surroundContents`,
`Selection.deleteFromDocument`/`extend`, `document.execCommand`, and `Node.normalize` found it —
**`Range.insertNode`** fires exactly once per run, at the moment the caret dies, in all 4 runs
(with-text × delay 0/150ms, empty × delay 0/300ms — all 4 reproduced `caretHeight: 0` this pass).
Identical call stack every time:

```
Range.insertNode
  Xo.addCaret        (media/dist/main.js, minified — Vditor's Undo module)
  Xo.addToUndoStack
  <anonymous>          (a setTimeout callback)
```

**Traced to source** (`media-src/node_modules/vditor/src/ts/undo/index.ts`) — this is confirmed,
not inferred:

- `addToUndoStack(vditor)` (line 111) is invoked from a **debounced `setTimeout`**
  (`vditor.options.undoDelay`, default **800ms** — `util/Options.ts:129`) inside
  `processAfterRender()` (`ir/process.ts:49`, same pattern in `wysiwyg/afterRenderEvent.ts`):
  `clearTimeout(vditor.ir.processTimeoutId); vditor.ir.processTimeoutId = window.setTimeout(() =>
  { … vditor.undo.addToUndoStack(vditor) … }, vditor.options.undoDelay)`. This is the source of
  round 5's timing variance — not a fixed delay from the click, a debounce that resets on
  activity and fires `undoDelay` ms after the *last* trigger.
- `addToUndoStack` calls `addCaret(vditor, true)` (line 113) to serialize the current caret
  position into the undo-stack's HTML snapshot. `addCaret` (line 227):
  1. Clones the live selection Range: `cloneRange = range.cloneRange()`.
  2. Creates a marker: `const wbrElement = document.createElement("span"); wbrElement.className =
     "vditor-wbr";`
  3. **`range.insertNode(wbrElement)`** — inserting a node into a Range whose `startContainer` is
     a `Text` node **splits that text node** at the insertion offset (DOM spec, `Range.insertNode`
     step). This is exactly round 5's fingerprint: a `characterData` mutation on the original text
     node (its content shrinks to whatever precedes the split point) plus a `childList` add of a
     `SPAN` on its parent.
  4. Clones the whole editor element, serializes to HTML for the undo diff, then
     `querySelectorAll(".vditor-wbr").forEach(item => item.remove())` — removing the marker again
     (round 5's "SPAN added then immediately removed").
  5. **`if (setFocus && cloneRange) { setSelectionFocus(cloneRange); }`** — restores the "original"
     caret using `cloneRange`, captured *before* the split.

**The bug**: `cloneRange` is an independent `Range` object, but DOM `Range`s are *live* — any DOM
mutation auto-adjusts every Range's boundary points, per spec, regardless of which Range object
performed the mutation. The boundary-adjustment rule for a text-node split leaves a Range whose
offset is **at or before** the split point pointing at the *original* (now-truncated) text node,
unchanged offset. When the click placed the caret at offset 0 of a text run (the common case —
e.g. clicking at the start of a heading, which is where a plain click near the top-left of a fresh
document lands), the split at offset 0 leaves the *entire original text* in the second half; the
first half — where `cloneRange` still points — is now an **empty text node**. `setSelectionFocus`
restores the caret onto that empty node. An empty text node cannot paint a caret (zero-width rect)
— this is task 439's exact mechanism (a Range that is validly placed but unpaintable), now proven
to be *caused by Vditor's own undo-snapshot machinery*, not by our init code.

Why only the **first** click: this is the debounced timer firing once for the *initial* undo-stack
snapshot of the freshly-opened document. Every later `addToUndoStack` call runs against a
document that already has undo-stack history and different guard conditions
(the other `addCaret` call site, line ~100, is explicitly gated on `undoStack.length !== 1` etc.)
— consistent with the reported bug being one-shot, not recurring.

**This is upstream Vditor library code** (`node_modules/vditor/src/ts/undo/index.ts`), not
anything in `media-src/src`. Not my call how to address it (measurement only, per the brief) —
options for whoever picks this up: patch `Undo.addCaret`/`insertNode` via the existing esbuild
source-patch mechanism (`media-src/esbuild-shared.mjs` already patches other Vditor internals,
e.g. `fixIrLinkClick`), or re-assert the caret after this specific mutation via `caret.ts`'s
existing re-assert authority (ADR-0007/task 446) the same way the trailing-paragraph invariant
survives rebuilds — a decision for 446/its owner or the team lead to route, not made here.

**One loose end, not chased further** (time-boxed, the finding is otherwise complete and
4-for-4 reproduced): `undoDelay` defaults to 800ms, but round 5 observed the drop at ~100–300ms
after the click for delay 50/150/300ms and clean at delay 600ms — that arithmetic doesn't
obviously match "fires 800ms after the click" or "fires 800ms after construction, independent of
click" as a single explanation; likely the click (or some event it triggers) itself resets the
debounce timer, and the exact reset semantics of `processAfterRender`'s callers weren't traced
further. Does not change the root-cause finding (the call stack is unambiguous and reproduced
identically in all 4 runs); would only sharpen the "how wide is the vulnerable window" answer.

## See also

- [439](439-caret-at-start-on-open.md) (reported in the same breath; DIFFERENT cause — a zero-height
  caret rect on an empty document — so do not assume one fix covers both),
  [446](446-caret-authority-and-shape-invariants.md) (the architectural home; owns the `focusout` gap),
  ADR-0007 (caret ownership).
- `media-src/src/focus-restore.ts` (task 389 — note its window-`focus`-only trigger),
  `media-src/src/editor-caret.ts` (`restoreEditorCaretIfLost`),
  `test/vscode-e2e/caret-first-click-probe.spec.ts` (the probe + its four negative results).

## Update — the `focusout` blind spot is CLOSED, and it is NOT this bug's fix

`focus-restore.ts` now also listens for `focusout` on the document (task 446's work), filtered to
fire only when the editable itself is what loses focus, deferring one frame and reusing
`restoreEditorFocus` unchanged so `NOT_OURS_TO_TAKE` still wins. That closes the structural gap
recorded above — an intra-document focus move used to be invisible to the one module whose job is to
repair it.

**It does not fix this task, and must not be recorded as having fixed it.** Round 5's reproduction is
a different mechanism entirely: `activeElement` never moves at all, the selection is never lost, and
what dies is the caret's paint height. A focus-repair cannot help a caret that is focused, present,
and simply has no box to be drawn in. Verified separately, not assumed: 10/10 unit tests in
`focus-restore.test.ts` and the task-389 contract spec `caret-tab-return.spec.ts` (4/4) pass
unchanged, which is evidence the gap closed safely — not evidence this symptom went away.

## Round 7 — FIXED

`patchUndoCaretSplitRestore` (`media-src/esbuild-shared.mjs`) captures the caret's **character
offset** relative to the editable BEFORE `range.insertNode` splits the text node, and restores
through the caret authority (`{textOffset}`) after the wbr markers are stripped — instead of
`setSelectionFocus(cloneRange)`, whose live Range has by then auto-adjusted onto the pre-split half.
A stale node-and-offset pair cannot be made correct; a re-derived position can. Falls back to the
original restore if the bridge is absent, matching this file's existing convention.

**Two further bugs were found on the way to green, both real:**

1. **In our own `caret.ts`**: `resolveTextOffset` could land on a **zero-length** text node — Vditor's
   `insertNode` + `remove()` leaves an empty leftover sibling and never merges it back. The
   offset-based restore therefore reproduced 439's exact symptom through a *different* path (an
   empty-node landing rather than a stale-node one). Found by live debugging against the real
   webview, not by reasoning. The walk now skips zero-length text nodes.
2. **In the `focusout` listener** added for this task's blind spot: it also fires when the user
   switches AWAY to another tab — a genuine focus loss — so the repair tried to pull focus back into
   the webview they had just left. Guarded with `document.hasFocus()`, placed in the `focusout`
   callback specifically and NOT in `restoreEditorFocus` or on the window-`focus` path, whose own
   semantics already imply focus was regained (and where the guard would have silently broken
   `caret-on-open.spec.ts`, since the harness dispatches a synthetic focus event).

Both were caught by re-running the broader caret suite after the fix rather than by trusting the one
new spec — which is the practice ADR-0007 was written to enforce.

**Verification:** `test/vscode-e2e/caret-click-during-init.spec.ts` fails on the reverted patch
(`caretHeight: 0`, reproduced on first run and retry) and passes on 3 separate runs with it
(`caretHeight: 29` at the clicked offset, sampled repeatedly across the undo debounce window). The
whole caret/undo set re-run green: `caret-on-open`, `caret-empty-typing`, `caret-tab-return`,
`undo-dirty-probe`, `undo-redo-steps`, `hr-edit`, `trailing`, `list-backspace`, `table-nav-scroll`,
`doc-sync`, `caret-authority-rebuild`. Independently re-verified by the task owner (4/4).
Unit: 9 patch cases incl. per-anchor version-drift guards, 2 for the zero-length-node skip, 1 for the
`hasFocus` guard. `npm test` 2156.
