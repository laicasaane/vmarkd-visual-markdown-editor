# Task 197 — Typewriter mode (caret vertically centered)

**Status:** planned · **Impact:** 🟡 med, cheap win · **Origin:** task 192 §2/§6

## Problem

Standard long-form writing aid in Typora/MarkText; absent here — yet Vditor has it built in:
`typewriterMode` (vditor `util/Options.ts:128`, consumed in `initUI.ts:133`,
`editorCommonEvent.ts:101`), never enabled, no setting.

## Scope

- [ ] Setting `vmarkd.editor.typewriterMode` (default off) → `typewriterMode: true` in
      `buildVditorOptions` (`media-src/src/vditor-options.ts`) + live config apply.
- [ ] Interplay checks (the real work): our `caret-scroll.ts`, `preview-scroll-preserve.ts`
      and the prepaint scroll capture must not fight the centering scroll — audit those three
      before enabling; disable typewriter centering while a Preview pane is active and during
      programmatic restores.
- [ ] Confirm behaviour in all three modes (Vditor centers per mode differently; sv left
      pane is the one users expect).

## Out of scope

- Focus/zen mode (task 198), custom center offset.

## Verification

- L1: options unit — setting present in built options, saved-options merge doesn't pin it
  (memory: saved Vditor options override settings — config merge must stay LAST).
- L2: type at document bottom → caret's block stays vertically centered (±1 line), scroll
  restore paths unaffected (scroll-preserve spec still green).
- L3 real-VS-Code (mandatory): same assertion on the real webview + mode switch keeps it.
