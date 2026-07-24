# Task 195 — Spellcheck in the edit surfaces

**Status:** planned · **Impact:** 🔴 high · **Origin:** task 192 §2

## Problem

A WYSIWYG prose editor with no spellcheck at all: vendored Vditor hardcodes
`spellcheck="false"` on all three surfaces (vditor `ir/index.ts:38`, `wysiwyg/index.ts:50`,
`sv/index.ts:29`); zero override in our code, no setting. Typora/MarkText ship full
spellcheck.

## Scope

- [ ] **Probe first (blocking):** verify Chromium's native spellcheck actually produces
      squiggles + suggestions inside the VS Code webview (dictionary availability in the
      Electron webview is the open question). 10-line manual probe before any code.
- [ ] Setting `vmarkd.editor.spellcheck` (default **on** for prose if the probe passes).
- [ ] Flip the attribute on the contenteditable roots post-init (attribute-only, no vendored
      patch needed — a `setAttribute` sweep in `finish-init.ts`) + live config apply.
- [ ] Suppress squiggles where they are noise: `spellcheck="false"` on code blocks, math,
      diagram source panes, front-matter (element-level override inside the enabled root).
- [ ] Language: document that the dictionary follows the OS/VS Code locale — no per-doc
      language switch in scope.

## Out of scope

- Custom dictionaries, cSpell integration (extensions cannot reach into a webview),
  grammar checking.

## Verification

- L1: option plumb unit (config → init payload → attribute intent).
- L2: harness — root carries `spellcheck="true"`, code/math sub-elements carry `false`;
  live setting flip toggles it without reopen.
- L3 real-VS-Code (mandatory): attribute state on the real surfaces across ir/wysiwyg/sv;
  if the probe showed real squiggles, assert via `::spelling-error` presence is NOT
  automatable — attribute-level assertions + one manual screenshot for the user.

## Prior art — fork re-scan 2026-07-23 (task 358)

- `masterofarbs-audiodub/better-markdown-editor` → `feat/heading-ux` (2026-06-24): `feat: add opt-in markdown-editor.spellcheck setting`. An independent implementation of exactly this task in a sibling fork — confirms the attribute-flip approach and that the Chromium dictionary works in the VS Code webview (their probe passed), which is our blocking unknown.
