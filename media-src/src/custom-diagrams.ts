// Custom diagram renderers for languages Vditor doesn't natively support.
// Each renderer: lazy-loads the engine script, finds unprocessed code blocks,
// replaces them with rendered SVG. Themed via currentColor (same as graphviz/plantuml).

// D2: compile-only WASM (compileD2) -> graph JSON -> dagre+Canvas SVG (renderD2Graph),
// with a LOUD fallback for shapes dagre can't faithfully render (unsupportedReason).
import { compileD2, type D2Graph } from './d2-wasm'
import { logToHost } from './webview-log'
// The D2 render+layout engine (renderD2Graph / renderD2GraphElk / canvasMeasure / unsupportedReason /
// d2Theme) is code-split into media/vditor/dist/js/d2/d2-main.js (task 165) — it pulls dagre + our
// ELK/refine/astar cluster (~109 KB) that only ever runs for `.language-d2`, so keeping it out of the
// eager main.js removes that parse + top-level eval from startup for every non-D2 doc. renderD2()
// loads the bundle on demand and reads the values off `window.__vmarkdD2` (typed below); we do NOT
// static-import those values here (that would bundle dagre back into main.js).
import { renderDiagramError } from './diagram-error'
import { loadScript } from './load-script'
import { faithfulRender } from './faithful-render'
import { getD2Config } from './d2-config'
import { mutedInk } from './diagram-palette'
import {
  isTyping,
  deferUntilSettle,
  beginSettleRender,
  scheduleReveal,
} from './edit-activity'

declare const window: Window & {
  vditor?: { options?: { cdn?: string } }
  wavedrom?: {
    // 3rd arg is an id PREFIX string: renderWaveForm renders into document.getElementById(prefix+index).
    renderWaveForm: (index: number, source: object, idPrefix: string) => void
    waveSkin?: unknown // unpkg bundle exposes the skin here; bridged to window.WaveSkin (legacy global)
  }
  nomnoml?: {
    renderSvg: (source: string) => string
  }
  L?: any
  topojson?: {
    feature: (topology: any, object: any) => any
  }
  __threeSTL?: any
  WaveSkin?: any
  vegaEmbed?: (el: HTMLElement, spec: any, opts?: any) => Promise<any>
  // D2 render+layout bridge exposed by the lazy d2-main.js bundle (d2-entry.ts, task 165).
  // `typeof import(...)` keeps these TYPE-ONLY, so tsc/esbuild erase the reference and the
  // d2-render/dagre code never lands in main.js — the runtime values arrive via the fetched bundle.
  __vmarkdD2?: {
    renderD2Graph: typeof import('./d2-render').renderD2Graph
    renderD2GraphElk: typeof import('./elk-layout').renderD2GraphElk
    canvasMeasure: typeof import('./d2-render').canvasMeasure
    unsupportedReason: typeof import('./d2-render').unsupportedReason
    d2Theme: typeof import('./d2-render').d2Theme
    makeSketch: typeof import('./d2-sketch').makeSketch
  }
}

function getCdn(): string {
  const v = window.vditor as any
  return v?.vditor?.options?.cdn ?? v?.options?.cdn ?? ''
}

function addScript(src: string, id: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById(id)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.id = id
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => resolve()
    document.head.appendChild(s)
  })
}

function addStylesheet(href: string, id: string): void {
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function themeSvg(svg: SVGElement): void {
  svg.style.maxWidth = '100%'
  svg.style.height = 'auto'
  svg.querySelectorAll('text').forEach((t) => {
    if (
      !t.getAttribute('fill') ||
      t.getAttribute('fill') === '#000' ||
      t.getAttribute('fill') === 'black'
    )
      t.setAttribute('fill', 'currentColor')
  })
  svg.querySelectorAll('path, line, polyline, rect, polygon').forEach((el) => {
    const s = el.getAttribute('stroke')
    if (s === '#000' || s === 'black' || s === '#000000')
      el.setAttribute('stroke', 'currentColor')
  })
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

const PANE_SEL =
  '.vditor-ir__preview, .vditor-wysiwyg__preview, .vditor-preview'

// Exported for unit testing the code→div swap (notably the hljs-strip — see custom-diagrams.test.ts).
export function findBlocks(
  root: ParentNode,
  lang: string,
): { wrapper: HTMLElement; code: string }[] {
  const results: { wrapper: HTMLElement; code: string }[] = []
  // Search preview panes first (IR/WYSIWYG collapsed preview, full Preview overlay),
  // then fall back to the whole root — custom languages (wavedrom, nomnoml, geojson,
  // topojson) are unknown to Vditor and may appear as bare <code> blocks without a
  // preview pane wrapper.
  const sel = `code.language-${lang}:not([data-processed="true"]), div.language-${lang}:not([data-processed="true"])`
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
    // Skip editable source blocks — render only in preview context
    if (el.closest('.vditor-ir__marker--pre, .vditor-wysiwyg__pre')) continue
    if (!el.getAttribute('data-code')) {
      el.setAttribute('data-code', el.textContent?.trim() ?? '')
    }
    const code = el.getAttribute('data-code') ?? el.textContent?.trim() ?? ''
    if (!code) continue
    // <code> can't hold block-level children (div/svg/canvas) — browsers refuse to
    // parse them as DOM inside inline elements. Swap to a <div> with the same class
    // so renderers can append real elements.
    let wrapper = el
    if (el.tagName === 'CODE') {
      const div = document.createElement('div')
      // Drop the `hljs` class: Vditor's processCodeRender highlights these unknown-language blocks as
      // code first (adds `.hljs` to the <code>), and copying it onto the diagram <div> made the
      // highlight.js theme paint the code-PANEL background behind the (often transparent) diagram svg
      // — the rendered diagram sat on a code box instead of the page (task 161 follow-up). The diagram
      // only needs its `language-X` class for the theming/centering CSS to match.
      div.className = el.className
        .replace(/\bhljs\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (el.getAttribute('data-code'))
        div.setAttribute('data-code', el.getAttribute('data-code')!)
      el.replaceWith(div)
      wrapper = div
    }
    results.push({ wrapper, code })
  }
  return results
}

// --- WaveDrom ---

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
  addScript(
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
  for (const pane of Array.from(
    container.querySelectorAll<HTMLElement>(PANE_SEL),
  )) {
    for (const el of Array.from(
      pane.querySelectorAll<HTMLElement>(
        'code.language-wavedrom[data-processed], div.language-wavedrom[data-processed]',
      ),
    )) {
      el.removeAttribute('data-processed')
      el.removeAttribute('data-wavedrom-error')
      el.innerHTML = ''
    }
  }
  renderWavedrom(container)
}

// --- nomnoml ---

export function renderNomnoml(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'nomnoml')
  if (!blocks.length) return

  const cdn = getCdn()
  addScript(
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
  for (const pane of Array.from(
    container.querySelectorAll<HTMLElement>(PANE_SEL),
  )) {
    for (const el of Array.from(
      pane.querySelectorAll<HTMLElement>(
        'code.language-nomnoml[data-processed], div.language-nomnoml[data-processed]',
      ),
    )) {
      el.removeAttribute('data-processed')
      el.innerHTML = ''
    }
  }
  renderNomnoml(container)
}

// --- D2 (compile-only WASM + dagre + currentColor SVG) ---

// --- D2 |md| markdown labels (task 154) ---

// Fresh, module-cached Lute instance for md→HTML. Deliberately NOT the editor's vditor.lute:
// that instance carries vMarkd's JS renderText hooks (custom-renderer.ts), which expect
// editor-DOM context and would leak editor-specific markup into diagram labels.
interface LuteLike {
  Md2HTML: (md: string) => string
}
let d2Lute: LuteLike | null = null
function getD2Lute(): LuteLike | null {
  if (d2Lute) return d2Lute
  const L = (window as unknown as { Lute?: { New: () => LuteLike } }).Lute
  if (!L) return null
  d2Lute = L.New()
  return d2Lute
}

// Offscreen-measure the rendered md HTML with the SAME class the foreignObject div uses:
// natural width, capped at 420px so a long note wraps instead of dominating the diagram.
// The probe MUST sit in the same cascade context as the final render (inside .vditor-reset):
// Vditor's descendant typography (h1 size/border, list margins…) reaches INTO the
// foreignObject, so a body-mounted probe under-measured and the last md line got clipped.
function measureMdHtml(html: string, near?: Element): { w: number; h: number } {
  const probe = document.createElement('div')
  probe.className = 'vmarkd-d2-md'
  probe.style.cssText =
    'position:absolute;left:-99999px;top:0;width:max-content;max-width:420px'
  probe.innerHTML = html
  const host = near?.closest('.vditor-reset') ?? document.body
  host.appendChild(probe)
  const r = probe.getBoundingClientRect()
  probe.remove()
  return {
    w: Math.ceil(Math.max(r.width, 24)),
    h: Math.ceil(Math.max(r.height, 16)),
  }
}

// Task 154: text shapes with language==='markdown' (a |md| block string) get their label
// rendered to HTML (Lute — the same GFM engine as the editor) and measured offscreen BEFORE
// layout, so ELK/dagre size those nodes to the formatted render, not the raw md lines.
// d2-render then emits a <foreignObject> (see the enrichment comment on D2Shape). Lute
// missing → fields stay absent → the pre-154 plain-text render (graceful, logged).
// `near` = the render target; the measure probe mounts in ITS .vditor-reset so the
// editor cascade applies to both measure and render identically.
export async function enrichMarkdownLabels(
  graph: D2Graph,
  near?: Element,
): Promise<void> {
  let fontsReady = false
  for (const s of graph.shapes) {
    if (s.shape !== 'text' || s.language !== 'markdown' || !s.label) continue
    const lute = getD2Lute()
    if (!lute) {
      logToHost('[d2] Lute unavailable — |md| labels render as plain text')
      return
    }
    if (!fontsReady) {
      // @font-face loads lazily on first USE — on a cold open the measure would run with the
      // fallback font and drift from the final render (observed: max-content 219→169 once
      // Source Sans 3 landed). Force-load the face BEFORE measuring; no-op when cached.
      try {
        await document.fonts?.load('16px "Source Sans 3"')
      } catch {
        /* measurement proceeds with the fallback face */
      }
      fontsReady = true
    }
    s.mdHtml = lute.Md2HTML(s.label)
    s.mdSize = measureMdHtml(s.mdHtml, near)
  }
}

// Load the code-split D2 engine bundle (d2-main.js → window.__vmarkdD2) ONCE, caching the promise
// (task 165). Caching is load-bearing, NOT just an optimisation: a doc with N d2 blocks renders them
// concurrently, and the bare addScript() dedup (getElementById) resolves the moment the <script> tag
// EXISTS — before it has executed — so blocks 2..N would read an undefined global and boot-error.
// One shared promise makes them all await the same real load (mirrors elk-layout.ts bootElk). On a
// failed load the cache is cleared so a later render can retry.
let d2EnginePromise: Promise<typeof window.__vmarkdD2> | null = null
function loadD2Engine(cdn: string): Promise<typeof window.__vmarkdD2> {
  if (!d2EnginePromise) {
    d2EnginePromise = loadScript(
      `${cdn}/dist/js/d2/d2-main.js`,
      'vditorD2MainScript',
    ).then(() => {
      const d2 = window.__vmarkdD2
      if (!d2) d2EnginePromise = null // load failed → allow a retry on the next render
      return d2
    })
  }
  return d2EnginePromise
}

export function renderD2(root?: ParentNode): void {
  const container = root ?? document
  // findBlocks already skips IR/WYSIWYG edit-surface markers (.vditor-ir__marker--pre,
  // .vditor-wysiwyg__pre) and already-[data-processed] blocks — D2 inherits that guard.
  const blocks = findBlocks(container, 'd2')
  if (!blocks.length) return

  const cdn = getCdn()
  for (const { wrapper, code } of blocks) {
    // D2 is ASYNC (WASM boot + compile), unlike the synchronous renderers above. Mark the
    // block processed UP-FRONT so a re-firing observer can't double-render it while
    // compileD2 is pending (the sync renderers set data-processed at the end; D2 cannot).
    wrapper.setAttribute('data-processed', 'true')
    compileD2(cdn, code)
      .then(async (res) => {
        if ('error' in res) {
          // Distinguish a WASM boot/timeout from a real d2 COMPILE error so a stuck engine isn't
          // mistaken for bad syntax. A compile error is a validation failure → show the shared themed
          // box with d2's own message (task 178, like mermaid). A boot/timeout is infrastructure, NOT
          // the user's syntax → leave the source visible so they can still read/copy it.
          // data-d2-error stays inspectable in devtools / e2e (and reRenderD2 clears it).
          if (res.error === 'd2 wasm unavailable') {
            wrapper.setAttribute('data-d2-error', 'boot')
          } else {
            wrapper.setAttribute('data-d2-error', 'compile')
            renderDiagramError(wrapper, 'd2', res.error)
          }
          return
        }
        // Lazy-load the code-split D2 render+layout engine (dagre + our ELK/refine/astar pipeline) —
        // task 165. Awaited HERE, inside the already-async compile `.then`, so a non-D2 doc never
        // fetches OR parses it. A missing bridge means the bundle genuinely failed to load → mark a
        // boot error and leave the source visible (same posture as the d2 WASM boot failure above).
        const d2 = await loadD2Engine(cdn)
        if (!d2) {
          wrapper.setAttribute('data-d2-error', 'boot')
          return
        }
        const reason = d2.unsupportedReason(res)
        if (reason) {
          // LOUD fallback (faithful-by-construction, NON-NEGOTIABLE): raw source + a note,
          // NEVER a partial/wrong picture. Single enforcement point for unsupportedReason.
          wrapper.innerHTML = ''
          const note = document.createElement('div')
          note.className = 'd2-unsupported-note'
          note.textContent = `d2: ${reason} not supported — showing source`
          const pre = document.createElement('pre')
          pre.className = 'language-d2-unsupported'
          pre.textContent = code
          wrapper.append(note, pre)
          return
        }
        // Task 154: render + measure |md| labels BEFORE layout, so ELK/dagre size those
        // nodes to the formatted HTML (not the raw md lines).
        await enrichMarkdownLabels(res, wrapper)
        // Layout engine from the `vmarkd.diagram.d2Layout` setting (window global set by main.ts).
        // ELK gives orthogonal routing; it lazy-loads a separate main-thread bundle (elk-main.js,
        // ~1.4 MB) and returns null if it can't load/lay out, so we fall back to dagre.
        // Render config from the typed owner (d2-config.ts; set by main.ts). 'auto' theme pairs the
        // palette to the content theme + editor mode; named themes paint their own palette (+bg for
        // d2-*); 'mono'/undefined → monochrome currentColor that follows the editor.
        const cfg = getD2Config()
        const style = d2.d2Theme(cfg.theme, cfg.contentTheme, cfg.mode)
        // Hand-drawn "sketch" emit (task 120, vmarkd.diagram.d2Sketch): build the injected rough.js
        // emitter once and thread it into whichever layout engine renders. undefined = crisp (default).
        const sketch = cfg.sketch ? d2.makeSketch() : undefined
        let svgStr: string | null = null
        let engine = 'dagre'
        // Three engines (vmarkd.diagram.d2Layout): 'vmarkd' = ELK + our refinement pipeline (default),
        // 'elk' = raw ELK (refine off), 'dagre' = the bundled fallback. ELK lazy-loads elk-main.js and
        // returns null if it can't load/lay out → we always fall back to dagre.
        const layout = cfg.layout
        if (layout === 'vmarkd' || layout === 'elk') {
          const refine = layout === 'vmarkd'
          svgStr = await d2.renderD2GraphElk(
            res,
            d2.canvasMeasure,
            cdn,
            style,
            refine,
            sketch,
          )
          if (svgStr) engine = layout
        }
        if (!svgStr)
          svgStr = d2.renderD2Graph(res, d2.canvasMeasure, style, sketch)
        wrapper.innerHTML = svgStr
        // Record which engine actually produced the SVG (elk vs the dagre fallback). Lets the
        // real-VS-Code e2e prove ELK ran in the webview rather than silently falling back.
        wrapper.setAttribute('data-d2-engine', engine)
        const svg = wrapper.querySelector('svg')
        if (svg) themeSvg(svg)
      })
      .catch(() => {
        /* leave source visible */
      })
  }
}

export function reRenderD2(root?: ParentNode): void {
  const container = root ?? document
  for (const pane of Array.from(
    container.querySelectorAll<HTMLElement>(PANE_SEL),
  )) {
    for (const el of Array.from(
      pane.querySelectorAll<HTMLElement>(
        'code.language-d2[data-processed], div.language-d2[data-processed]',
      ),
    )) {
      el.removeAttribute('data-processed')
      el.removeAttribute('data-d2-error')
      el.innerHTML = ''
    }
  }
  renderD2(container)
}

// --- GeoJSON / TopoJSON (Leaflet) ---

// Basemap tile source for a geojson/topojson map, chosen by the `theme.geoBasemap` setting (task 99 +
// the setting). `auto` (default) is the THEMED MONOCHROME CARTO basemap (Positron light / Dark Matter
// dark) — a neutral backdrop so the data stands out; it flips with the editor mode. `voyager`/`osm`
// are colored; `none` (and any unknown value handled by the default arm is `auto`, NOT none) → no
// basemap. All non-null sources are remote `https:` tiles, so they only load when allowRemoteImages is
// on (CSP). `{r}` is Leaflet's retina token (→ '' unless detectRetina); OSM has no retina tiles so its
// URL omits it. Exported for the unit test. Keep in sync with the package.json enum.
export interface Basemap {
  url: string
  subdomains: string
  maxZoom: number
  attribution: string
}
const CARTO_ATTR = '© OpenStreetMap contributors © CARTO'
export function basemapFor(
  setting: string | undefined,
  dark: boolean,
): Basemap | null {
  switch (setting) {
    case 'none':
      return null
    case 'voyager':
      return {
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: CARTO_ATTR,
      }
    case 'osm':
      return {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }
    default: {
      // 'auto' (and any unknown value) → themed monochrome CARTO, per editor mode (current default).
      const variant = dark ? 'dark_all' : 'light_all'
      return {
        url: `https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`,
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: CARTO_ATTR,
      }
    }
  }
}

function initLeafletMap(wrapper: HTMLElement, geojson: any): void {
  const L = window.L
  if (!L) return

  const div = document.createElement('div')
  div.style.cssText = 'width:100%;height:300px;background:transparent'
  wrapper.innerHTML = ''
  wrapper.appendChild(div)

  const map = L.map(div, {
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: false,
  })

  // Optional remote basemap (task 99): default is geometry-only on a transparent canvas (fully
  // offline). When the user has opted into remote images, add a basemap UNDER the geometry; its style
  // follows the `theme.geoBasemap` setting (default `auto` = themed monochrome CARTO, picked light/dark
  // per the editor mode — see basemapFor). The CSP only allows `https:` images when
  // `image.allowRemoteImages` is on, so without the opt-in these tiles can't (and won't) be requested;
  // `geoBasemap: none` also skips the basemap (basemapFor → null) even when remote images are allowed.
  if ((window as any).__vmarkdAllowRemoteImages) {
    const cfg = getD2Config()
    const basemap = basemapFor(cfg.geoBasemap, cfg.mode === 'dark')
    if (basemap) {
      L.tileLayer(basemap.url, {
        subdomains: basemap.subdomains,
        maxZoom: basemap.maxZoom,
        attribution: basemap.attribution,
      }).addTo(map)
      // OSM/CARTO require visible attribution — re-enable the control we suppressed above.
      L.control.attribution({ prefix: false }).addTo(map)
    }
  }

  const fg = getComputedStyle(wrapper).color || '#3388ff'
  const layer = L.geoJSON(geojson, {
    style: {
      color: fg,
      fillColor: fg,
      fillOpacity: 0.15,
      weight: 2,
    },
    pointToLayer: (_feature: any, latlng: any) =>
      L.circleMarker(latlng, {
        radius: 6,
        color: fg,
        fillColor: fg,
        fillOpacity: 0.4,
      }),
  })
  layer.addTo(map)

  try {
    map.fitBounds(layer.getBounds(), { padding: [20, 20] })
  } catch {
    map.setView([0, 0], 2)
  }

  wrapper.setAttribute('data-processed', 'true')
}

export function renderGeojson(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'geojson')
  if (!blocks.length) return

  const cdn = getCdn()
  addStylesheet(`${cdn}/dist/js/leaflet/leaflet.css`, 'vditorLeafletCss')
  addScript(`${cdn}/dist/js/leaflet/leaflet.js`, 'vditorLeafletScript').then(
    () => {
      if (!window.L) return
      blocks.forEach(({ wrapper, code }) => {
        try {
          const data = JSON.parse(code)
          initLeafletMap(wrapper, data)
        } catch {
          // Invalid JSON — leave source visible
        }
      })
    },
  )
}

export function renderTopojson(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'topojson')
  if (!blocks.length) return

  const cdn = getCdn()
  addStylesheet(`${cdn}/dist/js/leaflet/leaflet.css`, 'vditorLeafletCss')
  Promise.all([
    addScript(`${cdn}/dist/js/leaflet/leaflet.js`, 'vditorLeafletScript'),
    addScript(
      `${cdn}/dist/js/topojson/topojson-client.min.js`,
      'vditorTopojsonScript',
    ),
  ]).then(() => {
    if (!window.L || !window.topojson) return
    blocks.forEach(({ wrapper, code }) => {
      try {
        const topo = JSON.parse(code)
        const firstObj = Object.values(topo.objects)[0]
        const geojson = window.topojson!.feature(topo, firstObj)
        initLeafletMap(wrapper, geojson)
      } catch {
        // Invalid JSON or conversion error — leave source visible
      }
    })
  })
}

export function reRenderGeojson(root?: ParentNode): void {
  const container = root ?? document
  for (const pane of Array.from(
    container.querySelectorAll<HTMLElement>(PANE_SEL),
  )) {
    for (const el of Array.from(
      pane.querySelectorAll<HTMLElement>(
        'code.language-geojson[data-processed], div.language-geojson[data-processed]',
      ),
    )) {
      el.removeAttribute('data-processed')
      el.innerHTML = ''
    }
  }
  renderGeojson(container)
}

export function reRenderTopojson(root?: ParentNode): void {
  const container = root ?? document
  for (const pane of Array.from(
    container.querySelectorAll<HTMLElement>(PANE_SEL),
  )) {
    for (const el of Array.from(
      pane.querySelectorAll<HTMLElement>(
        'code.language-topojson[data-processed], div.language-topojson[data-processed]',
      ),
    )) {
      el.removeAttribute('data-processed')
      el.innerHTML = ''
    }
  }
  renderTopojson(container)
}

// --- Vega / Vega-Lite ---

// Strip remote data sources for offline rendering + security. Vega/Vega-Lite load external data via a
// `url` on a `data` object — at the top level, inside `data: [...]` arrays, or nested in layers /
// transforms / lookups. Only inline `data.values` works offline, and a remote fetch is a tracking /
// exfiltration channel (same policy as image.allowRemoteImages). CSP already blocks the request; this
// recursively deletes EVERY `url` so no spec even ATTEMPTS a fetch (no failed-fetch error; defense in
// depth). Mutates in place — the caller passes a freshly JSON.parsed spec — and returns it for chaining.
// `$schema` (its key isn't `url`) and inline `values` are untouched.
export function stripRemoteData<T>(spec: T): T {
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item)
    } else if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      if (typeof obj.url === 'string') delete obj.url
      for (const k of Object.keys(obj)) walk(obj[k])
    }
  }
  walk(spec)
  return spec
}

function renderVegaBlock(
  blocks: { wrapper: HTMLElement; code: string }[],
): void {
  const ve = window.vegaEmbed
  if (!ve) return

  blocks.forEach(({ wrapper, code }) => {
    const fg = getComputedStyle(wrapper).color || '#333'
    // On a JSON parse error OR a failed embed the onError callback shows the shared themed error box
    // (task 178; was: source cleared first, so a bad spec blanked the block).
    void faithfulRender(
      wrapper,
      'vega',
      async (stage) => {
        // Offline/security: only inline data.values renders; stripRemoteData recursively removes any
        // remote `url` (top-level, data arrays, nested layers/transforms) so nothing fetches.
        const spec = stripRemoteData(JSON.parse(code))
        const div = document.createElement('div')
        stage.appendChild(div)
        await ve(div, spec, {
          renderer: 'svg',
          actions: false,
          config: {
            background: 'transparent',
            axis: {
              labelColor: fg,
              titleColor: fg,
              tickColor: fg,
              domainColor: fg,
              gridColor: fg,
              gridOpacity: 0.15,
            },
            legend: { labelColor: fg, titleColor: fg },
            title: { color: fg },
            view: { stroke: 'transparent' },
          },
        })
      },
      (w, err) => renderDiagramError(w, 'vega', err),
    )
  })
}

export function renderVega(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'vega')
  if (!blocks.length) return

  const cdn = getCdn()
  addScript(`${cdn}/dist/js/vega/vega-embed.min.js`, 'vditorVegaScript').then(
    () => {
      renderVegaBlock(blocks)
    },
  )
}

export function renderVegaLite(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'vega-lite')
  if (!blocks.length) return

  const cdn = getCdn()
  addScript(`${cdn}/dist/js/vega/vega-embed.min.js`, 'vditorVegaScript').then(
    () => {
      renderVegaBlock(blocks)
    },
  )
}

export function reRenderVega(root?: ParentNode): void {
  const container = root ?? document
  for (const pane of Array.from(
    container.querySelectorAll<HTMLElement>(PANE_SEL),
  )) {
    for (const el of Array.from(
      pane.querySelectorAll<HTMLElement>(
        'code.language-vega[data-processed], div.language-vega[data-processed],' +
          'code.language-vega-lite[data-processed], div.language-vega-lite[data-processed]',
      ),
    )) {
      el.removeAttribute('data-processed')
      el.removeAttribute('data-vega-error')
      el.innerHTML = ''
    }
  }
  renderVega(container)
  renderVegaLite(container)
}

// --- STL 3D models (three.js) ---

// A shaded 3D solid can't follow the theme foreground (currentColor) the way our line-art SVG
// diagrams do: three.js lighting MULTIPLIES the base colour, so a near-black foreground — every light
// content theme, e.g. github-light — collapses the model into an all-black, formless blob (reported
// bug). Use a fixed, theme-INDEPENDENT neutral mid-grey instead; the directional lights then render
// clear 3D shading on BOTH light and dark backgrounds. Kept mid-tone (luminance ~0.35) so neither the
// lit nor the shadowed faces clip to white/black. Exported + asserted in stl-material.test.ts.
export const STL_MATERIAL_COLOR = '#9aa0a6'

function initStlViewer(wrapper: HTMLElement, stlText: string): void {
  const T = window.__threeSTL
  if (!T) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'width:100%;height:300px;display:block;background:transparent'
  wrapper.innerHTML = ''
  wrapper.appendChild(canvas)

  const w = canvas.clientWidth || 400
  const h = canvas.clientHeight || 300

  const scene = new T.Scene()
  const camera = new T.PerspectiveCamera(50, w / h, 0.1, 10000)
  scene.add(new T.AmbientLight(0x666666))
  const keyLight = new T.DirectionalLight(0xffffff, 1.2)
  keyLight.position.set(1, 2, 1.5)
  scene.add(keyLight)
  const fillLight = new T.DirectionalLight(0xffffff, 0.4)
  fillLight.position.set(-1, -0.5, -1)
  scene.add(fillLight)

  const geom = new T.STLLoader().parse(stlText)
  geom.computeVertexNormals()
  // Theme-independent neutral material (see STL_MATERIAL_COLOR) — NOT the wrapper's foreground, which
  // turned the model all-black on every light theme. data-stl-material records the applied colour so
  // the real-VS-Code e2e can verify the fix without a flaky WebGL pixel read-back.
  const mat = new T.MeshPhongMaterial({
    color: new T.Color(STL_MATERIAL_COLOR),
    shininess: 60,
    specular: new T.Color(0x444444),
  })
  canvas.dataset.stlMaterial = STL_MATERIAL_COLOR
  const mesh = new T.Mesh(geom, mat)
  scene.add(mesh)

  const box = new T.Box3().setFromObject(mesh)
  const center = box.getCenter(new T.Vector3())
  mesh.position.sub(center)
  const size = box.getSize(new T.Vector3()).length()
  // Offset camera for a 3/4 view so multiple faces are visible with shading
  camera.position.set(size * 0.8, size * 0.6, size * 1.2)

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // Ctrl-to-interact: orbit/zoom only with Ctrl held (plain scroll = page scroll)
  const controls = new T.OrbitControls(camera, canvas)
  controls.enableZoom = false
  controls.enableRotate = false
  controls.enablePan = false
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.ctrlKey) {
      controls.enableRotate = true
      controls.enablePan = true
    }
  })
  canvas.addEventListener('mouseup', () => {
    controls.enableRotate = false
    controls.enablePan = false
  })
  canvas.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.ctrlKey) {
        controls.enableZoom = true
        e.preventDefault()
      } else {
        controls.enableZoom = false
      }
    },
    { passive: false },
  )

  function animate() {
    if (!canvas.isConnected) {
      renderer.dispose()
      return
    }
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  wrapper.setAttribute('data-processed', 'true')
}

export function renderStl(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'stl')
  if (!blocks.length) return

  const cdn = getCdn()
  addScript(
    `${cdn}/dist/js/threejs/three-stl.min.js`,
    'vditorThreeStlScript',
  ).then(() => {
    if (!window.__threeSTL) return
    blocks.forEach(({ wrapper, code }) => {
      try {
        initStlViewer(wrapper, code)
      } catch (error) {
        // Bad ASCII STL → the shared themed error box (task 178; was: silent, left blank). initStlViewer
        // sets data-processed only on success, so set it here too: marks the box terminal so the observer
        // doesn't re-find + re-render the wrapper into a loop (findBlocks skips [data-processed="true"]).
        renderDiagramError(wrapper, 'stl', error)
        wrapper.setAttribute('data-processed', 'true')
      }
    })
  })
}

export function reRenderStl(root?: ParentNode): void {
  const container = root ?? document
  for (const pane of Array.from(
    container.querySelectorAll<HTMLElement>(PANE_SEL),
  )) {
    for (const el of Array.from(
      pane.querySelectorAll<HTMLElement>(
        'code.language-stl[data-processed], div.language-stl[data-processed]',
      ),
    )) {
      el.removeAttribute('data-processed')
      el.innerHTML = ''
    }
  }
  renderStl(container)
}

// --- Observer: render all custom diagrams on DOM mutations ---

/** The set of `language-<lang>` slugs with an UN-rendered block under `root`. A deliberate SUPERSET
 *  of findBlocks' selector — no edit-surface `.closest(...)` filter — so it drives which engines
 *  observeCustomDiagrams invokes (task 164 §5) WITHOUT risking a dropped diagram: a false positive
 *  (a lang present only in an editable marker) just degrades to a renderer no-op (findBlocks skips
 *  the marker), whereas a false negative would silently drop a real diagram. */
export function presentCustomLangs(root: ParentNode): Set<string> {
  const present = new Set<string>()
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>(
      'code[class*="language-"]:not([data-processed="true"]), div[class*="language-"]:not([data-processed="true"])',
    ),
  )) {
    for (const cls of Array.from(el.classList)) {
      if (cls.startsWith('language-')) {
        present.add(cls.slice('language-'.length))
        break
      }
    }
  }
  return present
}

export function observeCustomDiagrams(
  appEl: HTMLElement | null | undefined,
): () => void {
  if (!appEl) return () => {}
  // lang-tagged so the pre-scan in run() can invoke + yield a frame for ONLY the engines a doc
  // actually uses (task 164 §5), instead of walking all 8 every sweep.
  const renderers: { lang: string; render: (root: ParentNode) => void }[] = [
    { lang: 'wavedrom', render: renderWavedrom },
    { lang: 'nomnoml', render: renderNomnoml },
    { lang: 'geojson', render: renderGeojson },
    { lang: 'topojson', render: renderTopojson },
    { lang: 'vega', render: renderVega },
    { lang: 'vega-lite', render: renderVegaLite },
    { lang: 'stl', render: renderStl },
    { lang: 'd2', render: renderD2 },
  ]
  let raf = 0
  let running = false
  let dirty = false
  // Render each custom-diagram engine, YIELDING a frame between them, so the burst doesn't monopolise
  // the single main thread. Measured (task 145 follow-up, perf-timeline.spec): when all engines ran in
  // one synchronous rAF, hljs execution + Vditor's highlightRender (code colouring) were starved until
  // every diagram finished (~4.8 s on a 15-diagram doc). Yielding lets the colouring + paint interleave.
  // Idempotent (each renderer skips data-processed); re-entrant-safe via running/dirty so mutations
  // arriving mid-pass trigger exactly one more pass, not overlapping ones.
  const run = () => {
    if (running) {
      dirty = true
      return
    }
    void (async () => {
      running = true
      do {
        dirty = false
        // Pre-scan ONCE which custom langs actually have an un-rendered block, then invoke + yield a
        // frame ONLY for those (task 164 §5). Before this, all 8 renderers yielded a frame even with
        // zero blocks — a D2-only doc's first paint waited behind ~7 empty-renderer frame boundaries,
        // and a no-diagram doc churned 8 querySelectorAlls per sweep. Empty engines are now a
        // synchronous skip (no yield). Re-computed each do-while pass (data-processed shrinks it).
        const present = presentCustomLangs(appEl)
        for (const { lang, render } of renderers) {
          if (!present.has(lang)) continue
          render(appEl)
          await new Promise<void>((r) => requestAnimationFrame(() => r()))
        }
      } while (dirty)
      running = false
    })()
  }
  // Check isTyping in schedule() (it runs on EVERY mutation, regardless of run()'s running/dirty state)
  // so a burst is always deferred — even if an OPEN-path render is still looping. While the user types
  // in a diagram's source, defer the whole pass to the edit-activity settle: the cached overlay keeps
  // the last SVG visible meanwhile (task 161 step 1). On settle, prep canvas previews (cover mode),
  // render the latest source, and start the swap-when-ready reveal watcher. The OPEN path / theme
  // re-renders aren't typing → they render promptly via the rAF path below.
  const schedule = () => {
    if (isTyping()) {
      deferUntilSettle('custom-diagrams', () => {
        beginSettleRender()
        run()
        scheduleReveal()
      })
      return
    }
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0
        run()
      })
    }
  }
  const obs = new MutationObserver(schedule)
  obs.observe(appEl, { childList: true, subtree: true })
  schedule()
  return () => {
    obs.disconnect()
    if (raf) cancelAnimationFrame(raf)
    running = false
  }
}
