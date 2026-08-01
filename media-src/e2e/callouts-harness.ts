// Callouts harness (task 106) — unit-level DOM test of applyCallouts. Builds the blockquote shapes
// Lute emits for `> [!TYPE]` (`<blockquote><p>[!NOTE]<br>body</p></blockquote>`), plus a plain
// quote and a `[!tip]-` fold-suffix case (the suffix is accepted but IGNORED — fold support dropped). Exposes applyCallouts so the spec can assert the dual-node DOM output (tag
// + injected preview) and that the editable source is left intact (round-trip). The source⇄preview
// VISIBILITY swap needs Vditor's expandMarker, so it's tested in the real-Vditor `callout-ir`
// harness instead.
import { applyCallouts, calloutWysiwygToolbar } from '../src/editing/callouts'

const app = document.getElementById('app') as HTMLElement
// EXPLICIT `--vscode-editor-font-family`/`--me-font-size` on #app (task 478 item 5 fallout):
// Vditor's own `.vditor-reset { font-family: …; font-size: … }` rule is now patched directly
// (build.mjs patchVditorIndexCss), so it reaches `.vditor-reset` unconditionally — including this
// fixture, which previously dodged it only because the main.css rule it replaced was scoped
// `.vditor .vditor-reset` and this fixture has no `.vditor` ancestor. Real VS Code always sets
// these vars on the webview root, so an UNRESOLVED var (falling back to the browser's UA default,
// e.g. Times New Roman) is not what production ever renders — give the fixture realistic values
// instead of leaving its golden (callout-note.png) at the mercy of a browser default.
// Deliberately NOT wrapped in an actual `.vditor`-classed element: that class carries Vditor's own
// structural CSS (`border: 1px solid …; box-sizing: border-box`, index.css:513) which would shrink
// the content box by the border width — an unrelated ~2px layout change with nothing to do with
// the font vars this fixture needs. Setting the custom properties directly on #app inherits them
// into `.vditor-reset` the same way, without pulling in `.vditor`'s box model.
app.style.setProperty(
  '--vscode-editor-font-family',
  "Consolas, 'Courier New', monospace",
)
app.style.setProperty('--me-font-size', '16px')
app.innerHTML = `
  <div class="vditor-reset">
    <blockquote id="note"><p>[!NOTE]<br>Body of the note.</p></blockquote>
    <blockquote id="warning"><p>[!WARNING] Careful<br>Watch out.</p></blockquote>
    <blockquote id="fold"><p>[!tip]-<br>Hidden tip.</p></blockquote>
    <blockquote id="plain"><p>Just a normal quote.</p></blockquote>
  </div>
  <!-- WYSIWYG: no expandMarker, so callouts get a type-dropdown + hidden marker (NOT the dual-node).
       Lute emits the marker + first body line in ONE editable <p> separated by a newline. -->
  <div class="vditor-wysiwyg">
    <div class="vditor-reset" contenteditable="true">
      <blockquote id="wy-note"><p data-block="0">[!NOTE]
Body of the note.</p></blockquote>
      <blockquote id="wy-warning"><p data-block="0">[!WARNING] Careful
Watch out.</p></blockquote>
      <blockquote id="wy-plain"><p data-block="0">Just a normal quote.</p></blockquote>
    </div>
  </div>
`
;(window as any).__apply = () => applyCallouts(document.body)
// Simulate Vditor's `customWysiwygToolbar('blockquote', popover)` hook: put the caret inside the
// given WYSIWYG callout, then run the toolbar builder against a fresh popover element. Returns the
// popover so the spec can assert the injected <select>.
;(window as any).__toolbar = (calloutId: string): HTMLElement => {
  const bq = document.getElementById(calloutId) as HTMLElement
  const body = bq.querySelector(':scope > p') as HTMLElement
  const range = document.createRange()
  range.selectNodeContents(body)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  const popover = document.createElement('div')
  popover.className = 'vditor-panel'
  document.body.appendChild(popover)
  calloutWysiwygToolbar('blockquote', popover)
  return popover
}
;(window as any).__ready = true
