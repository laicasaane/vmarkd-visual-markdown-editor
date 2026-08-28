# Task 273 — Rewrap paragraph/selection to column (sv hard-wrap)

**Status:** ✅ complete (2026-08-28) · **Impact:** 🟡 med (repo-doc authors; Rewrap class, ~862K installs) · **Origin:** task 192 §11

## Problem

Repo documentation is commonly kept hard-wrapped at 80/100 columns; Rewrap (stkb, 862K
installs — Alt+Q, markdown-aware) is the standard tool and cannot reach our webview. No
wrap command exists anywhere in the backlog.

## Scope

- [x] Command `vMarkd: Rewrap paragraph/selection` (Alt+Q via the webview key-capture
      pattern; palette + task-215 menu), primarily for **sv** mode: re-flow the caret's
      paragraph (or selection) to `vmarkd.editor.wrapColumn` (default 80; respect a ruler
      if we ever expose one).
- [x] Prefix-aware: list items (continuation indent), blockquotes/callouts (`> ` prefix),
      nested combinations; NEVER touches code fences, front matter, tables, math or
      diagram fences.
- [x] Semantics guards: with `reflowLineBreaks` semantics (task 83) hard breaks can be
      MEANINGFUL — rewrap only merges soft line breaks; two-space hard breaks and
      backslash breaks are preserved as boundaries. Interplay with minimal-diff writeback
      (61): the rewrapped block is one contiguous diff.
- [x] ir/wysiwyg: lower value (rendered view doesn't show source wrapping) — offer the
      command but operate on the underlying block source.

## Out of scope

- Auto-wrap-while-typing, whole-doc reformat v1 (add a `Rewrap document` variant only
  after the paragraph version proves the guards), comment-aware code wrapping.

## Verification

L1 (the bulk): wrap engine units — prefixes, nested lists, hard-break preservation,
unicode width, idempotence (rewrap twice == once). L2: sv command → source rewrapped,
right pane semantically unchanged, caret kept, one undo. L3: one chord leg (Alt+Q under
real key capture).

## Completed (2026-08-28)

- Added one pure `rewrapMarkdownRange` engine with word-boundary wrapping, Unicode display width,
  caret-offset mapping, idempotence, list/quote/callout prefixes and continuation indentation,
  explicit hard-break boundaries, and fail-closed block classification.
- Added resource-scoped `vmarkd.editor.wrapColumn` (default `80`), the discoverable
  `vmarkd.rewrap` command, Alt+Q host and capture-phase routing, and a native webview context-menu
  contribution.
- Added one mode-aware transaction for SV, IR, and WYSIWYG. It maps DOM selections through the
  active Lute serializer, snapshots undo before and after the formatting transaction, restores the
  logical source caret and scroll, invalidates incremental serialization, and schedules one host
  sync. The existing minimal-diff writeback keeps the host edit contiguous to the changed block.
- Added unit, manifest/config/command, real-Vditor Chromium, and real-VS-Code coverage. The focused
  real-VS-Code spec drives Alt+Q, host writeback, source caret, scroll, and one-step undo in all
  three modes.

### Verification

- Focused Vitest/config/command/router: 118 tests pass.
- Focused pure formatter coverage: 96.78% line coverage in the full coverage report; focused
  Chromium coverage reports `rewrap-command.ts` at 81.97% line coverage.
- `xvfb-run -a npm --prefix media-src run test:e2e:coverage -- rewrap.spec.ts`: 4/4 pass.
- `env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- rewrap.spec.ts`:
  1/1 pass in 11.9 seconds on the final post-refactor run, no retry.
- `node build.mjs`: pass. `npm run check:bundle-size`: pass at 474 KB / 480 KB. `npm run
  check:startup-cost`: pass at 270 / 270 eager modules.
- `npm run typecheck`, `npm run typecheck:strict`, and `npm run typecheck:vscode-e2e`: pass.
- `npm run quality`: pass outside the network-restricted sandbox: lint, knip, jscpd,
  dependency-cruiser, root/webview audits (0 vulnerabilities), 2,975 unit coverage tests, and the
  zero-coverage-module ratchet.

Retry accounting: the first Chromium attempt could not launch inside the managed sandbox; the
first escalated invocation bypassed the repository Playwright config and therefore had no base URL.
The corrected repository command passed. The first real-VS-Code spec version failed its internal
SV canonical-newline assertion on the initial run and automatic retry; the host document bytes were
already correct. The assertion was corrected to compare each mode against its pre-command canonical
value, and the final post-refactor run passed cleanly. No product assertion required a passing retry.
