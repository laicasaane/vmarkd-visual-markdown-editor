# Task 275 — Reading-position memory (reopen where you left off)

**Status:** planned · **Impact:** 🟡 med (daily papercut on long docs) · **Shares anchor module with:** 274 · **Origin:** task 192 §11

## Problem

VS Code natively restores cursor+scroll for TEXT editors across restarts; custom-editor
webviews get nothing — every reopen of a long doc lands at the top. Our `getState`/
`setState` exist only as protocol TYPE declarations (`src/protocol.ts:172-173`) with zero
call sites; retainContextWhenHidden covers in-session tab switches only; all the
scroll-preserve modules are in-session.

## Scope

- [ ] Persist `{blockAnchor (hash+index+heading path), scroll offset, caret path}` per doc
      URI: webview `setState` for cheap same-session restore + host `workspaceState`
      (LRU-capped) for cross-restart — the task-274 shared `block-anchor` module.
- [ ] Restore AFTER open settles: once prerender/instant-paint hands off and (if
      streaming) the anchor's chunk exists; must coordinate with the prepaint
      scroll-capture teaser (user wheel/key intent WINS over the restore — the memory's
      capture buffer is the signal) and with task 52's `revealLine` (an explicit reveal
      wins over the remembered position).
- [ ] Setting `vmarkd.restorePosition` (default on); save the position debounced on
      scroll/caret idle + on tab hide/close.

## Out of scope

- Cross-machine sync, per-mode positions (one position per doc; mode switches already
  preserve scroll in-session), history of positions.

## Verification

L1: anchor units (shared with 274) + precedence logic (user intent > revealLine >
restore). L2: harness — set state, re-boot the editor, scroll/caret restored to the
anchored block after simulated edits above. L3 real-VS-Code (mandatory): open → scroll
mid-doc → close tab → reopen → same block in viewport; ALSO the streamed-open path
(>700KB fixture) restores after chunks land.
