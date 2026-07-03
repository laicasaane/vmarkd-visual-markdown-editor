# Task 52 — Source → webview cursor sync (reveal in visual editor)

**Status:** planned

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

- [ ] **Probe first:** does VS Code hand a CustomTextEditor ANY selection on
      `vscode.open`-with-selection / a search-result click (resolve gets no range — check
      pending-selection on visible editors / adjacent APIs)? 10-line experiment; its outcome
      decides how much of the journey is reachable and gets pinned in a test either way.
- [ ] Protocol: a LIVE `reveal-line {line}` host→webview message (not just the init-payload
      `revealLine`) so search-result opens onto an already-open editor also land; webview
      side is the same line→block mapping + scroll + heading-flash + caret-at-block-start.
- [ ] If VS Code drops the selection entirely: fallback command `vmarkd.openAtLine` and
      document the limitation.

## Verification

Unit: `source-map.ts` inverse (line → block index) for headings/paragraphs/tables + reveal
edge cases (line inside a fence/diagram/front-matter → owning block).
E2E: open with a `revealLine` and assert the matching block is scrolled into view; L3
real-VS-Code — post `reveal-line` mid-doc on an open editor → block in viewport + flash;
the probe's outcome pinned. `tsc` + `biome` + full vitest + Playwright e2e green.
