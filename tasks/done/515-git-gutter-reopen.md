# 515 — Git change gutter is not primed when a changed file opens or reopens

**Status:** ✅ DONE (2026-08-28) · **Impact:** 🟡 visible state is missing after a normal reopen ·
**Origin:** user report, 2026-08-28 · **Follow-up to:** [task 17](17-git-gutters.md)

## Outcome

`EditorSession` now passes its existing Git-diff scheduler into the `ready` handler and primes it
only after the awaited initial `update` has been posted. The existing 300 ms debounce,
same-content deduplication, Git lookup, diff computation, and webview renderer remain the only
implementation path.

Host coverage pins the lifecycle boundary: `start()` alone emits no `diff-info`, then `ready`
emits the initial `update` before one non-empty diff. The focused real-VS-Code spec now creates a
temporary multi-root workspace file plus a disposable Git repository, verifies edit/save markers,
closes and reopens without another edit, verifies the restored marker and block alignment, then
removes both workspace and repository without modifying tracked fixtures.

## Problem

The thin Git change bars at the left edge of editor blocks work while a file is being edited, but
disappear after the file is closed and reopened. The saved file still differs from Git `HEAD`; only
the visual markers are missing. Another edit or save wakes the feature up and makes the bars appear
again.

“Git gutter” and “Git change markers” are both accurate names for this UI. The current colors come
from VS Code's editor-gutter theme variables: green for added content, blue for modified content,
and red for removed content.

## Confirmed root cause

Task 17's host-side scheduler is created in `EditorSession.start()`:

- `src/session/editor-session.ts` builds `scheduleDiffInfo` with `createDiffScheduler` and
  `makeDiffComputer`.
- The scheduler is called from `onDidChangeTextDocument` and `onDidSaveTextDocument` only.
- A newly opened session never schedules the document's existing `HEAD` comparison.
- `media-src/src/bridge/message-router.ts` deliberately resets `lastDiffChanges` and clears old
  markers during a fresh `init`, so a reopened webview correctly starts empty and stays empty until
  the host posts `diff-info`.

The existing tests miss this lifecycle boundary. `test/backend/git-diff.test.ts` proves the
scheduler and Git lookup in isolation; `media-src/e2e/diff-markers.spec.ts` proves DOM rendering;
and `test/vscode-e2e/diff-gutter.spec.ts` proves that an edit made after opening triggers a marker.
None proves that a file which already differs from `HEAD` is compared during initial open or reopen.

## Required behavior

- Opening a tracked Markdown file whose current bytes differ from Git `HEAD` renders the appropriate
  change markers without requiring a new edit, save, mode switch, or resize.
- Closing and reopening that changed file renders the same markers again.
- An unchanged tracked file renders no markers.
- Files outside Git, files with no `HEAD` blob, and files over the existing size cap continue to
  degrade to no markers without an error dialog.
- Existing edit/save refreshes, debounce behavior, block mapping, marker colors, and rename-aware
  path lookup remain unchanged.

## Implementation direction

Use the existing scheduler and message path; do not add a second diff implementation or webview
state store.

1. Make the session's existing `scheduleDiffInfo` callable from the `ready` handler without
   duplicating `makeDiffComputer` or bypassing `createDiffScheduler`.
2. After the `ready` handler has successfully posted the initial `update` payload, schedule the
   current `TextDocument` content once. This ordering is required: posting `diff-info` immediately
   after assigning `webview.html` can race the webview message listener and recreate the same
   dropped-message class guarded by task 420.
3. Let the scheduler's existing 300 ms debounce and same-content deduplication handle overlap with
   an edit or save that happens during startup.
4. Keep the inline-init path correct. Inline init still sends the normal `ready` echo; the initial
   diff must be scheduled from the completed handshake even when the webview no-ops the duplicate
   content update.

Expected implementation surface:

- `src/session/editor-session.ts` — prime the bound Git-diff scheduler after the ready/init
  handshake.
- `test/backend/editor-session.test.ts` — prove the session wiring and message order.
- `test/vscode-e2e/diff-gutter.spec.ts` — prove reopen behavior through the real VS Code custom
  editor and built-in Git extension.

## Regression tests

### Host unit

Extend `test/backend/editor-session.test.ts` with an active fake `vscode.git` extension whose
repository contains a `HEAD` blob for `/ws/note.md`. Construct the session with current text that
differs from that blob, use fake timers for the 300 ms scheduler, and assert:

1. `start()` alone does not post `diff-info` before the webview's `ready` message;
2. receiving `ready` posts the initial `update` first;
3. advancing the scheduler posts one non-empty `diff-info` for the current document;
4. the initial `update` precedes `diff-info` in `mock.calls.postMessage`.

This must exercise `EditorSession` wiring. Another isolated `createDiffScheduler` test is not a
substitute for the missing lifecycle coverage.

### Real-VS-Code

Extend `test/vscode-e2e/diff-gutter.spec.ts` with one focused default-tier regression. Use a
disposable temporary Git repository so the test never changes a tracked repository fixture:

1. create a temporary directory, initialize Git locally, configure a test-only name/email, commit a
   Markdown file, and add that repository as a temporary VS Code workspace folder;
2. activate `vscode.git` and wait until its API reports the temporary repository;
3. open the committed file with `vmarkd.editor`, edit and save it, and confirm a marker appears;
4. close the custom editor, reopen the same saved file, and make no further edit or save;
5. poll the reopened webview for `.me-diff-marker--modified` and verify it aligns with the changed
   block;
6. remove the temporary workspace folder and repository in `finally` cleanup.

Use observable readiness and marker conditions, not a fixed settle sleep. A screenshot is optional;
the durable assertion is the marker DOM and its changed-block alignment.

## Verification

Run from the repository root unless a command says otherwise:

```bash
npx vitest run --config test/vitest.config.ts test/backend/editor-session.test.ts test/backend/git-diff.test.ts
node build.mjs
npm run typecheck:vscode-e2e
xvfb-run -a npm --prefix test/vscode-e2e test -- diff-gutter.spec.ts
npm run test:coverage
npm run quality
git diff --check
```

Inspect changed-line coverage for the new host lifecycle branch. Report retries separately; a
retry-recovered real-VS-Code run is not a pristine first-attempt pass.

## Out of scope

- Changing gutter colors, thickness, block-to-source mapping, or deleted-line placement.
- Character-level or line-exact marker placement inside a rendered block.
- Refreshing markers when Git `HEAD` changes because of commit, checkout, or branch switch while the
  editor remains open; this task covers initial open/reopen priming only.
- VS Code's tab dirty dot after undo (task 181) and minimal-diff writeback (task 61).

## Completion checklist

- [x] Initial ready/init primes the existing Git-diff scheduler after the webview can receive it.
- [x] Unit coverage proves the initial message ordering and non-empty diff.
- [x] Real-VS-Code coverage proves edit/save → close → reopen retains markers without another edit.
- [x] Temporary Git test data cannot dirty the repository working tree.
- [x] Focused tests, coverage, build, typecheck, and quality gates pass.
- [x] Task record is marked complete, moved to `tasks/done/`, and indexed in `tasks/README.md` only
      when implementation and verification are complete.

## Completion verification

- `npx vitest run --config test/vitest.config.ts test/backend/editor-session.test.ts test/backend/git-diff.test.ts`
  — 19/19 passed.
- `node build.mjs` — passed.
- `npm run typecheck:vscode-e2e` — passed on the final spec.
- `env -u ELECTRON_RUN_AS_NODE DISPLAY=:0 npm --prefix test/vscode-e2e test -- diff-gutter.spec.ts`
  — final isolated run passed 1/1 on the first attempt. Earlier development runs exhausted their
  retry while exposing invalid temporary-workspace cleanup; the spec was corrected to use a fully
  temporary real multi-root workspace and the final run was pristine.
- Targeted coverage inspection showed the new `EditorSession.onReady` lines covered; `npm run
  test:coverage` passed 206 files / 2,940 tests.
- `npm run quality` — all stages passed (lint, knip, jscpd, dependency boundaries, root/webview
  audits, coverage, and the zero-coverage-module ratchet). The first sandboxed run reached every
  stage but npm audit could not resolve the registry; the network-enabled rerun passed with zero
  vulnerabilities.
- `git diff --check` — passed; post-e2e status contained no tracked fixture or temporary-workspace
  changes.
