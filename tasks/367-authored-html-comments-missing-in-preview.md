# 367 — authored HTML comments do not reach the full Preview pane

**Status: 🔍 OPEN — measured, not fixed. Pre-existing (NOT introduced by 365/366).**

## Finding

`all-renderers.md` carries three authored comments, the first of which states the intent outright:

```html
<!-- This comment should be visible as muted text in IR, WYSIWYG, and Preview. -->
```

In the full Preview pane none of them is present — not as a `.vmarkd-comment` element, not as a DOM
`Comment` node, not even as text: the string does not appear anywhere in
`preview.previewElement.innerHTML`. Lute appears to drop them from the preview render, so
`revealPreviewComments` has nothing to act on.

## How it was found

Task 366's native-parity probe. Before the graphviz fix the pane held **8** `.vmarkd-comment`
elements — every one of them a comment graphviz had carried through from the DOT source into its own
SVG, none of them authored. That is what surfaced this: once the diagram-internal ones were correctly
skipped, the count went to 0, not to 3.

Measured identical before the fix, so this is a pre-existing gap, not a regression from it.

## Where to look

- `media-src/src/html-comment.ts` — `revealPreviewComments` handles Comment nodes,
  `applyCommentPreviews` handles the `[data-type="html-block"]` wrapper (the IR/WYSIWYG shape). The
  full Preview pane matches neither, because the content never arrives.
- So the question is upstream of this module: what Lute emits for an HTML comment in the preview
  render path, and whether a Vditor option suppresses it.

## Pinned

`test/vscode-e2e/mode-switch-render-reuse.spec.ts` asserts `authoredKnownGap: false` — deliberately
pinning the CURRENT (wrong) behaviour so this stays visible and so a fix flips a test rather than
passing unnoticed. Flip it to `true` when fixing.
