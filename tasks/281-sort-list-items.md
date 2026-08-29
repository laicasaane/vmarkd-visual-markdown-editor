# Task 281 — Sort list items (A→Z / Z→A, nested-aware)

**Status:** planned · **Impact:** ⚪ low, micro · **Origin:** task 192 §11

## Problem

Sort-lines utilities (Tyriar, ~2.9M installs) prove the demand class but operate on TEXT
editors — unreachable inside our webview; VS Code's own sort commands likewise. No sort
affordance exists in any mode.

## Scope

- [ ] Command `VMDE: Sort list items A→Z` (+ Z→A) on the caret's list: **nested-aware** —
      children travel with their parent item; sort key = the item's rendered text
      (markers/checkboxes stripped for comparison, `[x]` state preserved); stable sort.
- [ ] Plain line-sort variant for an sv text selection (the generic case).
- [ ] One model edit, one undo step; ordered lists get renumbered by the same pass that
      task 255 uses (share it).
- [ ] Exposed via palette + task-215 context menu (no default chord).

## Out of scope

- Sort by due-date/priority (that's 272's tree + 105's DQL territory), table row sorting,
  natural/numeric collation options v1 (locale-aware `localeCompare` and done).

## Verification

L1: sort units — nested subtrees, mixed checkbox states, unicode/locale, stability.
L2: command in ir + sv → `getValue()` exact, one undo. (L3: fold one leg into an existing
command-surface spec when touched.)
