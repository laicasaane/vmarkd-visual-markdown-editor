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

## Out of scope

- Periodic notes (weekly/monthly), template scripting/JS, calendar UI.

## Verification

- L1 backend: filename-format + placeholder expansion units; create-if-missing flow on the
  vscode-mock (fs writes, open call).
- L3 real-VS-Code: run `openDailyNote` twice — first creates from template with expanded
  placeholders, second reuses; `newNoteFromTemplate` picker creates the chosen one.
