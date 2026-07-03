# Task 282 — Default open mode setting (`ir | wysiwyg | sv | preview`)

**Status:** planned · **Impact:** ⚪ low, tiny · **Origin:** task 192 §11

## Problem

Mode is hardcoded `'ir'` (media-src/src/main.ts:311) with only the session-persisted
saved-options override. 658K installs of "Auto-Open Markdown Preview" (hnw) prove the
read-mostly demand: many users want to OPEN in read-only Preview (or their pet mode) by
default, not per-session stickiness.

## Scope

- [ ] `vmarkd.editor.defaultMode`: `remember` (today's behaviour, default) | `ir` |
      `wysiwyg` | `sv` | `preview`. `preview` boots into the Preview toggle state on top
      of ir.
- [ ] Optional per-glob map (`vmarkd.editor.defaultModeByGlob`: `{"docs/**": "preview"}`)
      — cheap and covers the docs-vs-notes split; explicit value wins over `remember`.
- [ ] **Gotcha (pinned by memory):** the config-derived mode must be the LAST merge in
      `buildVditorOptions` or stale saved options pin it (`[[saved-vditor-options]]`);
      also respect the >700KB force-ir streaming override (task 187/188 wiring) — a
      defaultMode of sv must not break the large-file gate.

## Out of scope

- Per-document front-matter mode override (could ride 207 later — note only), changing
  what `remember` persists.

## Verification

L1: mode-resolution unit (precedence: streaming gate > explicit setting/glob > remembered >
ir). L2: harness boots per setting value incl. preview state. L3 real-VS-Code: set
`defaultMode: sv` → open → Split active + status-bar label; large-file fixture still
forces ir.
