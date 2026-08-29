# Task 262 — Prose style check + readability shading (iA Writer/Zettlr-class)

**Status:** planned · **Impact:** 🟡 med (writers) · **Origin:** task 192 §10

## Problem

Task 195 (spellcheck) explicitly scopes OUT grammar/style; LSP-based tools (LTeX) cannot
reach a webview. Nothing covers: repeated-word detection, filler/cliché lists, over-long
sentences, readability shading — the iA Writer Style Check class.

## Scope

- [ ] Offline pure-TS rule pack (no network — the house ethos): repeated adjacent words,
      configurable filler/weasel word lists (per-locale: en + pl to start), sentence-length
      threshold, optional Flesch-class per-sentence readability shading (Zettlr-style).
- [ ] Decorations via Lute-invisible marks — the wrapLuteFlatten pattern proven by
      wysiwyg-code-highlight (Custom Highlight API stays rejected per that memory);
      paragraph-level shading via attributes. Serialization byte-stable by construction.
- [ ] Toggle from the status bar (writer flow: draft with it OFF, revise with it ON);
      per-rule settings under `vmde.style.*`; runs debounced off the edit-activity gate
      (never on the keystroke path — perf memory applies).
- [ ] Evaluate bundling `harper.js` WASM as a later grammar tier — record the verdict here
      (separate from the rule pack; do not block on it).

## Out of scope

- Full grammar checking (the harper evaluation decides IF ever), spellcheck (195),
  markdown lint (55), auto-fix.

## Verification

L1: every rule unit-tested (en + pl fixtures, code/math/front-matter exclusion).
L2: decorations render + update on edit, toggle clears them, `getValue()` byte-stable,
perf: no per-keystroke work (edit-activity spy). L3 real-VS-Code (mandatory): shading under
the real pipeline + toggle.
