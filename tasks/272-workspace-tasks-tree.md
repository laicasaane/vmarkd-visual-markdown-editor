# Task 272 — Workspace tasks tree view (all checkboxes/TODOs across the vault)

**Status:** planned · **Impact:** 🔴 high (PM/self-management; Todo Tree class, ~7.6M installs) · **Origin:** task 192 §11

## Problem

No interactive cross-file task view exists or is planned: 233 is single-FILE kanban, 268
emits a one-shot stats report, 105 is an in-doc DQL epic; the only contributed view is
`vmde.outline`. Todo Tree's 7.6M installs prove the demand: see every `- [ ]` (and
optionally TODO:/FIXME: markers) across the workspace in one tree.

## Scope

- [ ] Host-side index reusing the wiki-cache scan/watcher skeleton (the same infra 268
      reuses) and CONSUMING task-234's task-record shape (text, checked, due, priority,
      assignee) — one parser, do not re-implement.
- [ ] A **Tasks** TreeView in the explorer container next to `vmde.outline`: group by
      file / by tag / by due date (toggle), unchecked-count badges, filter box (TreeView
      message or quick-pick filter), completed hidden by default.
- [ ] Click → open the doc in VMDE at the item's line (task-52 reveal primitive;
      file-level until it lands).
- [ ] Toggle from the tree: checkbox click writes `[ ]`↔`[x]` via a WorkspaceEdit (or the
      task-220 toggle path when the doc is open in a webview) — one edit, undoable in the
      owning editor.
- [ ] Optional: configurable inline markers (`TODO:`/`FIXME:` in prose) as a second root.

## Out of scope

- Kanban rendering (233), DQL queries (105), recurrence logic (234 phase 2 — the tree just
  sorts by the due date it's given), notifications.

## Verification

L1: index units (nested tasks, tasks in callouts, exclusion of code fences, incremental
update on save/delete). L3 real-VS-Code (mandatory): fixture vault → tree lists expected
items grouped correctly; toggle from tree flips the file bytes; edit a doc → tree updates.
