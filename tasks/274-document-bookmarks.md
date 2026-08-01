# Task 274 — Document bookmarks (block-anchored, labeled jump list)

**Status:** planned · **Impact:** 🟡 med · **Shares anchor module with:** 275 · **Origin:** task 192 §11

## Problem

Bookmarks (alefragnani, ~5.05M installs) decorates TEXT editors and is inert inside our
webview — custom-editor users LOSE a 5M-install capability. Zero bookmark code/tasks exist
in the repo.

## Scope

- [ ] Toggle bookmark at caret (command + chord via key capture + task-215 context menu):
      gutter dot decoration on the block (data-render, zero serialization impact — the
      chip discipline).
- [ ] Anchoring: block index + content hash + nearest-heading path so edits degrade
      gracefully (re-anchor by hash first, index fallback, drop with a notice when both
      fail). **Extract this as a shared `block-anchor` module — task 275 (reading
      position) uses the identical machinery; build once.**
- [ ] Jump list: quick-pick with optional labels (rename action), jump = the outline
      flash/scroll primitive; next/prev bookmark commands.
- [ ] Persistence: per-URI in `workspaceState` (LRU-capped); opt-in
      `vmarkd.bookmarks.saveInProject` file for sharing (the alefragnani pattern).

## Out of scope

- Cross-file bookmark browser v1 (quick-pick lists current + recent docs only), bookmark
  sync, annotations on bookmarks (labels only).

## Verification

L1: anchor module units (hash re-anchor after edits above/below, degradation ladder) —
shared with 275. L2: toggle renders the dot, `getValue()` byte-stable, jump scrolls +
flashes, label round-trips. L3 real-VS-Code (mandatory): toggle → reload window → bookmark
survives and jumps correctly (workspaceState persistence over the real host).
