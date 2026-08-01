# Task 294 — IME composition guard audit (from probe to fix)

**Status:** planned · **Impact:** 🟡 med (CJK + dead-key diacritics — includes Polish!) · **Origin:** task 192 §12; upgrades the 190 §5 probe

## What it is & the effect

IME composition (Chinese/Japanese/Korean input, but ALSO dead-key diacritics used for
Polish on some layouts) types through a staged "composition" state that contenteditable
frameworks must explicitly guard — Lexical advertises composition handling as a core
selling point; ProseMirror's DOMObserver treats `isComposing` as sacred.

**Our exposure, code-verified:** exactly ONE vMarkd module guards composition
(`wysiwyg-code-highlight.ts:358-371`) while SEVERAL capture-phase key interceptors run
BEFORE Vditor's own isComposing checks — undo-keybind, table-hotkey, hr-nav, callout-nav,
the general key capture (and every chord this backlog adds: 254, 287, 288…). A capture
handler firing mid-composition can commit/duplicate the composition buffer or teleport
the caret. Task 190 §5 lists IME as "completely dark"; this task turns the probe into a
concrete fix + regression net.

## Scope

- [ ] **Audit every capture-phase keydown** in media-src for an
      `ev.isComposing || ev.keyCode === 229` early-return; add where missing; extract a
      tiny `guardComposition(ev)` helper so future chords (254/287/288…) can't forget it.
- [ ] Suppress overlays during composition: hint menus, the 285 bubble, 248's math
      bubble, hover popovers (210) — one shared composing flag.
- [ ] Verify the selectionchange-driven passes (gap-paragraph reclaim, callout re-sync,
      286's marker reveal) hold off until compositionend.
- [ ] E2E harness: CDP `Input.imeSetComposition`/`insertText` driving real composition in
      the chromium harness — prose, inside a highlighted code block, inside a table cell;
      assert no duplication/caret jump (the 190-flagged risk).

## Out of scope

- Fixing vendored Vditor's own composition bugs if the probe finds any (file upstream
  pins; patch only if user-visible here), IME candidate-window positioning.

## Verification

L1: guard-helper unit. L2: the CDP composition matrix (the real net — first coverage
ever). L3: one real-VS-Code smoke leg if xvfb+ibus proves drivable — else document the
harness as the authoritative layer (real-webview IME needs OS IME, note honestly).
