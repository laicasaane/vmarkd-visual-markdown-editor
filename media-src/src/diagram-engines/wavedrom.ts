// WaveDrom (digital timing diagrams) — task 409, split out of custom-diagrams.ts's god-module
// into its own engine file. Lazy-loads the wavedrom bundle, finds unprocessed `language-wavedrom`
// blocks, and renders each into an SVG via faithfulRender (themed via currentColor).
import { renderDiagramError } from '../diagram-error'
import { findBlocks, getCdn, resetCustomBlocks } from '../diagram-dom'
import { loadScript } from '../load-script'
import { faithfulRender } from '../faithful-render'

declare const window: Window & {
  wavedrom?: {
    // 3rd arg is an id PREFIX string: renderWaveForm renders into document.getElementById(prefix+index).
    renderWaveForm: (index: number, source: object, idPrefix: string) => void
    waveSkin?: unknown // unpkg bundle exposes the skin here; bridged to window.WaveSkin (legacy global)
  }
  WaveSkin?: any
}

// WaveDrom bakes colors into inline style attrs (not fill/stroke attrs). The default
// skin is light-only: white backgrounds, black text/grid, #0041c4 signal arrows.
// Post-process: white bg → transparent, black → currentColor, dark grids → muted.
// Signal wave colors (greens, blues, reds, yellows) are intentional data colors — keep them.
function themeWavedromSvg(svg: SVGElement): void {
  svg.style.maxWidth = '100%'
  svg.style.height = 'auto'
  // The wave LINES (.s1/.s2), dashes (.s3/.s4) and hatch (.s6) get their colour from CLASSES in an
  // embedded <style> skin (stroke/fill/color:#000), NOT inline attrs — so the inline pass below misses
  // them and they stay black (invisible on dark; reported). Rewrite the skin CSS: black → currentColor
  // (incl. `color:#000`, which would otherwise pin currentColor itself to black so even recoloured
  // strokes render black), white fill → transparent. The pastel data-value fills (.s8–.s14) and the
  // #0041c4 signal arrows are intentional data colours — their hexes don't match these patterns, so
  // they're left untouched.
  svg.querySelectorAll('style').forEach((styleEl) => {
    const css = styleEl.textContent
    if (!css) return
    const next = css
      .replace(
        /(stroke|fill|color)\s*:\s*#0{3}(?:0{3})?\b/gi,
        '$1:currentColor',
      )
      .replace(/(stroke|fill|color)\s*:\s*black\b/gi, '$1:currentColor')
      .replace(/fill\s*:\s*#f{3}(?:f{3})?\b/gi, 'fill:transparent')
      .replace(/fill\s*:\s*white\b/gi, 'fill:transparent')
    if (next !== css) styleEl.textContent = next
  })
  // Black/white recolor, robust to ALL representations: hex (#000/#000000), keyword (black/white) and
  // the rgb() form a browser normalises a colour to. Applies to inline `style` AND presentation
  // ATTRIBUTES (`stroke="#000"`): the `reg` (bitfield) diagram draws its boxes/lines with black stroke
  // ATTRIBUTES — which the inline-style + skin-CSS passes both miss — so it rendered all-black on dark
  // (e2e: reg blackStroke=32). signal/assign use the `.s*` skin classes (handled by the <style> rewrite).
  const norm = (c?: string | null) =>
    (c ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const isBlack = (c?: string | null) =>
    ['#000', '#000000', 'black', 'rgb(0,0,0)'].includes(norm(c))
  const isWhite = (c?: string | null) =>
    ['#fff', '#ffffff', '#ffffffcc', 'white', 'rgb(255,255,255)'].includes(
      norm(c),
    )
  svg.querySelectorAll('*').forEach((el) => {
    // presentation attributes (reg/bitfield boxes + bit lines)
    if (isBlack(el.getAttribute('stroke')))
      el.setAttribute('stroke', 'currentColor')
    const fa = el.getAttribute('fill')
    if (isBlack(fa)) el.setAttribute('fill', 'currentColor')
    else if (isWhite(fa)) el.setAttribute('fill', 'transparent')
    // inline style (signal grids etc.)
    const st = (el as HTMLElement).style
    if (st) {
      if (isWhite(st.fill)) st.fill = 'transparent'
      if (isBlack(st.fill)) st.fill = 'currentColor'
      if (isBlack(st.stroke)) st.stroke = 'currentColor'
      // Gray grid lines → follow theme (muted currentColor with opacity)
      if ((el.getAttribute('style') ?? '').includes('stroke:#888')) {
        st.stroke = 'currentColor'
        st.opacity = '0.3'
      }
    }
  })
  svg.querySelectorAll('text').forEach((t) => {
    const fill = t.getAttribute('fill')
    if (!fill || isBlack(fill)) t.setAttribute('fill', 'currentColor')
    if (!t.style.fill || isBlack(t.style.fill)) t.style.fill = 'currentColor'
  })
}

// Task 186: renderWaveForm resolves its target via document.getElementById(prefix+index),
// so target ids must be unique DOCUMENT-WIDE and NEVER reused. A per-call counter restarted
// at 0 each pass: the IR pane rendered first and kept its id-bearing divs, so the later
// full-Preview pass drew every waveform into the STALE IR div and swapped an empty stage
// div into the Preview wrapper → zero-height blocks (parity {ir:>0, pv:0}). A module-level
// monotonic counter also keeps WaveDrom's internal svg ids (svgcontent_N, lane/gradient ids)
// unique across the IR/Preview copies of the same document.
let wavedromSeq = 0

export function renderWavedrom(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'wavedrom')
  if (!blocks.length) return

  const cdn = getCdn()
  loadScript(
    `${cdn}/dist/js/wavedrom/wavedrom.min.js`,
    'vditorWavedromScript',
  ).then(() => {
    const wd = window.wavedrom
    if (!wd?.renderWaveForm) return
    // renderWaveForm internally reads window.WaveSkin (legacy global); the unpkg
    // bundle only sets wavedrom.waveSkin — bridge it.
    if (!window.WaveSkin && wd.waveSkin) (window as any).WaveSkin = wd.waveSkin

    blocks.forEach(({ wrapper, code }) => {
      const index = wavedromSeq++
      // faithfulRender swaps in the result only on success; on a JSON parse error OR a renderWaveForm
      // throw the onError callback shows the shared themed error box (task 178; was: blanked/source).
      void faithfulRender(
        wrapper,
        'wavedrom',
        (stage) => {
          const parsed = JSON.parse(code)
          // renderWaveForm(index, source, idPrefix) renders into
          // document.getElementById(idPrefix + index) — so the target div must be in
          // the document (the stage is), with a matching id.
          const div = document.createElement('div')
          div.id = `__vmarkd_wd_${index}`
          stage.appendChild(div)
          wd.renderWaveForm(index, parsed, '__vmarkd_wd_')
          const svg = stage.querySelector('svg')
          if (svg) themeWavedromSvg(svg)
          // Strip the lookup id once rendered: a leftover __vmarkd_wd_* target in a pane —
          // or inside cache-restored HTML (task 184 persists this innerHTML across sessions,
          // where the counter restarts) — would win a later pass's getElementById and
          // re-create the empty-swap collision.
          div.removeAttribute('id')
        },
        (w, err) => renderDiagramError(w, 'wavedrom', err),
      )
    })
  })
}

export function reRenderWavedrom(root?: ParentNode): void {
  const container = root ?? document
  resetCustomBlocks(container, 'wavedrom', 'data-wavedrom-error')
  renderWavedrom(container)
}
