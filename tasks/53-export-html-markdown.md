# Task 53 — Export HTML / Markdown

**Status:** planned

## Problem

Today the only "get the output out" feature is **Copy HTML** / **Copy Markdown**
(toolbar → `navigator.clipboard.writeText(vditor.getHTML()/getValue())`). There is
no way to open the rendered HTML as a document you can review/save. "Export HTML"
(open the rendered HTML as an untitled `.html` doc the user saves themselves) is a
concrete, commonly-wanted feature.

## Scope

### Primary — Export HTML (net-new)
- Toolbar item **Export HTML** (alongside Copy HTML) and/or a palette command
  `vmarkd.exportHtml`.
- Flow: webview posts `export-html` with `vditor.getHTML()` → host
  `workspace.openTextDocument({ content, language: 'html' })` +
  `window.showTextDocument(doc)`. Opens as an untitled HTML doc; user saves where
  they want. (No fs writes → no trust/virtual-workspace gate needed.)
- **Decide:** raw Vditor fragment vs a standalone wrap (`<!doctype html>` + the
  content-theme CSS so it renders the same standalone). Lean standalone — a bare
  fragment is less useful as an exported file. Reuse the content-theme CSS the
  overlay/live editor already link.

### Optional — Export Markdown
- Same mechanism with `vditor.getValue()` + `language: 'markdown'`. Lower value
  (the source file already *is* the markdown), so only if cheap — useful mainly to
  get the normalized/round-tripped markdown.

### Optional — action-button toast (#4 from the request)
- `showTextDocument` already opens the doc, so a "Open" toast is redundant for the
  untitled-doc path. The toast pattern (`showInformationMessage('Exported', 'Open',
  'Reveal')` → act on the choice) only earns its keep if we add a **save-to-file**
  variant (write `.html` next to the source, then offer "Open"/"Reveal in Explorer").
  Defer unless save-to-file is wanted. (Pattern already used: wiki "Create Page".)

### Restore the Copy senders — ⚠️ REGRESSION (2026-07-03, absorbs task 193)

The host-clipboard Copy shipped (section below) but the **webview senders were removed in
the toolbar cleanup commit `3101b74`**, leaving a receiver-without-sender: the host handlers
are alive and unit-tested (`extension.ts:1008-1009`, `onCopyToClipboard` at `:631`,
`protocol.ts:150-154`, `test/backend/extension.test.ts:161-179`) but no UI posts
`copy-html`/`copy-markdown` (grep in `media-src/src` → 0). Users cannot copy rendered HTML
out at all — also a parity regression vs upstream zaaack. (Found by the task-192 gap audit;
this resolves the 191 §5.6 resurrect-vs-delete decision: resurrect.)

- [ ] Re-add **Copy as HTML** / **Copy as Markdown** to the toolbar `…` panel
      (`media-src/src/toolbar.ts`), posting the payloads the host already handles; restore
      the `lang.ts` labels.
- [ ] Mirror both in the right-click menu once task 215 (`webview/context`) lands.
- [ ] Verification: L2 — toolbar click → one `copy-html` post with the rendered fragment;
      L3 real-VS-Code — menu click → `vscode.env.clipboard.readText()` holds HTML/markdown.
      (Backend half is already covered — don't duplicate.)

### Move Copy to host clipboard (#1 from the request) — ✅ done (then regressed, see above)
- `navigator.clipboard.writeText` in the webview was focus/permission-sensitive in
  the iframe (could silently no-op). Copy HTML / Copy Markdown now route through the
  host: the webview posts `copy-html`/`copy-markdown` with the content →
  `EditorSession.onCopyToClipboard` writes it via `vscode.env.clipboard.writeText`
  (rock-solid) and shows the success/failure toast host-side. One extra round-trip.
- Mock gained `env.clipboard.writeText` + `calls.clipboard`. Backend tests assert
  both copies hit the clipboard and report success; the e2e now asserts the toolbar
  posts the `copy-*` command with content (no longer writes `navigator.clipboard`).

### Optional — DOCX for stakeholders (added 2026-07-03, persona audit)

PMs hand documents to stakeholders in Word. Native DOCX generation is out of scope, but a
cheap path exists: **detect `pandoc` on PATH** → offer `Export DOCX…` that shells out
(`pandoc -f gfm -t docx`); hide the command when pandoc is absent. Decide with the primary
Export HTML work — if the shell-out feels off-brand, record the decision and drop it.

## Out of scope

- `window.withProgress` for export — HTML render is instant; not worth a progress
  bar (would only matter for a slow export path, which we don't have).
- PDF / other formats beyond the optional pandoc-DOCX note above — the print/CSS story is
  now **task 251** (page-breaks + `@media print` in the exported HTML, which makes
  browser-print-to-PDF viable); flattening `![[embeds]]` into one exported artifact is
  **task 252**.

## Approach notes

- New webview→host message(s) wired through the existing `messageHandlers` map in
  `resolveCustomTextEditor` (now `EditorSession`) — add `onExportHtml` etc.
- New toolbar items mirror `copy-html`/`copy-markdown` in `media-src/src/toolbar.ts`.
- Localize new labels in `media-src/src/lang.ts` (`exportHtml`, …).

## Verification

- e2e: clicking Export HTML posts `export-html` with the rendered HTML.
- backend: the host handler opens an untitled `html` doc with that content
  (assert via the vscode-mock `openTextDocument`/`showTextDocument` calls — add to
  the mock if missing).
- `tsc` + `biome` + full vitest + Playwright e2e green.

## Related — already shipped (trace)

From the same "export / clipboard / links" idea list, one item was done separately:

- **External links → `env.openExternal`** (#5): `onOpenLink` now routes `http(s)`
  to the OS browser via `vscode.env.openExternal` (local/relative still
  `vscode.open`). Shipped in **PR #40** (`fix/open-external-links`). Not part of
  this task — recorded here only so the idea-list item has a trail.

Other items from that list: `withProgress` (#3) — skipped (renders are instant);
host-side clipboard for Copy (#1) — **shipped** (`feat/host-clipboard-copy`, see the
"Move Copy to host clipboard" section above). Export HTML (the primary scope) is the
remaining net-new work.
