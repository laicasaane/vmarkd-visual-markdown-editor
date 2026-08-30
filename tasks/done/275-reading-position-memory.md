# Task 275 — Reading-position memory (reopen where you left off)

**Status:** DONE 2026-08-31 · **Impact:** 🟡 med (daily papercut on long docs) · **Shares anchor module with:** 274 · **Origin:** task 192 §11

## Problem

VS Code natively restores cursor+scroll for TEXT editors across restarts; custom-editor
webviews get nothing — every reopen of a long doc lands at the top. Our `getState`/
`setState` exist only as protocol TYPE declarations (`src/protocol.ts:172-173`) with zero
call sites; retainContextWhenHidden covers in-session tab switches only; all the
scroll-preserve modules are in-session.

## Scope

- [x] Persist `{blockAnchor (hash+index+heading path), scroll offset, caret path}` per doc
      URI: webview `setState` for cheap same-session restore + host `workspaceState`
      (LRU-capped) for cross-restart — the task-274 shared `block-anchor` module.
- [x] Restore AFTER open settles: once prerender/instant-paint hands off and (if
      streaming) the anchor's chunk exists; must coordinate with the prepaint
      scroll-capture teaser (user wheel/key intent WINS over the restore — the memory's
      capture buffer is the signal) and with task 52's `revealLine` (an explicit reveal
      wins over the remembered position).
- [x] Setting `vmde.restorePosition` (default on); save the position debounced on
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

## Prior art — fork re-scan 2026-07-23 (task 358)

- `zaaack` PR #166 `fix: preserve scroll position across file switches and eliminate flash of unstyled content` (0.1.18), plus their follow-up doc commit clarifying that the webview zoom-flash is specific to the dispose+recreate transition. In-session file-switch scope only (not cross-restart), but it is the FOUC-free restore ordering this task has to get right.

## Implementation

- `nav/block-anchor.ts` is the shared Task 274/275 identity primitive. It fingerprints the
  serializer-owned block text/type, records its ordinal and heading path, resolves unique hashes
  first, uses heading ancestry to disambiguate duplicates, and degrades to a bounded index.
- `nav/reading-position.ts` stores the viewport anchor/offset plus a caret-block DOM path in merged
  webview state, posts debounced scroll/selection snapshots, flushes on hide/pagehide/dispose, and
  restores only after `runFinishInit`. That ordering naturally waits for streamed chunks to finish.
- Captured prepaint input and explicit heading/source reveals cancel the pending restore. Folded or
  hoisted targets are made visible before scroll/caret placement. Document scrolling uses viewport
  origin zero; nested editor scrollers use their own bounding rect.
- The host validates states and keeps a 50-document MRU list in `workspaceState`. The resource-
  scoped `vmde.restorePosition` setting defaults on and disables both capture and restore when off.

## Verification evidence

- Focused Vitest: 9 files / 130 tests passed for anchors, precedence, host LRU/validation,
  protocol/session wiring, manifest/module boundaries, and init/router lifecycles. Strict webview
  and real-VS-Code type checks passed.
- Full coverage: 236 files / 3,420 tests passed; aggregate 74.81% statements / 67.87% branches /
  77.53% functions / 76.61% lines, with the zero-coverage ratchet at 15/15.
- Focused Chromium coverage `reading-position.spec.ts --retries=0`: 1/1 passed. It reboots after
  inserting content above the saved location and restores the same viewport block plus caret;
  `reading-position.ts` reached 81.78% line coverage. Earlier RED iterations exposed and fixed the
  document-scroller viewport-origin bug.
- `node build.mjs`: passed. Bundle/startup gates passed at 543/546 KB, 278/278 eager modules, and
  29.4/34 KB largest module; lazy-engine budgets remained unchanged.
- Focused real VS Code `reading-position.spec.ts --retries=0`: 1/1 passed (16.8 s test). One VS Code
  boot covers ordinary close/reopen and a >700 KB streamed document close/reopen, with the saved
  block in view and caret restored after streaming. The first invocation inherited
  `ELECTRON_RUN_AS_NODE` and never launched Electron; the documented cleaned-environment rerun was
  the no-retry passing result.
- The aggregate quality stages passed after removing one Task 275 unused export; final knip retains
  only the unrelated `yazl` baseline in `test/backend/package-local-preview-core.test.ts`. npm and
  vendored audits found no applicable vulnerabilities. Per the queue's minimal-test policy, no full
  Chromium, FAST, or full real-VS-Code suite was run.
