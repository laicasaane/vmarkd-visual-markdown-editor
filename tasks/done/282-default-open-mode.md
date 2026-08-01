# Task 282 — Default open mode setting (`ir | wysiwyg | sv | preview`)

**Status:** ✅ **DONE (2026-07-30)** · **Impact:** ⚪ low, tiny · **Origin:** task 192 §11

## Result

`vmarkd.editor.defaultMode` (`remember` default | `ir` | `wysiwyg` | `sv` | `preview`) plus the
per-glob map `vmarkd.editor.defaultModeByGlob`. Both resource-scoped, so they compose with
[task 295](295-resource-scoped-settings.md) — a docs root can open in Preview while a notes root
opens in WYSIWYG, which is most of the point.

Resolution happens **host-side** in one place (`src/default-mode.ts`), and the webview receives a
single already-resolved value: the glob needs the document's workspace-relative path, which the
webview does not have, and keeping the precedence host-side makes it unit-testable against the
config mock. A matching glob beats the flat setting (it is the more specific rule); an unknown mode
string in either is ignored rather than passed through to Vditor's constructor.

Two things the task flagged, both honoured and both pinned by a test:
- **The mode is the LAST merge in `buildVditorOptions`.** `buildInitOptions` spreads the SAVED Vditor
  options (which include `mode`) on top of the config, so merged any earlier the setting would be
  silently pinned by whatever mode the previous session ended in — the exact one-way-switch shape as
  the saved `preview.hljs.lineNumber` bug. Reversing the merge order turns 2 unit tests red.
- **The >700KB streaming force-ir override still wins.** It is applied to `defaultOptions.mode` in
  `vditor-init.ts` AFTER `buildVditorOptions` returns, so a `defaultMode: sv` cannot re-break the
  large-file gate. `preview` is additionally skipped on the streaming path: rendering a 700KB
  document into the preview pane is the same whole-doc freeze streaming exists to avoid.

`preview` is not one of Vditor's three modes — it is a toolbar overlay with no constructor option
and no public API — so it boots `ir` and then clicks the Preview button (`open-preview.ts`), letting
Vditor's own handler do the pane swap, toolbar disabling and outline re-render rather than
duplicating (and drifting from) that logic.

**Verified red-then-green:**
- L1 `test/backend/default-mode.test.ts` — 16 cases: the precedence matrix (glob > flat > remember),
  unknown-mode rejection in both, no-workspace documents, and the glob matcher itself (`**` across
  levels, `**/` matching zero directories, `*` staying inside one segment, `?`, regex
  metacharacters treated as literals, windows separators, whole-path anchoring).
- L1 `media-src/src/vditor-options.test.ts` — 4 cases on the merge order specifically.
- L3 `test/vscode-e2e/default-open-mode.spec.ts` — one boot, three legs: `sv` opens split (a real
  mode, and NOT the old hardcoded ir, so a pass cannot come from the old behaviour), `preview` opens
  ir with the overlay toggled on, and `remember` still defers to the saved options. With the merge
  disabled it fails 3/3.

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
