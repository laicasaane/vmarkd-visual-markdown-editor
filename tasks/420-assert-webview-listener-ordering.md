# Task 420 — No test asserts the webview listener-before-HTML ordering invariant

**Status:** 📋 planned — test coverage of a load-bearing invariant · **Impact:** 🟠 med-high (breaking it silently drops early host→webview messages; no gate would catch it) · **Origin:** integration pass, 2026-07-28

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

- [ ] Add a **unit** test that fails if the order inverts. The likely shape: construct the session
      against the existing `vscode-mock` webview panel, record the sequence of
      (`onDidReceiveMessage` attached, `html` assigned) on the mock, and assert the listener came
      first. `test/backend/vscode-mock.ts` already models the panel, so this should not need new
      harness machinery — check whether the mock records `html` assignment order today and extend it
      minimally if not.
- [ ] Make the assertion message explain WHY it matters (early messages are dropped silently), so a
      future failure is actionable rather than looking like an arbitrary ordering rule.
- [ ] Check whether the same pattern exists for any other panel/webview construction path in the
      host (e.g. any second place that builds a webview) and cover it too if so.

## Out of scope

- Restructuring `editor-session.ts` to make the ordering structurally impossible (e.g. a builder that
  physically cannot assign HTML before wiring listeners). That is a legitimate stronger fix, but it
  is a design change; this task is about getting a **gate** in place cheaply first. Note it as a
  follow-up if the test turns out awkward to write.

## Verification

- [ ] The new test FAILS when the two statements are deliberately swapped (verify this by actually
      swapping them locally, confirming red, then reverting) — a test for an invariant that already
      holds proves nothing until you have seen it fail.
- [ ] `npm test` green; no e2e needed (this is host-side construction order, fully observable at the
      unit level against the existing mock).

## See also

- `src/editor-session.ts` (`installListeners`, the `.html` assignment, and the two comments that
  currently carry the invariant), `test/backend/vscode-mock.ts`.
- [Task 405](405-host-editorsession-decomposition.md) (the relocation that made this worth pinning).
- [Task 151](151-typed-failloud-boundary.md) — same family of concern: invariants held by
  declaration rather than by enforcement.
