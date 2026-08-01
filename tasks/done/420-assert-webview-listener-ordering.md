# Task 420 — No test asserts the webview listener-before-HTML ordering invariant

**Status:** ✅ DONE (2026-07-30) · **Impact:** 🟠 med-high (breaking it silently drops early host→webview messages; no gate would catch it) · **Origin:** integration pass, 2026-07-28

## Problem

`src/editor-session.ts` carries an ordering constraint documented in its own comments
(around `:382` and `:414-425`):

> `webview.html` is intentionally set LAST — only now that `onDidReceiveMessage` (above) is attached.

If the assignment order ever inverts, the webview begins loading (and can post its `ready`/early
messages) **before** the host has a listener attached. Those messages are dropped. The failure is
silent: no exception, no log — just an editor that opens and then behaves as though the host never
answered, in a way that would likely be intermittent and load-dependent.

**Nothing enforces it.** Verified during the 2026-07-28 integration pass: the invariant currently
HOLDS in the merged code (read directly, `installListeners()` runs before the `.html` assignment),
but no unit test and no e2e asserts it. It is protected only by two comments and whoever reads them.

This became materially more likely to break the same day: task 405 relocated ~900 lines out of
`extension.ts` into `editor-session.ts`. That move preserved the ordering — but a comment is a weak
guard for an invariant that survives only by luck of statement order during a large refactor, and
this file is now the natural home for future session-lifecycle work.

## Scope

- [x] Added a **unit** test (`test/backend/editor-session.test.ts`, "attaches the message listener
      BEFORE assigning webview.html…") built on the existing `makeSession()` helper — no new harness
      machinery. `test/backend/vscode-mock.ts`'s `createWebviewPanel()` did NOT record `html`
      assignment order before this task, so it was extended (not rewritten, per the file's own
      header instruction): `webview.html` is now an accessor (`Object.defineProperty` get/set,
      reads behave exactly like the old plain string field) and `onDidReceiveMessage` is wrapped to
      push onto a `panel._eventOrder: string[]` array — `'listener-attached'` /
      `'html-assigned'`, in fire order. The test asserts
      `eventOrder.indexOf('listener-attached') < eventOrder.indexOf('html-assigned')`.
- [x] The assertion message states the WHY directly: *"the message listener must attach before
      webview.html loads main.js — otherwise the early `ready` message races the listener and is
      dropped silently"* — plus separate messages on the two "never fired" guard assertions, so a
      future failure doesn't read as an arbitrary ordering rule.
- [x] Checked for a second webview-construction path: `grep -n "createWebviewPanel\|WebviewPanel"
      src/*.ts` — `vscode.window.createWebviewPanel` is never called in `src/`; the only panel comes
      from VS Code itself via the custom-editor API (`resolveCustomTextEditor` in
      `markdown-editor-provider.ts`), passed straight into `EditorSession`. `src/reveal-caret.ts:34`
      also calls `panel.webview.onDidReceiveMessage(...)`, but on the SAME already-constructed panel
      (registering an additional listener for the reveal-caret round-trip), not a second
      construction path — nothing else to cover.

## Out of scope

- Restructuring `editor-session.ts` to make the ordering structurally impossible (e.g. a builder that
  physically cannot assign HTML before wiring listeners). That is a legitimate stronger fix, but it
  is a design change; this task is about getting a **gate** in place cheaply first. Note it as a
  follow-up if the test turns out awkward to write.

## Verification

- [x] **Confirmed red-then-green.** Temporarily swapped the `installListeners(...)` /
      `webviewPanel.webview.html = ...` statements in `src/editor-session.ts:414-425`, re-ran
      `npx vitest run test/backend/editor-session.test.ts` → the new test failed with exactly the
      written message (`expected 1 to be less than 0`, i.e. html assigned at index 0, listener
      attached at index 1). Reverted immediately (`git diff src/editor-session.ts` is empty — no
      lasting change to that file, which is another agent's territory per the team-lead brief); the
      3 other `editor-session.test.ts` tests stayed green throughout, then the new test went green
      too on revert. This was a temporary, self-reverted edit purely to prove the test catches the
      break — not a scope change to `src/`.
- [x] `npm test` (`npx vitest run --config test/vitest.config.ts`) — **2066 passed, 0 failed**
      (whole unit suite, not just the touched files).
- [x] `./node_modules/.bin/biome check test/backend/vscode-mock.ts test/backend/editor-session.test.ts`
      — clean after `--write` auto-formatted the new code (two lines biome wanted joined/collapsed).
- [x] No e2e needed, per the task's own scope — host-side construction order, fully observable at
      the unit level against the mock.

## See also

- `src/editor-session.ts` (`installListeners`, the `.html` assignment, and the two comments that
  currently carry the invariant), `test/backend/vscode-mock.ts`.
- [Task 405](405-host-editorsession-decomposition.md) (the relocation that made this worth pinning).
- [Task 151](151-typed-failloud-boundary.md) — same family of concern: invariants held by
  declaration rather than by enforcement.
