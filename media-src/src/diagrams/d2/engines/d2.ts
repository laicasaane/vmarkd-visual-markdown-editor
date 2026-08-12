// D2 — task 409, split out of custom-diagrams.ts's god-module into its own engine file (the
// deferred sixth migration: WASM compile + its own code-split render/layout bundle + a private
// Lute instance for |md| labels + a bespoke reset that deliberately does NOT go through
// resetCustomBlocks — see reRenderD2's own comment for why). Compile-only WASM (compileD2) ->
// graph JSON -> dagre+Canvas SVG (renderD2Graph), with a LOUD fallback for shapes dagre can't
// faithfully render (unsupportedReason). Themed via currentColor (same as graphviz/plantuml).
import { compileD2, type D2Graph } from '../d2-wasm'
import { logToHost } from '../../../util/webview-log'
// The D2 render+layout engine (renderD2Graph / renderD2GraphElk / canvasMeasure / unsupportedReason /
// d2Theme) is code-split into media/vditor/dist/js/d2/d2-main.js (task 165) — it pulls dagre + our
// ELK/refine/astar cluster (~109 KB) that only ever runs for `.language-d2`, so keeping it out of the
// eager main.js removes that parse + top-level eval from startup for every non-D2 doc. renderD2()
// loads the bundle on demand and reads the values off `window.__vmarkdD2` (typed below); we do NOT
// static-import those values here (that would bundle dagre back into main.js).
import { renderDiagramError } from '../../../diagram-kit/diagram-error'
import { loadScript } from '../../../util/load-script'
import { getD2Config } from '../../../diagram-kit/d2-config'
import { findBlocks, getCdn, PANE_SEL } from '../../../diagram-kit/diagram-dom'

declare const window: Window & {
  // D2 render+layout bridge exposed by the lazy d2-main.js bundle (d2-entry.ts, task 165).
  // `typeof import(...)` keeps these TYPE-ONLY, so tsc/esbuild erase the reference and the
  // d2-render/dagre code never lands in main.js — the runtime values arrive via the fetched bundle.
  __vmarkdD2?: {
    renderD2Graph: typeof import('../d2-render').renderD2Graph
    renderD2GraphElk: typeof import('../elk-layout').renderD2GraphElk
    canvasMeasure: typeof import('../d2-render').canvasMeasure
    unsupportedReason: typeof import('../d2-render').unsupportedReason
    d2Theme: typeof import('../d2-render').d2Theme
    makeSketch: typeof import('../d2-sketch').makeSketch
  }
}

// Shrink-to-fit sizing only. This used to also rewrite baked `#000`/`black` ink to `currentColor`,
// carried over from when D2 SVGs were themed by a DOM post-pass. `d2-render.ts` now paints every
// shape and label through `paintAttrs`/`resolvePaint`/`textAttrs` off the `D2Style` tokens, so it
// emits no black literal at all (verified: no `#000`/`black` anywhere in d2-render/d2-sketch/
// elk-layout/d2-refine) — the walks matched nothing, and left a stale second answer to "how is a D2
// SVG coloured" next to the real one. Colour belongs in the generator, not here.
function themeSvg(svg: SVGElement): void {
  svg.style.maxWidth = '100%'
  svg.style.height = 'auto'
}

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
// concurrently, and loadScript's own in-flight dedup only shares the SCRIPT LOAD — this promise
// additionally caches the READ of `window.__vmarkdD2` off it, so blocks 2..N never re-check the
// global after their own resolve. (This is also why the pre-loadScript private `addScript` — whose
// naive getElementById dedup resolved the moment the <script> tag EXISTED, before it had executed —
// was unsafe here: task 407 removed it repo-wide.) On a failed load the cache is cleared so a later
// render can retry.
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

// Task 160 — a D2 code shape is not a Markdown fence, so html-builder's document-level fence scan
// cannot know it needs highlight.js. Wait for the same Vditor scripts here before emitting token
// tspans; the ids make this share Vditor's eager/in-flight load rather than downloading another copy.
async function ensureD2CodeHighlight(
  cdn: string,
  graph: D2Graph,
): Promise<void> {
  if (!graph.shapes.some((s) => s.shape === 'code' && s.language)) return
  if ((window as unknown as { hljs?: unknown }).hljs) return
  const base = `${cdn}/dist/js/highlight.js`
  try {
    await loadScript(`${base}/highlight.min.js?v=11.7.0`, 'vditorHljsScript')
    await loadScript(
      `${base}/third-languages.js?v=1.0.1`,
      'vditorHljsThirdScript',
    )
  } catch {
    // Preserve the existing monochrome code path if highlight.js cannot load.
  }
}

// How many D2 blocks have been handed to the engine this session (see renderD2). Exposed on window
// so a real-VS-Code spec can assert the per-flip render count instead of inferring it from pixels.
const d2RenderStats = { compiles: 0 }
;(
  window as unknown as { __vmarkdD2RenderStats?: typeof d2RenderStats }
).__vmarkdD2RenderStats = d2RenderStats

// Task 131 — D2 composes diagrams from sibling files (`...@partials/header` spread, `k: @file`
// value import). We compile a SINGLE fenced block through a compile-only WASM with no filesystem
// behind it, so the target can never resolve: d2 fails with its own file-not-found text and the
// block falls back to raw source. It already failed SAFE — it just never said WHY, which reads as
// "the renderer is broken" rather than "this construct can't work here". Detect it in the SOURCE,
// before compiling, and route it through the same LOUD fallback the other unsupported constructs
// use.
//
// Conservative on purpose, because a false positive would replace a WORKING diagram with a note:
// - a spread import is a line that STARTS with `...@`
// - a value import is a line whose value is EXACTLY `@path` and nothing else, so `a: user@x.com`
//   (an @ inside a word) and `label: see @bob later` (an @ mid-value) are both left alone
// - `#` comments are stripped first, so a commented-out example never triggers it
export function d2ImportReason(source: string): string | null {
  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    if (line.startsWith('...@')) return 'imports (...@file spread)'
    if (/^[^:]+:\s*@\S+$/.test(line)) return 'imports (key: @file)'
  }
  return null
}

// The LOUD fallback (faithful-by-construction, NON-NEGOTIABLE): raw source + a note saying what is
// unsupported, NEVER a partial or plausible-but-wrong picture. Shared by the compiled-graph check
// (unsupportedReason) and the source-level import check above so the two can't drift apart.
function renderD2Unsupported(
  wrapper: HTMLElement,
  code: string,
  reason: string,
  hint?: string,
): void {
  wrapper.innerHTML = ''
  const note = document.createElement('div')
  note.className = 'd2-unsupported-note'
  const hintSuffix = hint ? ` (${hint})` : ''
  note.textContent = `d2: ${reason} not supported — showing source${hintSuffix}`
  const pre = document.createElement('pre')
  pre.className = 'language-d2-unsupported'
  pre.textContent = code
  wrapper.append(note, pre)
}

export function renderD2(root?: ParentNode): void {
  const container = root ?? document
  // findBlocks already skips IR/WYSIWYG edit-surface markers (.vditor-ir__marker--pre,
  // .vditor-wysiwyg__pre) and already-[data-processed] blocks — D2 inherits that guard.
  const blocks = findBlocks(container, 'd2')
  if (!blocks.length) return

  const cdn = getCdn()
  // Task 411 — count the blocks this pass actually hands to the engine (a WASM compile + layout
  // each, ~365 ms measured). The double-fire this task removed was invisible from the DOM: both
  // fires produced the same SVG, so only a counter can tell "rendered once" from "rendered twice,
  // second one overwriting the first". Same posture as __vmarkdCacheResolveStats (task 433): a
  // measured claim instead of an assumed one, no cost on the render path.
  d2RenderStats.compiles += blocks.length
  for (const { wrapper, code } of blocks) {
    // D2 is ASYNC (WASM boot + compile), unlike the synchronous renderers above. Mark the
    // block processed UP-FRONT so a re-firing observer can't double-render it while
    // compileD2 is pending (the sync renderers set data-processed at the end; D2 cannot).
    wrapper.setAttribute('data-processed', 'true')
    // Task 131 — check the SOURCE before compiling: an unresolvable import makes d2 fail with a
    // file-not-found message that says nothing about why it can't work here. Reported as a
    // dedicated attribute (not data-d2-error) — this is a stated non-support, not a failure.
    const importReason = d2ImportReason(code)
    if (importReason) {
      wrapper.setAttribute('data-d2-unsupported', 'import')
      renderD2Unsupported(
        wrapper,
        code,
        importReason,
        'inline the imported content',
      )
      continue
    }
    compileD2(cdn, code)
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: compile→layout(engine switch)→render chain with per-stage error handling; pre-existing (task 469 baseline)
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
          // Single enforcement point for unsupportedReason — same loud fallback as the
          // source-level import check above.
          renderD2Unsupported(wrapper, code, reason)
          return
        }
        // Task 154: render + measure |md| labels BEFORE layout, so ELK/dagre size those
        // nodes to the formatted HTML (not the raw md lines).
        await enrichMarkdownLabels(res, wrapper)
        await ensureD2CodeHighlight(cdn, res)
        // Layout engine from the `vmarkd.diagram.d2.layout` setting (window global set by main.ts).
        // ELK gives orthogonal routing; it lazy-loads a separate main-thread bundle (elk-main.js,
        // ~1.4 MB) and returns null if it can't load/lay out, so we fall back to dagre.
        // Render config from the typed owner (d2-config.ts; set by main.ts). 'auto' theme pairs the
        // palette to the content theme + editor mode; named themes paint their own palette (+bg for
        // d2-*); 'mono'/undefined → monochrome currentColor that follows the editor.
        const cfg = getD2Config()
        const style = d2.d2Theme(cfg.theme, cfg.contentTheme, cfg.mode)
        // Hand-drawn "sketch" emit (task 120, vmarkd.diagram.d2.sketch): build the injected rough.js
        // emitter once and thread it into whichever layout engine renders. undefined = crisp (default).
        const sketch = cfg.sketch ? d2.makeSketch() : undefined
        let svgStr: string | null = null
        let engine = 'dagre'
        // Three engines (vmarkd.diagram.d2.layout): 'vmarkd' = ELK + our refinement pipeline (default),
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
  // NOT resetCustomBlocks (task 400 explicitly left D2 out of that consolidation: it's WASM/
  // worker-backed, same as PlantUML/Graphviz/mermaid) — this loop is D2's own, kept exactly as
  // it was before the task-409 file split. Don't fold it into resetCustomBlocks in a later pass
  // without re-checking task 400's reasoning for excluding it.
  //
  // Task 412 follow-up — a combined `:is(pane) el` selector, deliberately NOT "find panes as
  // descendants of `container`, then query within each pane": when `container` is a NARROWED
  // per-diagram scope (task 412's blockScopeOf), its `.vditor-preview` fallback is the element's own
  // immediate parent, which doesn't itself carry a preview-pane class — the real `.vditor-preview`
  // ancestor sits further up, OUTSIDE `container`. "Panes as descendants" then finds nothing and
  // silently skips the reset (the block stays `data-processed`, so the `renderD2` call below skips
  // it too — a Preview-mode D2 diagram redrawn to zero blocks). A descendant-combinator selector is
  // evaluated against each candidate's FULL ancestor chain, not just ancestors inside `container`, so
  // it still finds the target correctly — see diagram-surfaces.ts's `renderedDiagramTargets` for the
  // same fix applied where the pane element itself (not just the target) is also needed.
  const renderedSel = `:is(${PANE_SEL}) :is(code.language-d2[data-processed], div.language-d2[data-processed])`
  for (const el of Array.from(
    container.querySelectorAll<HTMLElement>(renderedSel),
  )) {
    el.removeAttribute('data-processed')
    el.removeAttribute('data-d2-error')
    el.innerHTML = ''
  }
  renderD2(container)
}
