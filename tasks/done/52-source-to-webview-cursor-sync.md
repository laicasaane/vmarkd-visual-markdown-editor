# Task 52 — Source → webview cursor sync (reveal in visual editor)

**Status:** done

## Problem

Cursor sync is currently one-directional. **webview → source** works (task 16:
"Edit in Text Editor" / reveal-in-source — `get-cursor-offset` → `selectionForLine`
→ `editor.revealRange`, jumps the text editor to the caret's line). The **reverse is
missing**: when you open the visual editor while sitting on line N of the source
(via `Open with markdown editor` / `…to the side`, or switching back from the text
editor), the webview always opens scrolled to the top instead of revealing the block
that corresponds to line N.

Mirrors the existing "reveal in source" so the round-trip is symmetric — a real UX
win for anyone bouncing between source and visual.

## Approach

Reuse the existing mapping machinery in `media-src/src/source-map.ts` (it already
maps a webview block ↔ a source offset via the sample-text + `indexOf` trick;
`lineAndTextForOffset`, `activeModeElement`, `getTableSourceOffset`). Build the
inverse: **source line → block element → scrollIntoView (+ optional caret)**.

Host (`src/extension.ts`):
- When opening the editor from a source position, capture the originating line.
  Candidates: the active text editor's `selection.active.line` for this document
  (`vscode.window.activeTextEditor`), or a line passed by the open command
  (`openEditor` / `openInSplit`).
- Include it in the init payload, e.g. `revealLine?: number` (only when known;
  omit → current top-open behaviour, no regression).

Webview (`media-src/src/main.ts` + `source-map.ts`):
- In `after()` (once Vditor has built + content is set), if `msg.revealLine` is
  given: walk the top-level blocks of `activeModeElement(vditor)`, compute each
  block's source line range (same per-block offset calc used by the diff/cursor
  mapping), find the block whose range covers `revealLine`, and
  `block.scrollIntoView({ block: 'start' })`. Optionally place the caret at the
  block start so typing continues there.
- Pure core (line → block index) extracted next to the existing helpers so it's
  unit-testable without the DOM; the DOM wrapper (scroll) covered by e2e.

## Edge cases / notes

- `revealLine` out of range or unmapped → no-op (stay at top).
- Run AFTER the instant-paint overlay swap so we scroll the live editor, not the
  (about-to-be-removed) overlay.
- Modes: works for `ir` / `wysiwyg`; `sv` (split) already shows source, lower
  priority.
- Don't fight the user: only reveal on open/switch, not on every focus.

## Scope extension (2026-07-03) — open-at-line transport (absorbs task 214)

The task-192 gap audit widened this from "reveal on open" to the general **open-at-line**
journey (task 190 J32: global-search result → editor at that line — daily/med, currently the
line is silently dropped; the host→webview protocol has only `scroll-to-heading`,
`protocol.ts:101`).

- [x] **Probe first:** does VS Code hand a CustomTextEditor ANY selection on
      `vscode.open`-with-selection / a search-result click (resolve gets no range — check
      pending-selection on visible editors / adjacent APIs)? 10-line experiment; its outcome
      decides how much of the journey is reachable and gets pinned in a test either way.
- [x] Protocol: a LIVE `reveal-line {line, lineText}` host→webview message (not just the init-payload
      `revealLine`) so search-result opens onto an already-open editor also land; webview
      side is the same line→block mapping + scroll + heading-flash + caret-at-block-start.
- [x] VS Code drops the selection entirely: the existing `vmde.openEditor` command is the fallback;
      it captures the active source selection before `openWith` and avoids a duplicate command.

## Verification

Unit: `source-map.ts` inverse (line → block index) for headings/paragraphs/tables + reveal
edge cases (line inside a fence/diagram/front-matter → owning block).
E2E: open with a `revealLine` and assert the matching block is scrolled into view; L3
real-VS-Code — post `reveal-line` mid-doc on an open editor → block in viewport + flash;
the probe's outcome pinned. `tsc` + `biome` + full vitest + Playwright e2e green.

## Completed (2026-08-31)

Source→visual reveal now uses one live host→webview transport for both new and existing panels. The
open commands capture `{line, lineText}` from the same-document active TextEditor before `openWith`
can discard it, focus/open the VMDE tab, then post `reveal-line` only after the newest matching panel
is registered and its ready/init handshake has completed. Transient duplicate/disposed panel entries
are excluded, the active-panel registry prefers the newest entry, and a new webview retries the
message through its pre-Lute startup window instead of dropping or throwing it.

The real probe established that direct `vscode.openWith(uri, 'vmde.editor', {selection})` does not
expose that selection to `resolveCustomTextEditor`; it remains pinned as a no-reveal path. The
fallback is the already-contributed `vmde.openEditor` command invoked from the source editor—no
second alias or `vmde.openAtLine` command was added. This works for a new panel and for returning to
an existing retained panel.

`util/source-map.ts` now owns a pure top-level Markdown line-range scanner covering front matter,
ATX/setext headings, soft paragraphs, blockquotes, nested lists, tables, fences/diagrams, indented
code, and thematic breaks. `{lineText}` resolves the nearest canonical `getValue()` line when Vditor
normalizes blank separators or table padding. `outline.ts` maps that block ordinal to live IR/WYSIWYG
DOM, exits section hoist only for a hidden target, scrolls and flashes it, and places the caret at its
first authored text through the shared caret bridge. Blank/out-of-range/unmapped lines remain no-ops.

### Verification

- TDD RED coverage first showed the inverse functions absent. The source-map unit matrix passes for
  all container/range cases, blank/out-of-range lines, and canonical line-text recovery; the focused
  host/router/source-map sets pass 171/171 before the final panel-readiness additions, with their
  subsequent focused sets also green.
- Final Chromium coverage passes 4/4 with `--retries=0`: the three existing exact cursor→source
  mappings plus source→fence scroll/flash/caret. The coverage bundle reports `outline.ts` at 93.04%
  lines and exercises the new source-map wrapper; pure scanner branches are covered by unit tests.
- After `node build.mjs`, the one-boot real-VS-Code spec passes 1/1 with `--retries=0` in 8.3s. It
  pins direct-open selection loss, live-reveals an existing panel, closes it, waits for tab-model
  removal, then reveals a different line in a new ready panel. The readiness ledger confirms the
  new-panel `reveal-line` activity completes without error.
- Build and all three type checks pass. Main.js measures 527.4 KB and is recorded as 527/529 KB;
  startup remains 275/275 eager modules.
- Aggregate quality passes brand checks, lint, jscpd, dependency-cruiser, all audits, 3,388/3,388
  unit coverage tests, and the 15-module ratchet. Its only failure is the unrelated pre-existing
  `knip` report for `yazl` in `test/backend/package-local-preview-core.test.ts`.

Retry history: focused real candidates exposed three distinct ordering facts—`openWith` drops the
selection, closed tabs/panels linger transiently in separate registries, and a newly registered
panel can receive messages before Lute exists. Each became an explicit probe, identity/readiness
gate, or bounded retry; the final candidate passed without Playwright retries. Per queue policy, no
FAST, full Chromium, or full real-VS-Code suite was run.
