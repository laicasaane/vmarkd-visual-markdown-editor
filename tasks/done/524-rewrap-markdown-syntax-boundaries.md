# 524 — Rewrap respects every supported Markdown syntax boundary

**Status:** done

## Goal

Extend Task 523's paragraph-boundary protection across every Markdown syntax the shared formatter
supports, and make live rendering honor those source semantics. Manual paragraph rewrap,
whole-document rewrap, auto-wrap, and IR/WYSIWYG presentation must share the result.

## Contract

- Rewrap prose inside ordinary paragraphs, unordered/ordered/task lists, nested and mixed lists,
  blockquotes, nested blockquotes, and callouts.
- Preserve sibling container items and structural marker lines byte-for-byte; only the logical unit
  containing the caret or explicit selection may change.
- Treat marker-only callout headers as structural boundaries while retaining existing single-line
  callout prose wrapping.
- Protect ATX and Setext headings, thematic breaks, fenced/indented code, math, front matter,
  tables, raw HTML, and link-reference definitions, including supported blockquote nesting.
- Prefer a safe no-op for ambiguous Markdown; do not add a Markdown parser dependency or change
  settings, transactions, undo, caret, scroll, or Lute integration.
- Always render ordinary Markdown soft breaks as spaces in IR and WYSIWYG across paragraphs, inline
  formatting/links, tight lists, blockquotes, and callouts. Auto Wrap controls only the delayed
  source rewrite at `wrapColumn`; it does not control visual reflow. Preserve exact source bytes,
  explicit hard breaks, inline-code semantics, and verbatim block rendering.

## Implementation

- [x] Add table-driven syntax characterization plus RED callout, Setext, and nested protected-block
  cases to `rewrap-markdown.test.ts`.
- [x] Replace the quote-only blank predicate with a shared, source-preserving line-role classifier.
- [x] Remove the Auto-Wrap gate from live soft-break rendering and cover every prose container.
- [x] Add one composite syntax fixture to focused Chromium and real-VS-Code auto-wrap acceptance.

## Verification

- [x] Record RED and GREEN focused formatter outcomes and changed-line coverage.
- [x] Run focused Chromium and no-retry real-VS-Code syntax acceptance after one build.
- [x] Run typechecks, budgets, exact-final quality, review, and diff checks.
- [x] Close this task, update `tasks/README.md`, and create one focused local commit without pushing.
- [x] Keep `LOCAL_AGENT_TASK.md` unchanged, untracked, and absent from the commit.

## Completed (2026-08-29)

The shared formatter now performs a conservative container-aware source classification before it
rewraps prose. Quote depth, list ownership and lazy continuations remain distinct logical units;
fences, math, type-1 HTML, indented code, headings, thematic breaks, tables, and multiline reference
definitions are protected. The reference scanner also honors escaped label and title delimiters.
The same classification is used by collapsed, selected, document, and delayed Auto-Wrap paths.

IR and WYSIWYG now separate presentation from source formatting. Ordinary soft newlines remain exact
Markdown bytes but flow visually as spaces through paragraphs, links, inline formatting, lists,
quotes, and callouts. Explicit hard breaks retain their identity, verbatim blocks keep their own
whitespace rules, Auto Wrap only schedules source rewrites, and Preview remains controlled solely by
its independent reflow setting.

### Verification

- TDD reproduced the original quote merge plus review-discovered nested-container, protected-block,
  Setext, thematic-break, list-code, fence-closer, multiline-reference, tab-indentation, and escaped-
  delimiter failures before their fixes. The final focused set passes 164/164.
- Focused changed-helper coverage passes 73/73: 97.63% lines and 100% functions across
  `rewrap-markdown.ts` and `live-line-breaks.ts`.
- Exact-final Chromium passes 15/15 across delayed Auto Wrap, manual/document rewrap, all three
  editor modes, visual soft-break flow, hard-break identity, and the composite syntax matrix.
- After `node build.mjs`, exact-final real VS Code passes 3/3 without retries in 54.5 seconds:
  Auto Wrap 29.6s, rewrap 16.1s, and soft-break/Preview independence 6.4s.
- All typechecks pass. Bundle size passes at 506/508 KB after a measured 505.7 KB build; startup
  remains 275/275 modules. Metadata attributes the deliberate growth to the 10.9 KB formatter
  classifier, with no renderer or engine leak and all lazy-engine ceilings unchanged.
- Exact-final `npm run quality` passes brand checks, lint, knip, jscpd, dependency-cruiser, audits,
  3,190 unit/coverage tests, and the 15-module coverage ratchet. `git diff --check` passes.
- Three independent review rounds found and drove the boundary regressions above. Final re-review
  reports no critical, important, or residual escaped-reference blocker.

Retry history: the first focused Chromium command ran from the repository root and mixed the two
Playwright installations; the corrected `media-src` invocation then hit the sandbox's local-port
restriction and passed outside the sandbox. The first aggregate quality run exposed one obsolete
export after the live-rerender path was removed; removing that export made both subsequent exact
quality runs pass. The exact-final Chromium and real-VS-Code runs passed without test retries.
