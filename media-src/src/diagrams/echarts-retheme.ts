// Re-render already-drawn ECharts charts in the current theme — task 90 (mirrors task 59 for
// mermaid). Vditor renders each chart once (`data-processed="true"`) and never re-runs it, so a
// live content-/VS Code-theme flip leaves charts in the stale palette until reopen. The theme is
// fixed at `echarts.init(el, theme)` time, so re-theming means dispose + re-init.
//
// We re-init SYNCHRONOUSLY here rather than delegating to Vditor's `chartRender` (which loads the
// script via an async `addScript().then`): on rapid theme switches the deferred callbacks raced
// and the `data-processed` guard let a stale-theme render win, and a chart could end up blank.
// echarts is already loaded (the charts exist), so we can init directly. We also capture the
// container's size BEFORE dispose and pass it back to `init` — disposing clears the inline size
// echarts had set, and if a CSS theme swap is mid-reflow the bare container can measure 0×0,
// which makes echarts render an empty chart (the "stops working after a few switches" report).
// The chart's JSON source is read from `data-code`, stamped on the live node by chartRender.ts's
// esbuild patch (`patchEchartsDataCode`, task 454) — falling back to the sibling editable `<code
// class="language-echarts">` (the marker pre), like reRenderMermaid, for documents rendered before
// that stamp shipped. `data-code` is required in `.vditor-preview` (sv/full Preview): unlike
// IR/WYSIWYG, that surface has no sibling editable copy to fall back to at all (see
// `diagram-surfaces.ts`'s `nativeSourceForLive`), and `echarts.init` destroys the live node's own
// text on render, so without the stamp the source is simply gone. Parsed with Vditor's own
// looseJsonParse for parity.
//
// Task 466 — the per-`live` resolution itself (prefer `data-code`, fall back to the sibling
// editable marker) now lives in `diagram-surfaces.ts`'s `nativeSourceForLive`, shared with every
// other native engine's re-render path instead of being re-derived here under a different name
// (this file used to carry its own `resolveEchartsSource`, identical but for the hardcoded
// `'echarts'` lang).
import { clamp } from '../../../src/shared/clamp'
import { looseJsonParse } from 'vditor/src/ts/util/function'
import {
  nativeSourceForLive,
  renderedDiagramTargets,
} from '../diagram-kit/diagram-surfaces'

export function reRenderEcharts(
  win: any,
  editorEl: HTMLElement | undefined,
  mode: 'dark' | 'light',
): void {
  const ec = win.echarts
  if (!editorEl || !ec || typeof ec.init !== 'function') return
  const name = win.__vmdeEchartsResolve
    ? win.__vmdeEchartsResolve(ec)
    : mode === 'dark'
      ? 'dark'
      : undefined

  // Task 412 follow-up — was "find PANES as descendants of editorEl (2-selector, IR/WYSIWYG only),
  // then query the live chart within each pane". Same confirmed-HIGH bug as plantuml-retheme.ts's
  // reRenderLang: never matched `.vditor-preview`, and "panes as descendants" finds nothing when
  // editorEl is task 412's own NARROWED per-diagram scope. `renderedDiagramTargets` finds the live
  // node directly via a selector evaluated against its full ancestor chain, correct in both cases.
  const liveNodes = renderedDiagramTargets(editorEl, 'echarts')
  for (const live of liveNodes) {
    // Per-`live` resolution is the trap: see `nativeSourceForLive`'s own comment for why a
    // pane-wide query must never be used here instead.
    const source = nativeSourceForLive(live, 'echarts')
    if (source == null || !source.trim()) continue

    // Capture the rendered size before dispose clears echarts' inline width/height.
    const w = live.clientWidth
    const h = live.clientHeight
    try {
      ec.getInstanceByDom?.(live)?.dispose()
      // looseJsonParse is fire-and-forget (it may resolve async for ${} expressions); for plain
      // JSON it returns synchronously. Guard parse + render so one bad chart can't break the rest.
      Promise.resolve(looseJsonParse(source)).then(
        (option: unknown) => {
          if (!option) return
          const inst = ec.init(
            live,
            name,
            w > 0 && h > 0 ? { width: w, height: h } : undefined,
          )
          // animation:false → no entry animation on a theme re-render (matches chartRender's patch).
          inst.setOption(
            Object.assign({}, option as object, { animation: false }),
          )
          live.setAttribute('data-processed', 'true')
        },
        () => {
          /* leave the (now disposed) chart; a bad source is the user's to fix */
        },
      )
    } catch {
      /* defensive: never let a re-theme throw into the theme-change handler */
    }
  }

  reconstructMindmaps(win, editorEl, name, true) // theme changed → force rebuild
}

/**
 * Re-fit mindmaps to their content height as they render/rebuild (covers the INITIAL render, which
 * Vditor draws at a tall stock canvas → big vertical gaps). rAF-debounced; idempotent via the
 * per-element width+height+theme signature, so our own re-init doesn't loop. Returns a disposer.
 */
export function observeMindmaps(
  win: any,
  appEl: HTMLElement | null | undefined,
): () => void {
  // No editor root mounted yet — nothing to observe; hand back a no-op
  // disposer so callers can always call the returned teardown unconditionally.
  if (!appEl)
    return () => {
      /* no-op disposer */
    }
  let raf = 0
  const run = () => {
    raf = 0
    const ec = win.echarts
    const name = ec && win.__vmdeEchartsResolve?.(ec)
    reconstructMindmaps(win, appEl, name)
  }
  const obs = new MutationObserver(() => {
    if (!raf) raf = requestAnimationFrame(run)
  })
  obs.observe(appEl, { childList: true, subtree: true })
  if (!raf) raf = requestAnimationFrame(run)
  return () => {
    obs.disconnect()
    if (raf) cancelAnimationFrame(raf)
  }
}

// Re-fit ECharts CHARTS to their container width by RECONSTRUCTING them from source — the responsive
// counterpart to reRenderEcharts (theme). Why reconstruct instead of `instance.resize()`: the chart
// Vditor renders has an ORPHANED instance — `getInstanceByDom(el)` returns null (Vditor re-creates the
// preview element after init, leaving a dead `_echarts_instance_` attr), so `resize()` is a silent
// no-op. That's why the old timer/window-resize `resize()` path never actually resized anything
// ("czasami pierwszy render za szeroki", fixes didn't work). Re-init from the source JSON at the
// CURRENT clientWidth instead — proven in the real editor to fix a stuck 545px canvas → 133px and to
// re-bind a retrievable instance. Source = the sibling editable `<code class="language-echarts">`
// (outside the preview pane), parsed with Vditor's looseJsonParse like reRenderEcharts.
export function reconstructCharts(win: any, root: ParentNode): void {
  const ec = win.echarts
  if (!ec || typeof ec.init !== 'function') return
  const name = win.__vmdeEchartsResolve
    ? win.__vmdeEchartsResolve(ec)
    : undefined
  // Task 454 — was a PANE-first scan restricted to `.vditor-ir__preview, .vditor-wysiwyg__preview`
  // (`pane.querySelector('.language-echarts')`, first match in the pane): that selector list never
  // included `.vditor-preview` at all, so a chart in the sv/full Preview surface was NEVER resized
  // on window resize — dead for that surface, not merely wrong-sourced. `renderedDiagramTargets`
  // covers all three preview surfaces and yields each live node directly, so iterating per-`live`
  // below (same shape as `reRenderEcharts` above) also sidesteps the first-match-in-pane hazard for
  // free, same as that function.
  const liveNodes = renderedDiagramTargets(root, 'echarts')
  for (const live of liveNodes) {
    const w = live.clientWidth
    // Skip HIDDEN containers (clientWidth 0 — inactive pane / Preview overlay up). Re-initing into a
    // 0-width box renders an empty chart that would stay blank until the next width change.
    if (w === 0) continue
    // DEDUPE: skip if the canvas already fits the container (within 2px). This is what makes a mode
    // switch (width unchanged, or the pane just re-shown at its old width) NOT reconstruct → no
    // "tekst w tle" flicker — and prevents the ResizeObserver from looping. Reconstruct fires ONLY
    // when the canvas genuinely doesn't fit (the first-render race, or a real container resize).
    const canvas = live.querySelector('canvas')
    if (canvas && Math.abs(canvas.getBoundingClientRect().width - w) <= 2)
      continue
    // Same resolution + same per-`live` trap as `reRenderEcharts` — see `nativeSourceForLive`.
    const source = nativeSourceForLive(live, 'echarts')
    if (source == null || !source.trim()) continue
    const h = live.clientHeight || 420
    try {
      ec.getInstanceByDom?.(live)?.dispose()
      Promise.resolve(looseJsonParse(source)).then(
        (option: unknown) => {
          if (!option) return
          const inst = ec.init(live, name, { width: w, height: h })
          // animation:false → no entry animation when re-fitting (matches chartRender's patch).
          inst.setOption(
            Object.assign({}, option as object, { animation: false }),
          )
          live.setAttribute('data-processed', 'true')
        },
        () => {
          /* a bad source is the user's to fix; leave the (disposed) chart */
        },
      )
    } catch {
      /* defensive: a single chart must never throw into the resize handler */
    }
  }
}

// mindmap (also an ECharts instance — a `tree`) CANNOT be resized/re-themed via a live instance:
//   1. In the IR/WYSIWYG preview pane the rendered `.language-mindmap` node carries a canvas but
//      NO retrievable echarts instance (getInstanceByDom returns null — the painted node is a
//      detached snapshot, not the live-bound element), so `getInstanceByDom(el).resize()` (the chart
//      path) is a no-op → it neither re-themes NOR resizes ("background doesn't follow the theme",
//      and "nie zmniejsza się przy zwężaniu okna"). The chart path works because it RECONSTRUCTS.
//   2. getOption().backgroundColor carries the OLD theme's background, so re-`setOption`ing it
//      would re-pin the stale background even when an instance exists.
// So reconstruct the mindmap from source: read the tree JSON from `data-code` (what Vditor's
// mindmapRender itself parses — `decodeURIComponent` → JSON), dispose + clear any orphaned canvas,
// re-init with the theme NAME (drives backgroundColor) AT THE CURRENT CONTAINER SIZE (so it follows
// a window resize), and apply explicit tree colours (ECharts' `tree` ignores the categorical palette)
// from window.__vmdeMindmapStyle (installed by echarts-apply.ts), with the mindmapRender fallback.
// Shared by the theme-change path (reRenderEcharts) AND the window-resize handler (echarts-fit.ts).
/** Count leaf nodes of an ECharts-tree data object (nodes with no children). */
function countLeaves(node: unknown): number {
  const kids = (node as { children?: unknown[] } | null)?.children
  if (!Array.isArray(kids) || kids.length === 0) return 1
  let n = 0
  for (const k of kids) n += countLeaves(k)
  return n
}

/** Height to give a mindmap canvas: tall enough to spread its leaves (~one row each) without the
 *  big empty top/bottom gaps a fixed/over-tall canvas leaves around a short wide tree. */
function mindmapHeight(data: unknown): number {
  const h = countLeaves(data) * 56 + 48
  return clamp(h, 140, 900)
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rebuilds every rendered mindmap instance from data-code, with hidden-container/style/force-vs-name branches; pre-existing (task 469 baseline)
export function reconstructMindmaps(
  win: any,
  root: ParentNode,
  name: string | undefined,
  force = false,
): void {
  const ec = win.echarts
  if (!ec || typeof ec.init !== 'function') return
  const mmStyle = (win.__vmdeMindmapStyle as
    | {
        node: string
        label: string
        labelBg: string
        labelBorder: string
        line: string
      }
    | undefined) ?? {
    node: '#4285f4',
    label: '#586069',
    labelBg: '#f6f8fa',
    labelBorder: '#d1d5da',
    line: '#d1d5da',
  }
  // Scope to RENDERED mindmaps only — those inside a preview pane. The editable source
  // `<code class="language-mindmap">` (in `.vditor-ir__marker--pre` / `.vditor-wysiwyg__pre`)
  // also carries a `data-code`, so a bare `.language-mindmap` sweep would render a chart INTO the
  // editing surface (Vditor's own mindmapRender guards the same parents). Preview-scoping excludes
  // it. Shares diagram-surfaces.ts's `renderedDiagramTargets` with every other engine's discovery
  // (task 412 follow-up) — this selector was already correctly ancestor-based (not "panes as
  // descendants"), so it never had the narrowed-scope bug, but routes through the same helper now
  // for a single source of truth on "where can a rendered diagram live".
  const mmNodes = renderedDiagramTargets(root, 'mindmap')
  for (const live of mmNodes) {
    const code = live.getAttribute('data-code')
    if (!code) continue
    const w = live.clientWidth
    // Skip HIDDEN containers (e.g. the IR pane while the full Preview overlay is shown). Re-initing
    // into a 0-width box renders an empty chart, and on resize no event fires when it's shown again,
    // so it would stay blank (cf. echarts-fit's hidden-skip).
    if (w === 0) continue
    let data: unknown
    try {
      data = JSON.parse(decodeURIComponent(code))
    } catch {
      continue
    }
    // Height = content height (≈ one row per leaf), NOT the stock ~420px canvas, which left big
    // empty gaps above/below a short wide tree. Width follows the column (responsive).
    const h = mindmapHeight(data)
    // Idempotency: skip if already built at this width+height+theme (so our own innerHTML rewrite
    // doesn't re-trigger the observer into a loop). `force` (theme change) always rebuilds.
    const sig = `${w}x${h}|${name ?? ''}`
    if (!force && live.dataset.vmMindmap === sig) continue
    try {
      ec.getInstanceByDom?.(live)?.dispose()
      live.innerHTML = '' // drop any orphaned snapshot canvas before re-init
      live.style.height = `${h}px` // shrink the container so there's no leftover vertical gap
      live.dataset.vmMindmap = sig
      const ni = ec.init(live, name, { width: w, height: h })
      ni.setOption({
        // NOTE on the mindmap entry "grow" animation: it CANNOT be cleanly removed. ECharts `tree`
        // gates BOTH the entry animation AND the click-collapse re-render on the single `animation`
        // flag. `animation: false` stops the entry grow but BREAKS collapse — the re-render after a
        // collapse click leaves edges/labels in a tangled half-state (user-confirmed, real editor).
        // `animationDuration: 0` keeps collapse working but does NOT actually suppress the tree's
        // entry animation. So we keep `animationDuration: 0` (collapse-safe) and accept the brief
        // entry grow. Do NOT switch to `animation: false` (breaks collapse).
        animationDuration: 0,
        series: [
          {
            type: 'tree',
            data: [data],
            initialTreeDepth: -1,
            roam: true,
            symbol: (_v: number, params: { data?: { children?: unknown } }) =>
              params?.data?.children ? 'circle' : 'path://',
            itemStyle: { borderWidth: 0, color: mmStyle.node },
            label: {
              backgroundColor: mmStyle.labelBg,
              borderColor: mmStyle.labelBorder,
              borderRadius: 5,
              borderWidth: 0.5,
              color: mmStyle.label,
              lineHeight: 20,
              offset: [-5, 0],
              padding: [0, 5],
              position: 'insideRight',
            },
            lineStyle: { color: mmStyle.line, width: 1 },
            // Tighten the tree's vertical layout box (ECharts tree defaults top/bottom to 12% →
            // big empty gaps above/below the diagram). Keep left/right default for label room.
            top: 14,
            bottom: 14,
          },
        ],
        tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      })
      live.setAttribute('data-processed', 'true')
    } catch {
      /* defensive: a single mindmap must not break the caller */
    }
  }
}
