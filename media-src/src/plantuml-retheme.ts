// Re-render PlantUML, Graphviz, and abc diagrams on a live theme flip.
//
// All three bake their palette at draw time. The patched render functions save source in
// `data-code`; clearing `data-processed` + calling the render on the PREVIEW PANE (not the
// whole editor — the editor also has editable source .language-* elements) re-draws fresh.

import { plantumlRender } from 'vditor/src/ts/markdown/plantumlRender'
import { graphvizRender } from 'vditor/src/ts/markdown/graphvizRender'
import { abcRender } from 'vditor/src/ts/markdown/abcRender'

function reRenderLang(
  editorEl: HTMLElement,
  langClass: string,
  renderFn: (el: HTMLElement | Document, cdn: string) => void,
  cdn: string,
): void {
  const previews = editorEl.querySelectorAll<HTMLElement>(
    '.vditor-ir__preview, .vditor-wysiwyg__preview',
  )
  for (const pane of Array.from(previews)) {
    const el = pane.querySelector<HTMLElement>(`.${langClass}`)
    if (!el) continue
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
    el.innerHTML = ''
    renderFn(pane, cdn)
  }
}

export function reRenderPlantuml(
  editorEl: HTMLElement | null | undefined,
  cdn: string,
): void {
  if (!editorEl) return
  reRenderLang(editorEl, 'language-plantuml', plantumlRender, cdn)
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
