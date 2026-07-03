# Task 211 — Unlinked mentions

**Status:** planned · **Impact:** ⚪ low · **Depends:** task 201 (backlinks) · **Origin:** task 192 §3

## Problem

Plain-text occurrences of a page's name (or alias, after task 207) are never surfaced with
a "link it" action — the Obsidian companion feature to backlinks.

## Scope

- [ ] Host: for the active note, scan vault text for its title/aliases occurring OUTSIDE
      existing links/code/front-matter (bounded: word-boundary match, case-insensitive
      setting). Piggyback on the backlinks scan pass — do not add a second full-text sweep.
- [ ] UI: an "Unlinked mentions" section under the task-201 backlinks view; click reveals
      the file; inline action **Link** wraps the occurrence in `[[...]]` via WorkspaceEdit
      (preserve original casing as `[[Target|original]]` when it differs).
- [ ] Perf guard: cap scanned files / debounce; skip files > N KB.

## Out of scope

- Bulk "link all", fuzzy matching, mentions of headings.

## Verification

- L1 backend: matcher unit (word boundaries, inside-link/code exclusion, casing, cap),
  WorkspaceEdit shape for the Link action.
- L3 real-VS-Code: fixture vault — mention listed under the panel; Link action rewrites
  the source file's bytes correctly and the mention moves to backlinks.
