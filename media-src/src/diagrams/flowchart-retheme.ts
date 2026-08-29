// Re-render already-drawn flowchart.js diagrams in the current content theme — task 91 (mirrors
// reRenderMermaid/reRenderEcharts). flowchart.js bakes explicit colours into the SVG at draw time
// (no `currentColor` — Raphael can't parse it), so a live content-/VS Code-theme flip leaves a
// flowchart in the OLD palette until reopen. The fence source still holds the flowchart text, so we
// re-parse it and redraw with the new themed foreground (the same options the esbuild patch on
// flowchartRender passes on first render: line/element/font = foreground, fill = none).
//
// Scoped to the IR/WYSIWYG preview panes (which carry an editable source sibling we can recover the
// flowchart text from); the standalone `.vditor-preview` pane has no source sibling and re-renders
// via previewRender on its own.

import { resolveDiagramPalette } from '../diagram-kit/diagram-palette'
import { clearRenderKey } from '../diagram-kit/diagram-dom'

type FlowchartGlobal = {
  parse?: (text: string) => {
    drawSVG: (el: HTMLElement, opts?: object) => void
  }
}

// The drawSVG style options — the SINGLE definition of how a flowchart is coloured, shared by the
// first render (the esbuild patch on flowchartRender.ts calls this through
// `window.__vmdeFlowchartOpts`, set in main.ts) and by the live re-theme below. Keeping one
// definition is the point: they drifted apart once and the flip repainted in a different palette.
//
// Task 376: structure and text are NOT the same colour any more. Lines and element borders take the
// palette's `muted`, labels keep `fg`. Driving all three from the foreground (what task 91 shipped)
// made the diagram shout as loudly as the body text — on github-dark that foreground is #e6edf3,
// i.e. near-white ink for every box and arrow.
// Raphael cannot parse `currentColor` (it normalises it to a garbage #6688cc) and `fill:transparent`
// renders BLACK — an explicit colour plus `fill:"none"` are the only working values here.
export function flowchartDrawOptions(
  win: Window,
  el: HTMLElement,
): Record<string, string> {
  // The computed foreground is the fallback for both roles: outside a real webview (or before the
  // theme globals land) the palette is not resolvable, and the pre-376 single-colour look is a
  // strictly better failure than an unset colour, which flowchart.js draws BLACK.
  const computed =
    (typeof win.getComputedStyle === 'function' &&
      win.getComputedStyle(el).color) ||
    '#000'
  let line = computed
  let font = computed
  try {
    const p = resolveDiagramPalette(win)
    if (p.muted && p.fg) {
      line = p.muted
      font = p.fg
    }
  } catch {
    /* palette globals not ready — keep the computed foreground for both */
  }
  return {
    'line-color': line,
    'element-color': line,
    'font-color': font,
    fill: 'none',
  }
}

// The colour actually visible BEHIND a diagram: the nearest ancestor that paints a background.
// Not the palette's `bg` — with `theme.content: auto` those agree, but a named content theme paints
// the markdown body itself, and a halo drawn in the wrong colour is a smear rather than a gap.
function backdropOf(win: Window, el: HTMLElement): string {
  let node: HTMLElement | null = el
  while (node) {
    const c = win.getComputedStyle(node).backgroundColor
    if (c && c !== 'transparent' && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(c))
      return c
    node = node.parentElement
  }
  try {
    return resolveDiagramPalette(win).bg
  } catch {
    return 'transparent'
  }
}

// Task 378 — an edge label ("yes"/"no") is placed ON the routed line, so the line strikes straight
// through the word. flowchart.js has no label-background option (Raphael draws bare <text>), so the
// text is given a HALO instead: painted under the glyphs in the page's own colour, it knocks the
// line out around the letters without introducing a visible box. Same technique as task 372's d2
// edge labels — `paint-order: stroke` is what puts the stroke UNDER the fill; without it the halo
// would be painted over the glyph and thicken it into a blob.
// Applied to every label, node ones included: their box interiors are `fill:none`, so the halo is
// the page colour on the page colour — invisible where nothing is struck through.
export function applyFlowchartLabelHalo(win: Window, el: HTMLElement): void {
  const backdrop = backdropOf(win, el)
  if (backdrop === 'transparent') return
  for (const t of Array.from(el.querySelectorAll<SVGElement>('svg text'))) {
    t.style.paintOrder = 'stroke'
    t.style.stroke = backdrop
    // 5px, measured on the fixture's `no` label: 3px only nibbles the anti-aliased edge (54 changed
    // pixels in the whole diagram — no visible gap), 7px starts eating the line itself.
    t.style.strokeWidth = '5px'
    t.style.strokeLinejoin = 'round'
  }
}

export function reRenderFlowchart(
  win: Window & { flowchart?: FlowchartGlobal },
  editorEl: HTMLElement | undefined,
): void {
  const fc = win.flowchart
  if (!editorEl || !fc || typeof fc.parse !== 'function') return
  const panes = Array.from(
    editorEl.querySelectorAll<HTMLElement>(
      '.vditor-ir__preview, .vditor-wysiwyg__preview',
    ),
  )
  for (const pane of panes) {
    const live = pane.querySelector<HTMLElement>('.language-flowchart')
    if (!live) continue
    // Source = the other `.language-flowchart` in this block (the editable <code> outside the
    // preview pane) — the rendered SVG clobbered the preview node's own text.
    const block =
      pane.closest<HTMLElement>(
        '.vditor-ir__node, .vditor-wysiwyg__block, [data-type="code-block"]',
      ) || pane.parentElement
    const source = block
      ? Array.from(
          block.querySelectorAll<HTMLElement>('.language-flowchart'),
        ).find((m) => !pane.contains(m))?.textContent
      : undefined
    if (source == null || !source.trim()) continue
    try {
      const obj = fc.parse(source)
      clearRenderKey(live) // about to be redrawn (task 436)
      live.innerHTML = ''
      obj.drawSVG(live, flowchartDrawOptions(win, live))
      applyFlowchartLabelHalo(win, live)
      live.setAttribute('data-processed', 'true')
    } catch {
      /* a malformed flowchart is the user's to fix; never throw into the theme handler */
    }
  }
}
