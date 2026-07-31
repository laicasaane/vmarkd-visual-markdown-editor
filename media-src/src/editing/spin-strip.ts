// Task 172 — shrink the per-keystroke SpinVditorIRDOM input by emptying the rendered preview.
//
// On every keystroke Vditor re-spins the edited block (`blockElement.outerHTML`), and that string embeds
// the previously-rendered `.vditor-ir__preview` (data-render="2") SVG/canvas PLUS our task-161 keep-last
// overlay (`.vmarkd-stale-overlay`, data-render="1"). SpinVditorIRDOM's `ParseHTML` tokenizes that whole
// multi-thousand-node subtree EVERY keystroke, and only THEN does the AST walker discard it (the
// data-render skip is post-parse). Measured: a ~2000-node diagram costs ~66 ms/keystroke in the spin
// alone; emptying the preview first drops that to ~0.35 ms (~190×) — see tasks/172.
//
// The preview/overlay contribute ZERO bytes to the markdown (proven byte-identical: both VditorIRDOM2Md
// and the SpinVditorIRDOM output are unchanged with the render emptied), so we feed the spin a COPY whose
// preview subtrees are emptied. The editable source `<code>` (and its `<wbr>` caret marker) is untouched,
// and the LIVE DOM is untouched (we parse a detached <template>) — the spin rebuilds the empty preview
// shell and processCodeRender (deferred by task 161) re-renders it. Consumed by the esbuild
// `patchIrStripPreviewSpin` (ir/input.ts) via `window.__vmarkdStripPreviewForSpin`.

/** Return `html` with every `.vditor-ir__preview` render (and `.vmarkd-stale-overlay`) emptied — a no-op
 *  for blocks that carry no rendered preview (prose / plain code), which is the common keystroke. */
export function stripPreviewForSpin(html: string): string {
  // Fast path: only pay the parse when there is actually a rendered preview/overlay to strip. Prose and
  // raw source blocks carry neither marker, so the typical keystroke returns immediately.
  if (
    html.indexOf('vditor-ir__preview') === -1 &&
    html.indexOf('vmarkd-stale-overlay') === -1
  )
    return html
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  let stripped = false
  // Empty the render subtree but KEEP the `data-render` preview shell (the spin rebuilds it). The overlay
  // lives inside the preview, so emptying the preview drops it too; selecting it as well catches a stray.
  for (const el of Array.from(
    tpl.content.querySelectorAll('.vditor-ir__preview, .vmarkd-stale-overlay'),
  )) {
    if (el.firstChild) {
      el.textContent = ''
      stripped = true
    }
  }
  return stripped ? tpl.innerHTML : html
}
