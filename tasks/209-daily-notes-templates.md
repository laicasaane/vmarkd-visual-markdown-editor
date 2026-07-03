# Task 209 — Daily notes + note templates

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §3

## Problem

No "open today's note" command and no templates: `createWikiPage` hardcodes a single
`# Heading` body (`src/wiki.ts:102-113`) — a natural template hook that was never exposed.

## Scope

- [ ] Command `vmarkd.openDailyNote`: settings for folder (`vmarkd.dailyNotes.folder`) and
      filename format (`YYYY-MM-DD` default); creates from the daily template if missing,
      opens in vMarkd.
- [ ] Templates: `vmarkd.templates.folder`; `createWikiPage` uses a configured default
      template (placeholders: `{{title}}`, `{{date}}`, `{{time}}`); command
      `vmarkd.newNoteFromTemplate` → quick-pick of template files.
- [ ] Keep wiki create-on-click flowing through the same template path (single code path).
- [ ] **Zettelkasten IDs** (added 2026-07-03, broad sweep — absorbed instead of a separate
      task): `{{id}}` placeholder in the template expander (configurable pattern, default
      `YYYYMMDDHHMMSS`), an `Insert note ID` command, and wiki-cache indexing IDs (in
      filename or body) so `[[20260703120000]]` resolves to the owning note.

## Follow-up (added 2026-07-03): calendar sidebar

- [ ] Month-view calendar (small webview-view or TreeView grid in the explorer container):
      days with existing daily notes get a dot (wiki-cache file index), click →
      `openDailyNote(date)` through the same template path, go-to-today. The Obsidian
      Calendar-plugin pattern — one of Obsidian's most-installed plugins (the VS Code
      marketplace class is tiny, but off-platform demand is proven). Keep it dumb: no
      events/agenda — that's 272's tree and 105's job.

## Out of scope

- Periodic notes (weekly/monthly), template scripting/JS.

## Verification

- L1 backend: filename-format + placeholder expansion units; create-if-missing flow on the
  vscode-mock (fs writes, open call).
- L3 real-VS-Code: run `openDailyNote` twice — first creates from template with expanded
  placeholders, second reuses; `newNoteFromTemplate` picker creates the chosen one.
