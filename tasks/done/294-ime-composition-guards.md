# 294 — IME composition guard audit (from probe to fix)

**Status:** done · **Impact:** 🟡 med (CJK + dead-key diacritics — includes Polish!) · **Origin:** task 192 §12; upgrades the 190 §5 probe

## What it is & the effect

IME composition (Chinese/Japanese/Korean input, but ALSO dead-key diacritics used for
Polish on some layouts) types through a staged "composition" state that contenteditable
frameworks must explicitly guard — Lexical advertises composition handling as a core
selling point; ProseMirror's DOMObserver treats `isComposing` as sacred.

**Our exposure, code-verified:** exactly ONE VMDE module guards composition
(`wysiwyg-code-highlight.ts:358-371`) while SEVERAL capture-phase key interceptors run
BEFORE Vditor's own isComposing checks — undo-keybind, table-hotkey, hr-nav, callout-nav,
the general key capture (and every chord this backlog adds: 254, 287, 288…). A capture
handler firing mid-composition can commit/duplicate the composition buffer or teleport
the caret. Task 190 §5 lists IME as "completely dark"; this task turns the probe into a
concrete fix + regression net.

## Scope

- [x] **Audit every capture-phase keydown** in media-src for an
      `ev.isComposing || ev.keyCode === 229` early-return; add where missing; extract a
      tiny `guardComposition(ev)` helper so future chords (254/287/288…) can't forget it.
- [x] Suppress overlays during composition: hint menus, the 285 bubble, 248's math
      bubble, hover popovers (210) — one shared composing flag.
- [x] Verify the selectionchange-driven passes (gap-paragraph reclaim, callout re-sync,
      286's marker reveal) hold off until compositionend.
- [x] E2E harness: CDP `Input.imeSetComposition`/`insertText` driving real composition in
      the chromium harness — prose, inside a highlighted code block, inside a table cell;
      assert no duplication/caret jump (the 190-flagged risk).

## Out of scope

- Fixing vendored Vditor's own composition bugs if the probe finds any (file upstream
  pins; patch only if user-visible here), IME candidate-window positioning.

## Verification

L1: guard-helper unit. L2: the CDP composition matrix (the real net — first coverage
ever). L3: one real-VS-Code smoke leg if xvfb+ibus proves drivable — else document the
harness as the authoritative layer (real-webview IME needs OS IME, note honestly).

## Completed (2026-08-31)

VMDE now has one composition authority in the already-eager `util/caret-gesture.ts`. It owns the
document `compositionstart`/`compositionend` lifecycle, exposes the canonical
`guardComposition(event)` predicate (`isComposing`, legacy key code 229, or active shared state),
and toggles `data-vmde-composing` on the document root. Keeping the authority in an existing eager
module preserved the startup budget at 275/275 modules; the first separate-module implementation
correctly failed the 276/275 budget and was folded back rather than raising the ceiling.

Every content-relevant capture interceptor now returns before acting during composition: caret
invalidation, undo/redo, save flush, promoted format keys, manual rewrap and its delayed-undo
restorer, Auto Wrap cancellation, gap/trailing/callout navigation, section hoist, gated diagram
keys, Escape/toolbar and callout-popover handling, the shared caret gesture, and wiki-chip deletion.
The table hotkey suppression and Edit-in-VS-Code paths are guarded too even though their current
listeners are not capture-phase. Vditor panels and any VMDE overlay carrying `data-vmde-overlay`
are CSS-suppressed for the shared composing interval.

Selection-driven gap cleanup, callout caret-leave re-sync, and WYSIWYG code highlighting all read
the shared state. Deferred gap/highlight work resumes on an animation frame; callout preview
rebuild waits for the microtask after `compositionend`, so Vditor finishes committing staged text
before VMDE can restructure the callout. Tests pin both the hold and the post-event resume.

### Verification

- TDD RED/GREEN: the new helper initially failed to resolve, composing Ctrl+Z and key-code-229
  still invoked Vditor history, callout/gap selection passes ran at the wrong time, and callout
  re-sync initially occurred inside `compositionend` propagation. The final focused unit set passes
  224/224 across 17 files.
- Changed-helper coverage passes with 100% statements/functions/lines and 96.29% branches for
  `caret-gesture.ts`; the complete coverage suite passes 3,325/3,325 and the zero-coverage-module
  ratchet remains 15/15.
- Focused Chromium passes 1/1 with `--retries=0`: real CDP composition (`imeSetComposition` then
  `insertText`) commits `日本` exactly once in IR prose, a highlighted WYSIWYG code source, and an
  IR table cell while preserving the target caret, focus, and canonical Markdown.
- After `node build.mjs`, focused real VS Code passes 1/1 with `--retries=0`: the actual webview
  wires the shared lifecycle and CSS suppression, leaves a composition-shaped history chord
  untouched, and preserves caret/focus. This is a wiring smoke, not a claim of OS IME input.
- A real OS-IME attempt started a temporary D-Bus/IBus session and selected the installed
  `table:cangjie5` engine, but the isolated VS Code runner exposed no VS Code X11 top-level window
  under Xvfb (the X root contained only IBus helper windows; input focus was `None`). XTest therefore
  could not target Electron and produced no key or composition event. Per this task's boundary, the
  passing Chromium CDP matrix is the authoritative true-composition evidence.
- Build, all three typechecks, bundle size (506/508 KB), startup cost (275/275), root/webview/vendor
  audit, VS Code harness audit, lint, jscpd, dependency-cruiser, and coverage gates pass. The single
  aggregate `npm run quality` invocation was not green because the current baseline directly
  requires transitive `yazl` in `test/backend/package-local-preview-core.test.ts` without declaring
  it; `npm run knip` reproduces that unrelated pre-existing failure on unchanged HEAD. Its initial
  audit/coverage subfailures were sandbox DNS/child-spawn errors and passed when rerun with the
  required permissions.
- Per the protected queue policy, no full Chromium, FAST, or full real-VS-Code suite was run. No
  generated artifacts or `LOCAL_AGENT_TASK.md` are part of the task diff.
