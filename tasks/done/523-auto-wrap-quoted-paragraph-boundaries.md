# 523 — Auto-wrap preserves quoted paragraph boundaries

**Status:** done

## Problem

Auto-wrap treats a marker-only blockquote line (`>`) as prose because its raw source text is not
empty. With a collapsed caret in a later quoted paragraph, the formatter scans across those quoted
blank lines and merges every adjacent quoted paragraph into one logical unit.

## Required behavior

- A blockquote line whose content is blank after removing its quote prefix is a paragraph boundary.
- Auto-wrap reformats only the quoted paragraph containing the collapsed caret.
- Earlier and later quoted paragraphs, quote separator lines, Markdown bytes, caret mapping, and the
  existing list/callout/hard-break behavior remain unchanged.
- Verify the reported multi-paragraph quote in the pure formatter and through focused browser and
  real-VS-Code auto-wrap tests.

## Implementation

- [x] Add a RED `rewrapMarkdownRange` regression using the reported quote block and a collapsed
  caret on its final line.
- [x] Classify marker-only quote lines as logical blanks while preserving their source bytes.
- [x] Add focused Chromium and real-VS-Code regression coverage for auto-wrap.

## Verification

- [x] Focused formatter unit test passes after a confirmed RED result.
- [x] Focused formatter coverage exercises the changed branch.
- [x] Focused Chromium auto-wrap spec passes.
- [x] Build, then focused real-VS-Code auto-wrap spec passes without retries.
- [x] Typecheck, lint, diff checks, and the aggregate quality gate pass.
- [x] `LOCAL_AGENT_TASK.md` remains unchanged, untracked, and absent from the commit.

## Completed (2026-08-29)

`rewrapMarkdownRange` now recognizes raw blank lines and marker-only blockquote lines as the same
logical paragraph boundary. The predicate is deliberately quote-specific: callout markers and empty
list items retain their existing classification. Collapsed-caret scans stop on both sides of a `>`
separator, so only the edited quote paragraph is formatted; the exact reported source plus a trailing
quoted paragraph protect the upward and downward boundaries.

The Chromium and real-VS-Code auto-wrap paths exercise a column-60 version of the report. Vditor's
rendered-mode serializer emits a valid lazy continuation for the newly wrapped line, while every
pre-existing quoted paragraph and marker-only separator remains unchanged. The real-VS-Code case
continues through host sync, save, and reopen.

### Verification

- TDD RED: focused formatter run failed 1/17 with all quote separators removed and the four
  paragraphs merged; GREEN and exact-final focused coverage pass 17/17, with 93.18% line coverage
  for `rewrap-markdown.ts` and no changed line uncovered.
- Exact-final Chromium: `auto-wrap.spec.ts` passes 4/4 (IR, WYSIWYG, SV, and the quote regression).
- `node build.mjs`; all three typechecks; bundle 502/504 KB; startup 275/275 modules; lint; and
  `git diff --check` pass.
- Exact-final real VS Code: `auto-wrap.spec.ts --retries=0` passes 1/1 in 30.7 seconds, including all
  three modes and the quote regression's host sync/save/reopen path.
- Exact-final `npm run quality` passes brand identifiers, lint, knip, jscpd, dependency-cruiser,
  audits, 3,140 unit/coverage tests, and the 15-module coverage ratchet.
- Independent review found no critical or important issue. Its one minor harness-default issue was
  fixed, and its trailing-boundary coverage recommendation was added.

Retry history: the first sandboxed Chromium start could not bind its local port (`EPERM`) and passed
outside the sandbox. During test development, Chromium exposed terminal-newline and lazy-blockquote
canonicalization in the fixture; real VS Code repeated only the terminal-newline expectation on its
configured retry. Those expectations were corrected, and the final Chromium and no-retry real-VS-Code
runs passed. Early quality runs exposed formatting, sandboxed audit/spawn, and suppression-attachment
issues; the exact-final aggregate command passed outside the sandbox.
