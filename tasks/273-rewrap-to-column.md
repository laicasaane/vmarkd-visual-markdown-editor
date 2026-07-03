# Task 273 — Rewrap paragraph/selection to column (sv hard-wrap)

**Status:** planned · **Impact:** 🟡 med (repo-doc authors; Rewrap class, ~862K installs) · **Origin:** task 192 §11

## Problem

Repo documentation is commonly kept hard-wrapped at 80/100 columns; Rewrap (stkb, 862K
installs — Alt+Q, markdown-aware) is the standard tool and cannot reach our webview. No
wrap command exists anywhere in the backlog.

## Scope

- [ ] Command `vMarkd: Rewrap paragraph/selection` (Alt+Q via the webview key-capture
      pattern; palette + task-215 menu), primarily for **sv** mode: re-flow the caret's
      paragraph (or selection) to `vmarkd.editor.wrapColumn` (default 80; respect a ruler
      if we ever expose one).
- [ ] Prefix-aware: list items (continuation indent), blockquotes/callouts (`> ` prefix),
      nested combinations; NEVER touches code fences, front matter, tables, math or
      diagram fences.
- [ ] Semantics guards: with `reflowLineBreaks` semantics (task 83) hard breaks can be
      MEANINGFUL — rewrap only merges soft line breaks; two-space hard breaks and
      backslash breaks are preserved as boundaries. Interplay with minimal-diff writeback
      (61): the rewrapped block is one contiguous diff.
- [ ] ir/wysiwyg: lower value (rendered view doesn't show source wrapping) — offer the
      command but operate on the underlying block source.

## Out of scope

- Auto-wrap-while-typing, whole-doc reformat v1 (add a `Rewrap document` variant only
  after the paragraph version proves the guards), comment-aware code wrapping.

## Verification

L1 (the bulk): wrap engine units — prefixes, nested lists, hard-break preservation,
unicode width, idempotence (rewrap twice == once). L2: sv command → source rewrapped,
right pane semantically unchanged, caret kept, one undo. L3: one chord leg (Alt+Q under
real key capture).
