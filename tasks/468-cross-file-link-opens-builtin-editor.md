# Task 468 — A cross-file markdown link may open the target in VS Code's BUILT-IN editor, not vMarkd

**Status:** 🟢 **DONE.** Reproduced end-to-end, fixed, and verified in real VS Code (see
"What shipped" below). · **Impact was:** 🟠 high — silent, no error, affected every cross-file link
for any user who never explicitly chose vMarkd. · **Origin:** surfaced 2026-07-31 while building
task 243's cross-document e2e — the first test in this repo's history to exercise the path.

## Problem

`package.json` registers the custom editor with **`"priority": "option"`**, not `"default"`.

`src/asset-link-actions.ts`'s `onOpenLink` opens a cross-file target with plain

```ts
vscode.commands.executeCommand('vscode.open', targetUri)
```

(pre-existing, task 359 — not introduced by 243). With `priority: "option"` and no
`workbench.editorAssociations` entry, VS Code resolves the file to its **built-in text editor**.

For most existing users this is invisible: once someone has picked vMarkd for a `.md` file and kept
it, VS Code writes an `editorAssociations` entry and every later open — link clicks included —
resolves to vMarkd. The gap only shows on a profile that has never made that choice: a new install,
a new machine, a fresh profile, or a colleague opening the repo for the first time. They click a
`[link](other.md)` inside vMarkd and land in plain text, with no error and no hint why.

## How it was found, and why no test caught it

Task 243's e2e opens a sibling document by clicking `sibling.md#fragment` and then waits for that
tab's webview. It timed out. The webview never existed, because the tab was a text editor.

`test/vscode-e2e/local-link-open.spec.ts` — the closest existing coverage — asserts only that a tab
with the right `fsPath` exists. It never checks `viewType`. So it has been green for its entire life
regardless of which editor actually opened, and would stay green if this bug got worse.

## Scope

- [x] **Reproduce first.** A throwaway probe (real workspace, no `editorAssociations`) confirmed it:
      clicking `sibling.md` from inside a vMarkd webview produced tabs
      `[{fsPath: main.md, viewType: 'vmarkd.editor'}, {fsPath: sibling.md, viewType: undefined}]` —
      `sibling.md` opened as the built-in text editor, exactly as diagnosed from source. Probe
      deleted after use (throwaway, per house convention).
- [x] Decided: **(b) "follow the source"** — a cross-file link opens the target with vMarkd only
      when the SOURCE document is itself open in a vMarkd webview. Not (a) (overrides users who
      deliberately prefer the text editor), not (c) (too blunt — affects every `.md` open, not just
      link-following), not (d) (the silent failure this task exists to fix).
- [x] **Fixed `local-link-open.spec.ts` to assert `viewType`**, not just `fsPath` — reused task
      243's `expectTabOpenedAsVmarkd`/`openTabInfo` pattern (`viewType: 'vmarkd.editor'` now
      asserted on every "opens as vmarkd" case).

## What shipped

- **`src/asset-link-actions.ts`** — `onOpenLink`'s local-target branch now gates on a new,
  independently unit-tested predicate:
  ```ts
  export function shouldOpenTargetWithVmarkd(
    targetPath: string,
    sourceViewType: string,
  ): boolean {
    return /\.(md|markdown)$/i.test(targetPath) && sourceViewType === MarkdownEditorViewType
  }
  ```
  True → `vscode.commands.executeCommand('vscode.openWith', targetUri, MarkdownEditorViewType)`;
  false → the original `vscode.commands.executeCommand('vscode.open', targetUri)`, unchanged.
  (Extracted as a standalone function, not inlined, because task 469's `noExcessiveCognitiveComplexity`
  gate flagged the inlined version at 16/max 15 — extracting a named predicate was the fix, not a
  suppression.)
- **No new plumbing needed**, as hoped: `AssetLinkDeps.getSourceViewType` is wired in
  `src/editor-session.ts` as `() => this.webviewPanel.viewType` — the SAME panel every other dep
  there already closes over.
- **Two VS Code behaviour surprises found and fixed along the way, both real bugs independent of
  the core decision:**
  1. `vscode.open` on an already-open custom-editor document creates a **duplicate tab** whose
     iframe never becomes visible, rather than reactivating the existing one — `vscode.openWith`
     does not have this problem. (Hit this in the test harness itself, switching back to the main
     doc; fixed by using `vscode.openWith` there too.)
  2. **A real, but different, root cause than first suspected for the still-failing cross-doc
     scroll.** `scrollToFragmentAfterOpen`'s existing "genuine fallback" design (from task 243)
     gates a `ready`-triggered repost on `webview.postMessage()`'s resolved `Thenable<boolean>`
     ("delivered") — skip the repost if the immediate send already reported success. A real-VS-Code
     run logged the immediate post resolving `ok: true` while the target's heading never actually
     scrolled into view, which initially (wrongly) looked like proof the boolean was lying about
     delivery. It wasn't: the actual cause is that a freshly-opened panel's `scroll-to-heading`
     message CAN arrive and get genuinely delivered/handled **before Vditor has finished rendering
     the target document's headings into the DOM** — `window.vditor` is assigned synchronously in
     `vditor-init.ts`, but heading elements only exist once Vditor's own render has actually run
     (`after()` is the documented "fully mounted" signal) — so `scrollToHeadingIndex` legitimately
     (and silently) returns `false` even though the message really was delivered. `openWith`
     (this task's own change) registers the panel measurably earlier than the old `vscode.open`
     path did (`waitedMs: 0` in a fresh diagnostic), which is what let this race surface at all —
     see task 243's own investigation notes for the fuller before/after. Once the webview side
     retries across that window (below), the `delivered` gate's original premise held up with no
     surviving counter-evidence, so it stays as task 243 originally shipped it, unchanged.
  3. **The actual fix**: `media-src/src/message-router.ts`'s `handleScrollToHeading` now calls a
     new `scrollToHeadingWithRetry`, which polls (50ms interval, 2s budget — the same budget the
     host side already uses for the analogous `findPanelForUri` race) until `window.vditor` exists
     and the target heading is actually in the DOM, instead of a single synchronous attempt. This
     is what took the cross-doc leg from consistently-red (3/3, same failure every run — not
     intermittent) to consistently-green (3/3, then 5/5, then a final 3/3 after the gate was
     restored). `scrollToHeadingIndex` gained a `quiet` param so the retry loop doesn't spam the
     Output channel with ~40 near-identical trace lines on a worst-case give-up; it logs its own
     one-line summary (success-after-Nms / gave-up) instead.

## Verification

- Unit: `test/backend/asset-link-actions.test.ts` (`shouldOpenTargetWithVmarkd` direct cases,
  updated `openWith`/`open` integration tests, and the `delivered`-gate double-fire tests — kept
  as task 243 originally shipped them, see item 2 above) and `media-src/src/message-router.test.ts`
  (new `handleScrollToHeading — retry for a freshly-opened panel` describe block, 3 tests: retries
  and succeeds once the panel catches up, gives up after budget with no crash/runaway timer,
  doesn't retry at all in the already-rendered case). Red-then-green done on the core predicate,
  the retry loop, AND the `delivered` gate itself (reverting it independently confirmed a test
  fails, restoring it passes — the gate's own coverage, not just the retry's).
- Real VS Code: `anchor-links.spec.ts` (task 243's cross-doc leg) — `--repeat-each=3` (3/3) then
  `--repeat-each=5` (5/5) with the retry fix alone, then a final `--repeat-each=3` (3/3) after the
  `delivered` gate was restored and the `quiet`-logging change landed — **11/11 green total**
  across the round, with the `workbench.editorAssociations` test workaround fully removed (see
  task 243). `local-link-open.spec.ts` — **6/6 green**, now asserting `viewType` on every case.
- Full gates: `node build.mjs`, host `tsc --noEmit`, webview `npm run typecheck` (both 0 errors —
  a transient error in another agent's in-flight `code-ref-decorate.ts` was gone by the time of
  the final check, not something this task fixed), `npm run lint:ci` (0 findings in any file this
  task touched — the only findings at any point were in other agents' uncommitted, in-flight
  files, confirmed via `git status`/`git diff`, never touched here), full unit suite (2482/2482).

## Out of scope

- Task 243's own fragment-scrolling behaviour beyond the panel-render race above. 243 used to work
  around this task's bug in its spec by setting `workbench.editorAssociations` at test start — that
  workaround is now gone (see task 243's own file for why).
