# Task 456 — Escape the editor by keyboard (the WCAG 2.1.2 keyboard trap)

**Status:** 📋 OPEN — implementation + caret-restore fix landed, one real-VS-Code-only flake
(pass rate ~1/6) still unresolved after 7 investigation rounds; see below before resuming.
**Impact:** 🔴 high — this is the ACTUAL violation ·
**Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem (re-verified 2026-07-30)

Focus can never leave the editable surface by keyboard. `tab: '\t'` is set (`vditor-init.ts:250`)
and Vditor's `fixTab` preventDefaults Tab whenever `options.tab` is set, so the toolbar and outline
are unreachable. That is a keyboard trap: WCAG 2.1.2 is not "hard to use", it is a failure.

## The design, and why it does not fight `tab: '\t'`

Escape arms a ONE-SHOT "next Tab leaves" flag; the following Tab moves focus to the toolbar instead
of inserting a tab character; any other key disarms it. Tab keeps indenting during ordinary editing —
the escape is an explicit two-key gesture, which is also the platform convention. This is why the
parent task's apparent conflict ("the fix fights a deliberate setting") is not real, and why the
design decision belongs in the task rather than being improvised at the keyboard.

Vditor has a TODO stub for this at `fixBrowserBehavior.ts:538` — read it before choosing a mechanism.

## Scope

- [x] Escape → arm; Tab → move focus to the toolbar; any other key → disarm. Pure state machine in
      `escape-arm.ts` (unit-tested, 11 cases, 100% coverage), DOM wiring in `escape-toolbar.ts`.
- [x] `role="toolbar"` + roving tabindex + ArrowLeft/Right traversal on the toolbar container.
      Escaping into a toolbar you cannot traverse is not an escape, so this ships together.
- [ ] Shift+Tab from the document start as the reverse gesture — NOT implemented. Classified as
      `'other'` (disarms like any other key) rather than a second gesture; skipped as out of the
      "if it falls out cheaply" bar once the real bug below ate the investigation budget.

Vditor's TODO stub at `fixBrowserBehavior.ts:538` (`if (event.shiftKey) { // TODO shift+tab }`) is
confirmed NOT usable: it's an empty placeholder inside `fixTab`, which still runs
`setSelectionFocus`/`execAfterRender`/`preventDefault()` unconditionally right after that branch
regardless of what fills it in — no hook for "Tab as escape" lives there. Capture-phase
interception ahead of Vditor's bubble-phase Tab handling (`escape-toolbar.ts`, same pattern as
`list-backspace.ts`) was required regardless.

## Two separate bugs found during verification — one FIXED, one still OPEN

Verifying the gesture in real VS Code surfaced two independent defects. **Read this whole section
before touching this code again** — it records four killed hypotheses with the exact evidence that
killed each one, specifically so nobody re-spends a VS Code boot re-testing them.

### Bug 1 — caret lost on return from the toolbar (FIXED)

`returnFocusToEditor()` (Escape while the toolbar has focus) called `editor.focus()` and stopped
there. Focusing the toolbar button in the first place had already collapsed the browser's Selection
(a `<button>` isn't text-selectable), so `.focus()` on the editor alone does not bring the caret
back — Chrome places its OWN default caret (the first text node, offset 0) as a side effect of
focusing a contenteditable with no live Range, which reads as "the editor is broken" the moment the
user types at the wrong position (or, if that position happens to be the very start of the
document, a tab-indent there gets reinterpreted by Lute as an INDENTED CODE BLOCK per CommonMark
and the literal `\t` never survives serialization — a second, purely test-side trap that cost a
round of its own: `escape-toolbar-harness.spec.ts`'s regression test now deliberately places its
caret mid-word, not at column 0, to avoid it).

Fixed by restoring the Range through the EXISTING `editor-caret.ts` snapshot
(`restoreEditorCaretIfLost`, already used by task 389/390's focus-restore path) in
`returnFocusToEditor()`. **Order matters**: restore the Range while focus is still on the toolbar
button (so `editor-caret.ts`'s "already has a real caret, don't touch it" guard doesn't wrongly
bail on Chrome's just-invented default caret), THEN call `.focus()` — matching `focus-restore.ts`'s
proven order, not the naive focus-then-restore order tried first. Confirmed by a dedicated chromium
harness test (`escape-toolbar-harness.spec.ts`, "restores a WORKING caret") that fails on the naive
order and passes on the corrected one — this part is solid and covered by a real regression test,
independent of bug 2 below.

### Bug 2 — the focus-landing flake (STILL OPEN, pass rate ~1-in-6)

The gesture (Escape then Tab) reliably ARMS and CONSUMES the Tab (no stray `\t` is ever inserted —
this half never failed, in any run, in any round) but only reliably lands on a toolbar button
**about 1 run in 6** in real VS Code. The chromium harness (no real VS Code, no OOPIF) is 100%
stable and has NEVER reproduced the flake in dozens of runs — this is real-webview-specific.
Measured twice, independently, both `--repeat-each=6 --workers=1 --retries=0`: 1 pass / 5 fail, and
separately 0 pass / 6 fail (consistent with a true ~1-in-6 rate; getting zero passes in six rolls at
that rate is unsurprising, not a worse regression).

**Four hypotheses were tested and killed, in order, each with hard data — do not re-test any of
these without new evidence:**

1. **`initRoving` install-time race** (toolbar not built yet when `installEscapeToolbar` first runs,
   so no item has `tabindex=0`) — **DEAD**. `focusToolbar()` recomputes `rovingItems`/`initRoving`
   FRESH on every call, never trusting install-time state. Confirmed empirically: a DOM probe read
   at the moment of every failure showed `{toolbarElExists:true, itemCount:26, hasTabIndexZero:true}`
   — identical, in every single failing run across both measurement rounds.
2. **A synchronous focus bounce** (focus reaches the button, then something bounces it back before
   the test can observe it) — **DEAD**. A capture-phase `focusin` recorder with the target and a
   timestamp, armed before the gesture, shows: on a PASS, `blur(PRE)→focusout(PRE)→focus(BUTTON)→
   focusin(BUTTON)` — clean. On every FAIL: `blur(PRE)→focus(PRE)→focusin(PRE)→focusout(PRE)` — all
   four events target the SAME element (PRE, the editor), no BUTTON event ever appears, in ANY
   failing run. Whatever happens, it never involves the button at the DOM-event level.
3. **`focus-restore.ts` stealing focus back** (its rAF-deferred `restoreEditorFocus` reads
   `document.activeElement`, hypothesized to still read `body`/mid-transition on a real run) —
   **DEAD**. Instrumented directly: on every failing run, `focusout`'s `relatedTarget` is
   already `null` at fire time (see finding below), and `restoreEditorFocus`'s own guard reads
   `activeElementDesc: "PRE.vditor-reset"` and bails via `guardMatched: "already-in-editor"` — it
   correctly does nothing. This module is innocent.
4. **Winning the propagation race with `stopImmediatePropagation()`** (this codebase's established
   fix for a capture-phase interceptor racing VS Code's own key handling — see `undo-keybind.ts`,
   task 463) — **TRIED, DID NOT CHANGE THE PASS RATE**. Applied to the `consumed` branch in
   `escape-toolbar.ts`'s `onKeydown`. Re-measured `--repeat-each=6`: 6/6 fail, focus trace
   byte-identical to before the change. **Kept in the code anyway, on convention grounds** — five
   other capture-phase interceptors in this codebase use it and leaving plain `stopPropagation`
   here would be an inconsistency for the next reader to re-litigate, but it is explicitly NOT a fix
   for this bug and must not be reported as one.

**The one finding that is NOT dead — `event.relatedTarget` is `null`.** On every failing run's
`focusout` (fired on the editor, the SAME instant the browser starts the focus transition),
`relatedTarget` — the element about to RECEIVE focus, populated synchronously by spec — is `null`.
`null` is the signature of focus leaving the DOCUMENT/WINDOW entirely, not moving between two
elements inside it. Combined with finding 2 above (no BUTTON event ever appears), this reads as:
the webview's own document loses focus outright, and gets it back later, landing on the editor —
not a same-document bounce.

**That was checked at one more level and still came back negative.** If focus was leaving the
webview iframe for the VS Code workbench (a real widget, or nowhere/BODY, then returning), the
*workbench's own* `document.activeElement` — read from `workbox` (the Playwright handle for the
whole Electron window, one level up from every other measurement in this investigation) — would
show something other than the iframe itself, at least momentarily. It never did: measured at both
0ms and ~300ms after the Tab keypress, across 6 consecutive failing runs, the workbench-level
`document.activeElement` was `{tag:"IFRAME", className:"webview ready", isIframe:true}` — identical,
every time, at both timestamps. **No passing run's workbench trace was captured** (the batch that
added this measurement happened to roll 0/6 passes) so the pass-vs-fail comparison on this specific
field is still outstanding, but the finding on its own is unambiguous: from VS Code's own
perspective, the webview iframe never loses focus at all during this sequence.

**Net: as of this writing, we do not know where `relatedTarget: null` comes from.** It rules out an
in-document bounce (finding 2) and rules out an outer-workbench focus transfer (the outcome-3
measurement above) simultaneously — a combination none of the five hypotheses tested so far
predicts. The mechanism is still open.

### Open design question for the user (do not decide unilaterally — surface, don't resolve)

If nothing below overturns finding 2/3 above (no in-document bounce, no workbench-level transfer),
the remaining candidates are either something in VS Code's webview/OOPIF plumbing invisible to any
page-level JS instrumentation, or a genuinely different mechanism nobody has framed correctly yet.
Before spending more rounds chasing it blind: VS Code's OWN editor has the identical "Tab is
normally an edit action, not a focus-navigation key" problem and solves it with a registered
command + keybinding — **Ctrl+M ("Toggle Tab Key Moves Focus")** — a platform-native precedent this
extension's users likely already know from the text editor. Worth checking, before any redesign,
whether that exact chord already does something (sensible or not) in this webview today. If the
Tab-based gesture turns out to be fighting a losing, unmeasurable race at the platform level, the
fallback is a registered VS Code command with its own keybinding (a chord VS Code doesn't already
claim) instead of continuing to contest Tab. That call belongs to the user, not to whoever picks
this task up next — do not make it unilaterally.

## CSS this needs, QUEUED not applied (2026-07-31)

Vditor strips the toolbar's focus ring outright — `index.css` has
`.vditor-toolbar__item .vditor-tooltipped:focus { outline: none; }` and only recolours the icon,
which on many themes is indistinguishable from hover or idle. That is defensible for a mouse click
and fatal here: this task's whole point is delivering keyboard-only users onto those buttons, and
landing them on an invisible target defeats it (WCAG 2.4.7 Focus Visible).

Held rather than applied because `main.css` is owned by task 464's audit while that runs. Apply
verbatim once 464 lands:

```css
.vditor-toolbar__item .vditor-tooltipped:focus-visible {
  outline: 1px solid var(--vscode-focusBorder, #007fd4);
  outline-offset: -1px;
  border-radius: 2px;
}
```

`:focus-visible`, not `:focus`, so a mouse click keeps Vditor's own ring-less styling untouched.
Negative `outline-offset` (an inset ring) because the toolbar's bounds are tight and an outward ring
clips against adjacent buttons.

**Note for whoever applies it:** task 464 is converting specificity-based `main.css` overrides into
`patchVditorIndexCss` source patches. This rule is NOT that class — it adds a ring Vditor never
had, rather than countering a wrong Vditor declaration, so it belongs in `main.css` under
ADR-0003's category 3. Do not let the 464 sweep reclassify it on sight.

## Verification

- [x] L1 unit: `escape-arm.test.ts` — 11 cases on the pure arm/disarm state machine, 100% coverage.
- [x] L2 chromium harness (`escape-toolbar-harness.spec.ts`, `media-src/e2e`): 3 tests, no VS Code
      boot — toolbar DOM sanity (live/attached/focusable), Escape+Tab reaches a toolbar button
      without mutating `getValue()`, and Escape-back-from-the-toolbar leaves a WORKING caret (Tab
      indents again afterward) — the regression net for bug 1's fix above. **All 3 reliably pass —
      dozens of runs across the investigation, zero flakes** — this layer cannot reproduce bug 2 at
      all (real-webview-specific, see above).
- [ ] L3 real-VS-Code (mandatory — key capture differs in the real webview): `escape-toolbar.spec.ts`
      — one `test()`, in order: negative leg (bare Tab still indents, no preceding Escape — this leg
      is reliable, see below), positive walk (Escape→Tab reaches the toolbar, `getValue()`
      unchanged, ArrowRight traverses — THIS is the leg that fails ~5/6 of the time, bug 2), the
      return leg (Escape from the toolbar restores focus AND the caret — untested independently of
      the flake above, since it depends on the positive walk landing first), and a Ctrl+Tab
      chord-collision leg that also proves the caret survived the return. Caret-placement
      precondition is asserted (and retried up to 3×) before the negative leg — an early run flaked
      there once, with no gesture involved at all; logged as a real, separate, since-unreproduced
      flake, not papered over with a longer settle.
      **Current measured pass rate: ~1/6 (bug 2, open).** Bug 1 (caret restore) is NOT independently
      confirmed at the L3 layer — every L3 run so far has failed at the positive-walk leg (bug 2)
      before ever reaching the return leg that would exercise bug 1's fix. Bug 1's only confirmed
      coverage is the L2 harness above, which is real coverage (same product code, same assertions)
      but not the mandatory real-webview layer. **Whoever resumes this: get the L3 suite to run
      leg 3 at all (i.e. make progress on bug 2, or gate/skip leg 2 temporarily) before trusting
      bug 1's fix is confirmed end-to-end.**

## Diagnostic instrumentation used during the investigation (removed, not preserved)

Every round of the investigation above (toolbar DOM probes, a `focusin` event recorder with
timestamps, a throwaway control-button focus test, `focus-restore.ts`-internal guard tracing, a
workbench-level `document.activeElement` probe) was temporary, spec-side or clearly marked TEMP
in-source, and has been stripped from `escape-toolbar.ts`, `focus-restore.ts` (now byte-identical
to before this task touched it), and `escape-toolbar.spec.ts` before this landed — none of it is in
the code history from here forward. If bug 2 needs re-investigating, re-derive the instrumentation
from this section's description rather than assuming any of it still exists; re-adding is cheap,
each individual probe took under an hour, the six VS Code boots per round are what's expensive.
