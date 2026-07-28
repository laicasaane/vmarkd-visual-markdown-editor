// nomnoml (UML diagrams) — task 409, split out of custom-diagrams.ts's god-module into its own
// engine file. Lazy-loads the nomnoml bundle, finds unprocessed `language-nomnoml` blocks, and
// renders each into an SVG (themed structure/label split — see themeNomnomlSvg).
import { renderDiagramError } from '../diagram-error'
import { findBlocks, getCdn, resetCustomBlocks } from '../diagram-dom'
import { loadScript } from '../load-script'
import { mutedInk } from '../diagram-palette'

declare const window: Window & {
  nomnoml?: {
    renderSvg: (source: string) => string
  }
}

// nomnoml uses #33322E (dark brown) for text/strokes and #eee8d5 (beige) for node fills.
//
// Task 377 — STRUCTURE and LABELS are coloured apart, the same split flowchart got in 376: node
// borders, edges and arrowheads take the palette's `muted`, while `<text>` keeps `currentColor` (the
// theme foreground). Painting both with the foreground made every box outline as loud as the body
// text. Only the INK changes — nomnoml was deliberately kept OUT of full palette-pairing (ADR-0006:
// trialled and reverted, the surface-fill look was not wanted), and the 6% node fill below is the
// pre-existing tint, not a new surface.
// `muted` is an explicit colour rather than a CSS variable because a presentation attribute cannot
// hold `var()`; the flip path re-renders nomnoml (diagram-retheme MONO group), so it stays current.
export function themeNomnomlSvg(svg: SVGElement, win: Window = window): void {
  svg.style.maxWidth = '100%'
  svg.style.height = 'auto'
  const DARK = ['#33322E', '#33322e']
  const LIGHT_BG = ['#eee8d5', '#fdf6e3']
  const ink = mutedInk(win)
  // A `<text>` in nomnoml carries NO fill of its own (only `stroke="none"`) — it INHERITS the ink
  // from an ancestor `<g fill="#33322E">`, the very group the structural pass below recolours. So
  // the labels have to be collected FIRST, by resolving the fill they actually inherit, and pinned
  // to `currentColor` afterwards. Measured the hard way: recolouring per element turned the whole
  // diagram muted, labels included (ink #f0f6fc → #9198a1 for every one of the 2.7k inked pixels).
  // Only labels whose inherited ink is nomnoml's DEFAULT are pinned, so a `#fill:` directive in the
  // source keeps the colour the author asked for.
  const defaultInkText: Element[] = []
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    let node: Element | null = t
    let inherited: string | null = null
    while (node && node !== svg.parentElement) {
      const f = node.getAttribute('fill')
      if (f) {
        inherited = f
        break
      }
      node = node.parentElement
    }
    if (inherited && DARK.includes(inherited)) defaultInkText.push(t)
  }
  svg.querySelectorAll('*').forEach((el) => {
    const fill = el.getAttribute('fill')
    const stroke = el.getAttribute('stroke')
    if (fill && DARK.includes(fill)) el.setAttribute('fill', ink)
    if (fill && LIGHT_BG.includes(fill)) {
      el.setAttribute('fill', 'currentColor')
      el.setAttribute('fill-opacity', '0.06')
    }
    if (stroke && DARK.includes(stroke)) el.setAttribute('stroke', ink)
  })
  // Labels are the one thing that must stay at full foreground contrast.
  for (const t of defaultInkText) t.setAttribute('fill', 'currentColor')
}

export function renderNomnoml(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'nomnoml')
  if (!blocks.length) return

  const cdn = getCdn()
  loadScript(
    `${cdn}/dist/js/nomnoml/nomnoml.min.js`,
    'vditorNomnomlScript',
  ).then(() => {
    const nn = window.nomnoml
    if (!nn?.renderSvg) return

    blocks.forEach(({ wrapper, code }) => {
      try {
        const svgStr = nn.renderSvg(code)
        wrapper.innerHTML = svgStr
        const svg = wrapper.querySelector('svg')
        if (svg) themeNomnomlSvg(svg)
        wrapper.setAttribute('data-processed', 'true')
      } catch (error) {
        // Parse error → the shared themed error box (task 178; was: silent, left blank). data-processed
        // marks the box terminal so the observer doesn't re-find + re-render the wrapper into a loop.
        renderDiagramError(wrapper, 'nomnoml', error)
        wrapper.setAttribute('data-processed', 'true')
      }
    })
  })
}

export function reRenderNomnoml(root?: ParentNode): void {
  const container = root ?? document
  resetCustomBlocks(container, 'nomnoml')
  renderNomnoml(container)
}
