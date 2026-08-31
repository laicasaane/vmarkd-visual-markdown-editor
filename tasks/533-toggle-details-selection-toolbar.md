# Task 533 — Toggle `<details>` around selected blocks from the toolbar

**Status:** planned · **Impact:** 🟡 med-high · **Origin:** Project Owner request (2026-08-31) ·
**Depends on:** task 257

## Problem

Task 257 makes an existing raw `<details>/<summary>` region functional while editing and adds the
generic `;;details` snippet, but neither path gives the pinned toolbar a reversible block action.
Authors who already selected the content they want to collapse must still insert or remove three
structural HTML lines by hand and preserve the blank-line boundaries that keep the body parsed as
Markdown.

Add one source-preserving toolbar toggle: wrap the selected Markdown blocks in a canonical
`<details>` region on the first activation, then remove that exact immediate wrapper on the next.
The action must derive its state from the current Markdown. It must not infer removal from a broader
ancestor, an adjacent region, injected editing chrome, or remembered UI state.

## Dependency and ownership

- Implement after task 257. Reuse/export task 257's details open/summary/close pairing and source
  classification; do not add a second regex-only parser that can disagree with the editing
  decorator.
- Task 257 continues to own editable collapsible chrome, source-on-focus behavior, native Preview
  parity, and the `;;details` skeleton. This task owns only the pinned-toolbar selection transform.
- Follow task 527's one-source-derived action, mode-adapter, transaction, focus, accessibility, and
  overflow patterns without coupling details to the callout syntax registry.

## Product contract

| Current selection state | Toolbar state | Activation |
|---|---|---|
| One or more safely resolved Markdown blocks | Enabled, not active | Wrap the exact block range |
| Exact body of an immediate, well-formed `<details>` region | Enabled and active | Remove only that wrapper |
| Empty/collapsed, disjoint, structurally ambiguous, or unsafe selection | Disabled | No edit and no undo entry |
| Preview or read-only editor | Disabled | No edit |

The button is a direct one-click toggle. Wrapping inserts the approved default summary text and does
not open a panel:

```html
<details>
<summary>Details</summary>

[selected Markdown]
</details>
```

## Selection contract

- A non-empty selection resolves to the smallest contiguous range of complete top-level Markdown
  blocks it touches. Selecting part of a paragraph therefore targets that paragraph; selecting
  across several blocks targets the complete contiguous block range.
- Preserve the logical selected body across wrap and unwrap so a second activation reverses the
  first without requiring the author to reselect the tags.
- Supported bodies include ordinary prose, headings, lists, blockquotes, tables, thematic breaks,
  and fenced code/diagram blocks when their complete source ranges are available. The wrapper must
  not reserialize or normalize those bodies.
- Disable rather than guess when the selection is collapsed, disjoint, crosses an unresolved editor
  boundary, addresses only part of a structural block such as a table cell or fenced block, or
  includes only one side of an existing raw-HTML wrapper.
- Multiple independent selections are out of scope. One activation produces at most one wrapper and
  one model transaction.

## Wrap semantics

- Insert a plain closed `<details>` opening tag, `<summary>Details</summary>`, the minimum blank-line
  separators required for Markdown parsing inside the HTML container, and `</details>`.
- Preserve every byte of the selected body, including inline syntax, indentation, internal blank
  lines, list looseness and ordinals, fence delimiters/languages, and nested Markdown. Use the local
  document line-ending convention for newly inserted wrapper lines; do not normalize unrelated
  source.
- Do not use the rendered IR/WYSIWYG DOM as the transform authority. Resolve the selected source
  range and apply one exact Markdown edit through the shared action pipeline so full
  `getValue()`, incremental serialization, host sync, and saved source agree.
- A non-immediate ancestor `<details>` does not count as the selected range's wrapper. A safe range
  inside a broader details body may be wrapped as a nested details region; the outer wrapper must
  remain untouched.

## Unwrap semantics: immediate presence only

Removal is available only when the normalized selected block range is the complete body of its
nearest immediate details region:

1. A well-formed opening `<details ...>` directly owns one `<summary ...>...</summary>` as its
   summary child.
2. The selected range begins after that summary and ends before the paired `</details>`.
3. No unselected Markdown body block exists between the summary/close pair and the selection.

When all three conditions hold, remove the opening tag, the complete summary element (including
custom text/attributes), the paired closing tag, and only the boundary blank lines belonging to the
wrapper. Preserve the selected body bytes and its logical selection.

Do **not** interpret a broader ancestor, strict body subset/superset, sibling/adjacent details region,
tag-like text inside a fence, malformed/unclosed pair, or ambiguous pair as authorization to remove
or repair a wrapper. Such a selection may still be wrapped when its own source range is safe and it
does not cross an incomplete raw-HTML boundary; any enclosing or adjacent markup remains untouched.

## Toolbar behavior

- Add one VMDE-owned `details` item to the pinned toolbar in IR, WYSIWYG, and SV, grouped beside the
  structural Quote/Callout controls and included in the authored-item completeness and responsive
  overflow contracts.
- Use a localized accessible name such as **Toggle details around selected blocks**. The item must
  participate in the toolbar's roving-tabindex behavior and expose its active/pressed state only for
  the exact immediate-wrapper case.
- Refresh enabled/active state from Markdown selection context after selection changes, direct
  source edits, undo/redo, and mode switches. Do not retain a parallel boolean toggle state.
- Toolbar activation is one edit and one undo step. Preserve editor focus, logical selection, caret
  direction where representable, and scroll position. A no-op must not post an edit, dirty the
  document, or create an undo checkpoint.
- No keyboard shortcut or command-palette contribution is required. Keyboard users can reach and
  activate the semantic toolbar button through the existing toolbar navigation contract.

## Implementation shape

- A pure source classifier/transform accepts the current Markdown plus a resolved contiguous block
  range and returns `wrap`, `unwrap`, or a disabled/no-op reason with the exact replacement range and
  Markdown.
- Thin IR, WYSIWYG, and SV adapters resolve the logical block selection through their existing mode
  seams, call the same pure transform, apply it through the normal model pipeline, and restore the
  returned logical selection.
- The toolbar item renders only the source-derived context and dispatches the shared action. Do not
  implement separate DOM-rewrite variants per mode, mutate task 257's injected chrome, or scan and
  serialize the whole document merely to decide the button state on ordinary selection changes.

## Verification

### L1 — pure transform and classification

- Table-driven wrap/unwrap cases for one paragraph and mixed multi-block ranges, including headings,
  lists (tight/loose and ordered starts), quotes, tables, thematic breaks, and fenced code/diagrams.
- Exact output for LF and CRLF, boundary blank-line variants, body without a final newline, internal
  blank lines, indentation, inline HTML, and byte-sensitive Markdown.
- Immediate-wrapper matrix: canonical wrapper, `<details open>`, attributed opening/summary tags,
  edited summary text, nested details, broader ancestors, adjacent siblings, subset/superset ranges,
  malformed/unclosed pairs, and tag-like text inside fences.
- Disabled/no-op results for collapsed, disjoint, partial structural, unresolved, and ambiguous
  selections. Reapplying a no-op must not produce a replacement.

### L2 — Chromium with real Vditor

- In IR, WYSIWYG, and SV: select blocks, activate the real toolbar item, assert exact `getValue()`,
  unchanged body bytes, retained selection/focus/scroll, and one-step undo/redo; activate again and
  assert exact restoration.
- Assert enabled/disabled and active state across selection changes, direct source edits, undo/redo,
  mode switches, Preview/read-only state, nested/non-immediate wrappers, and toolbar overflow.
- With task 257's editing chrome present, prove full `getValue()` and the host/incremental
  serialization path stay byte-identical and no injected DOM leaks into Markdown.
- Run Chromium coverage and confirm the new classifier, transform, adapters, and toolbar branches
  are exercised.

### L3 — focused real VS Code (mandatory)

After `node build.mjs`, add and run one focused, single-boot, `workers: 1`, no-retry spec under
`xvfb-run`. In one fixture journey:

1. select a mixed multi-block range in IR and wrap it from the pinned toolbar;
2. verify the details region works with task 257's editing chrome and native Preview toggle;
3. switch through WYSIWYG and SV, confirming exact source and active-state parity;
4. undo/redo once, then unwrap the still-selected immediate body;
5. prove a selection inside a broader ancestor does not remove that ancestor;
6. save, close, and reopen, then assert exact disk bytes, focus/selection behavior where observable,
   and no wrapper/injected-DOM leakage.

Run the applicable focused unit and Chromium specs, changed-line coverage, type checks, bundle and
startup budgets, and one final `npm run quality` candidate per `DEVELOPMENT.md`. Do not use the full
real-VS-Code suite as the iterative loop; record any omitted broad gates or retries honestly.

## Out of scope

- Editing or prompting for summary text from this button; use the default `Details`, edit source, or
  use task 257/task 221's `;;details` authoring path.
- A collapsed-caret insertion command, inline-only text wrapping, multiple/disjoint wrappers, or
  automatically expanding a selection to an entire existing details ancestor.
- Repairing malformed raw HTML, bulk unwrapping nested ancestors, converting details to callouts, or
  changing task 298's broader block-type transform matrix.
- New details themes, alternate default-open behavior, keyboard shortcuts, or a second details
  parser/action implementation.

## Completion checklist

- [ ] One pinned toolbar button wraps a safe selected block range with
      `<summary>Details</summary>` in IR, WYSIWYG, and SV.
- [ ] Re-activation removes only an exact immediate details/summary wrapper and preserves the body
      byte-for-byte.
- [ ] Broader ancestors, partial bodies, adjacent/nested ambiguity, malformed tags, and unsafe
      selections never trigger removal or partial edits.
- [ ] Enabled/active/disabled state is source-derived and stays correct through edit, undo/redo, and
      mode changes.
- [ ] Each successful action is one undo step; selection, focus, scroll, host synchronization, and
      save/reopen fidelity pass.
- [ ] Unit, Chromium, coverage, and focused real-VS-Code acceptance are written and run; applicable
      final gates and any residuals are recorded honestly.
