// Re-render PlantUML, Graphviz, and abc diagrams on a live theme flip.
//
// All three bake their palette at draw time. The patched render functions save source in
// `data-code`; clearing `data-processed` + calling the render on the PREVIEW PANE (not the
// whole editor — the editor also has editable source .language-* elements) re-draws fresh.

import { plantumlRender } from 'vditor/src/ts/markdown/plantumlRender'
import { graphvizRender } from 'vditor/src/ts/markdown/graphvizRender'
import { abcRender } from 'vditor/src/ts/markdown/abcRender'
import { clearRenderKey } from './diagram-dom'
import { renderedDiagramTargets } from './diagram-surfaces'

function reRenderLang(
  editorEl: HTMLElement,
  langClass: string,
  renderFn: (el: HTMLElement | Document, cdn: string) => void,
  cdn: string,
  onPaneReRender?: () => void,
): void {
  // Task 412 follow-up — was "find PANES as descendants of editorEl (2-selector, IR/WYSIWYG only),
  // then query the target within each pane". Two confirmed-HIGH bugs in that shape: (1) it never
  // matched `.vditor-preview` at all, so a theme flip left the full/split Preview surface's
  // diagrams permanently stale; (2) even after widening the selector, "panes as descendants" finds
  // NOTHING when `editorEl` is a NARROWED per-diagram scope (task 412's own viewport-gating passes
  // `blockScopeOf(target)`) whose `.vditor-preview` fallback is the target's own immediate parent —
  // that parent does not itself carry a preview-pane class; the real ancestor sits further up,
  // OUTSIDE the narrowed scope. `renderedDiagramTargets` finds the target directly via a
  // descendant-combinator selector, which is evaluated against the target's FULL ancestor chain
  // (not just ancestors inside `editorEl`), so it works in both the broad-root and narrowed-scope
  // cases — and, structurally, still EXCLUDES the editable-source copy (living inside
  // `.vditor-ir__marker--pre`/`.vditor-wysiwyg__pre`, never inside a preview-pane class).
  const lang = langClass.slice('language-'.length)
  let resetAny = false
  for (const el of renderedDiagramTargets(editorEl, lang)) {
    // Capture the source BEFORE the clear below wipes it (task 363). The patched renderers stamp
    // `data-code` as they draw, so after a completed render it is always there — but a theme flip
    // that lands DURING the first render finds a node whose source still lives only in textContent,
    // and `innerHTML = ''` deleted it. The re-render then had nothing to draw from and left the
    // diagram permanently empty: no svg, no error box, no text, no recovery. Observed on the two
    // slowest engines (graphviz/Viz.js-WASM and plantuml/TeaVM) simply because they are the ones
    // wide enough to be caught mid-render.
    const stamped = el.getAttribute('data-code')
    // Only trust textContent while the node still holds RAW SOURCE. Once the engine has put an
    // element in there, textContent is svg/markup text — stamping THAT as the source would turn a
    // recoverable node into a permanently broken one.
    const raw = el.firstElementChild ? null : el.textContent?.trim() || null
    const source = stamped ?? raw
    // Neither → there is nothing to redraw from. Leave the node exactly as it is and let the
    // in-flight render finish, rather than clearing it into a state nothing can recover from.
    if (!source) continue
    // Hand the renderer the source through the attribute it reads first, so the clear cannot lose it.
    el.setAttribute('data-code', source)
    el.removeAttribute('data-processed')
    // About to be redrawn → drop the render-cache stamp (task 436), so the fresh render can be
    // reported under the current theme key. Until it lands, `put`'s markup check keeps the OLD
    // picture from being filed under the new key.
    clearRenderKey(el)
    el.innerHTML = ''
    resetAny = true
    onPaneReRender?.()
  }
  // ONE call for every target this pass reset — plantumlRender/graphvizRender/abcRender each do
  // their OWN plain `editorEl.querySelectorAll('.language-X')` scan internally (verified: none of
  // them require `editorEl` to itself carry a preview-pane class), skipping already-`data-processed`
  // and editable-source elements on their own, so a single call redraws every target reset above
  // regardless of how narrow or broad `editorEl` is.
  if (resetAny) renderFn(editorEl, cdn)
}

// How many times the theme-flip path has re-rendered plantuml, and how many preview panes it cleared
// + redrew, exposed on window for a real-VS-Code spec to assert against. Same posture as
// __vmarkdD2RenderStats (task 411): a plantuml re-render is the most expensive thing a flip triggers
// (each stdlib block re-preprocesses its ~2000-line library), so the number that matters is how many
// of them a single flip causes — the reThemeMono poll used to fire TWICE per flip (once per
// intermediate foreground value during the content-theme settle), doubling this and, because the
// second pass cleared blocks mid-render, thrashing the engine into a ~57s → now ~5s stall on a
// 13-block doc. The debounce in diagram-retheme.ts's reThemeOnForegroundChange collapses it to one.
const pumlRethemeStats = { calls: 0, panesReRendered: 0 }
;(
  window as unknown as { __vmarkdPumlRethemeStats?: typeof pumlRethemeStats }
).__vmarkdPumlRethemeStats = pumlRethemeStats

export function reRenderPlantuml(
  editorEl: HTMLElement | null | undefined,
  cdn: string,
): void {
  if (!editorEl) return
  pumlRethemeStats.calls++
  reRenderLang(editorEl, 'language-plantuml', plantumlRender, cdn, () => {
    pumlRethemeStats.panesReRendered++
  })
}

export function reRenderGraphviz(
  editorEl: HTMLElement | null | undefined,
  cdn: string,
): void {
  if (!editorEl) return
  reRenderLang(editorEl, 'language-graphviz', graphvizRender, cdn)
}

export function reRenderAbc(
  editorEl: HTMLElement | null | undefined,
  cdn: string,
): void {
  if (!editorEl) return
  reRenderLang(editorEl, 'language-abc', abcRender, cdn)
}
