import type { VmdeConfigOptions } from '../../../src/shared/protocol'
import { engineLangs } from '../diagram-kit/engine-registry'
import {
  diagramRenderRoot,
  renderedDiagramTargets,
} from '../diagram-kit/diagram-surfaces'
import {
  applyMermaidTheme,
  mermaidInitSignature,
  resolveMermaidInit,
} from './mermaid/mermaid-theme'
import { reRenderMermaid } from './mermaid/mermaid-retheme'
import { resolveEchartsTheme } from '../../../src/shared/echarts-theme'
import { applyEchartsTheme, readVscodePalette } from './echarts-apply'
import { reRenderEcharts } from './echarts-retheme'
import { reRenderFlowchart } from './flowchart-retheme'
import {
  reRenderPlantuml,
  reRenderGraphviz,
  reRenderAbc,
} from './plantuml/plantuml-retheme'
import {
  CUSTOM_DIAGRAM_ADAPTERS,
  reRenderD2,
  reRenderVega,
} from './custom-diagrams'
import { repairSmiles } from './smiles-render'
import { rethemeCacheFirst } from './render-cache-client'
import { blockScopeOf } from '../diagram-kit/diagram-dom'
import { createViewportGate } from '../nav/viewport-gate'

/**
 * Task 436 — every re-render below goes through here: ask the render cache first, and only run the
 * live engine for what the cache did NOT take over. `rethemeCacheFirst` returns false when there is
 * nothing to reserve or the cache client isn't installed, which is what keeps this a no-op change
 * for the engines it can't serve (geojson/topojson are `cacheable: false` — a live Leaflet map, not
 * an SVG) and in unit tests that never install it.
 *
 * The blocks it reserves keep their existing `data-processed`, so the live fallback CANNOT run
 * concurrently with a pending lookup: either the cache owns them (hit → painted, miss → un-reserved
 * and re-fired at the engine) or we never handed them over and re-render right here.
 */
function cacheFirstThen(
  root: ParentNode | undefined,
  lang: string,
  live: () => void,
): void {
  if (!rethemeCacheFirst(root ?? document, [lang])) live()
}

// Live re-theme of every diagram renderer after a theme/config flip (task 152 items
// 1+3). main.ts owns the per-init state (lastInitMsg) and the code-theme applier
// (also used at init), so it injects them here once via configureDiagramRetheme —
// read at CALL time through getters because lastInitMsg changes per re-init.
interface RethemeDeps {
  getOptions: () => VmdeConfigOptions | undefined
  getCdn: () => string
  applyCodeTheme: (theme: 'dark' | 'light') => void
}
let deps: RethemeDeps = {
  getOptions: () => undefined,
  getCdn: () => '',
  applyCodeTheme: () => {
    /* default before configureDiagramRetheme wires the real implementation —
       any re-theme that fires before setup completes is a harmless no-op */
  },
}
export function configureDiagramRetheme(d: RethemeDeps): void {
  deps = d
}

// Task 412 — ECharts (unlike the mono/D2/geo engines, which bake `currentColor` and so are always
// correct-by-construction whenever their redraw actually runs) needs an EXPLICIT theme name passed
// into `ec.init()`. A deferred candidate's redraw can fire long after the flip that queued it —
// possibly after a LATER flip already changed the theme — so the callback reads this live module var
// instead of closing over the `f.theme` from whichever rethemeDiagrams() call happened to register
// it, same contract as mermaid's own `latestTheme` (mermaid-retheme.ts).
let latestEchartsMode: 'dark' | 'light' = 'light'

/** Re-evaluate every smiles preview's palette after a theme flip. The new background CSS (and the
 *  content-theme `<link>`) settles asynchronously and outside #app, so schedule a few passes across
 *  the settle; repairSmiles is idempotent per bg-darkness, so the redundant calls are cheap no-ops. */
function reThemeSmiles(): void {
  const app = document.getElementById('app')
  if (!app) return
  requestAnimationFrame(() => repairSmiles(app))
  window.setTimeout(() => repairSmiles(app), 200)
  window.setTimeout(() => repairSmiles(app), 600)
}

/** Re-render a renderer that BAKES its colours from `getComputedStyle(...).color` at draw time, once
 *  the new theme's foreground actually LANDS. Such engines (flowchart.js, vega-embed) go stale on a
 *  live flip: the content-theme `<link>` applies asynchronously and can settle LATE (>400ms), so a
 *  fixed-delay re-render bakes the OLD colour (reported: vega axis numbers/ticks keep the previous
 *  theme's colour until the file is reopened). POLL the foreground (probe = a rendered block whose
 *  computed colour mirrors what the renderer reads) for ~2s.
 *
 *  DEBOUNCED to the SETTLED colour, not fired on every intermediate value. The foreground crosses
 *  MORE THAN ONE value during the settle (the `vditor--dark` class flips first, then the content-theme
 *  `<link>` lands later), and the old code re-rendered on EACH — "cheap, the last one wins". That was
 *  fine for the light mono SVGs but re-runs the EXPENSIVE mono engines (plantuml re-preprocesses its
 *  ~2000-line stdlib per block, ~2-5s each) once PER intermediate step: measured `calls:2`,
 *  `panesReRendered:26` for 13 plantuml blocks on one workbench flip (~57s of spinner). Coalescing to
 *  a single re-render on the stable colour halves that and removes the wasted intermediate pass. A
 *  genuinely late second settle (rare) still re-fires, so correctness (final render uses the settled
 *  colour) is unchanged. `reRender` re-parses from source, so with no such block in the doc it's a no-op. */
function reThemeOnForegroundChange(
  probeSelector: string,
  reRender: (root?: HTMLElement) => void,
): void {
  let lastRenderedFg = ''
  let pendingFg = ''
  let settleTimer = 0
  let ticks = 0
  const fire = () => {
    if (pendingFg && pendingFg !== lastRenderedFg) {
      lastRenderedFg = pendingFg
      reRender(diagramRenderRoot(window.vditor))
    }
  }
  const tick = () => {
    ticks++
    // Task 412 follow-up (CONFIRMED HIGH bug) — was `activeModeElement(window.vditor) ?? undefined`,
    // which resolves ONLY to the active mode's own element (`vditor.ir.element`/
    // `vditor.wysiwyg.element`). Vditor appends the full/split Preview surface (`.vditor-preview`)
    // as a SIBLING of that element, not a descendant, so an already-rendered diagram living there
    // was never even collected as a gate candidate — not "judged offscreen", never enumerated at
    // all — and stayed stale after a flip until the document was reopened.
    // `diagramRenderRoot` resolves the stable `#app` mount instead, an ANCESTOR of every surface.
    const editorEl = diagramRenderRoot(window.vditor)
    const probe = editorEl?.querySelector(probeSelector) as HTMLElement | null
    const fg = probe ? getComputedStyle(probe).color : ''
    // Each new foreground value RESTARTS the settle timer; the re-render only runs once the colour
    // has held steady for 250ms, so the intermediate values during the flip coalesce into one pass.
    if (fg && fg !== pendingFg) {
      pendingFg = fg
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(fire, 250)
    }
    if (ticks < 14) {
      window.setTimeout(tick, 150) // watch for a late content-theme settle (~2s)
    } else {
      // End of the poll window — GUARANTEE the settled colour was actually drawn. Without this the
      // debounce can, on some settle timings, never fire (a colour that never held steady for 250ms
      // within the window), leaving the diagram in the OLD theme's baked colour. `fire` is a no-op if
      // the debounce already drew this colour, so this only covers the miss.
      window.clearTimeout(settleTimer)
      fire()
    }
  }
  requestAnimationFrame(tick)
}

// Task 412 follow-up — every foreground-poll PROBE selector below used to be the 2-selector
// IR/WYSIWYG-only list, so a diagram of that lang living ONLY in the full/split Preview surface
// (`.vditor-preview`) could never be found by the probe — `fg` stayed empty, the settle-detection
// in reThemeOnForegroundChange never fired, and the poll's own `fire()` (and the whole re-render
// it gates) silently never ran, for EVERY lang sharing this probe mechanism. `renderedDiagramTargets`
// covers all three surfaces; build the probe selector the same way so it can find a probe there too.
function probeSelectorFor(...langs: string[]): string {
  return langs
    .map(
      (l) =>
        `:is(.vditor-ir__preview, .vditor-wysiwyg__preview, .vditor-preview) .language-${l}`,
    )
    .join(',')
}

function reThemeFlowchart(): void {
  reThemeOnForegroundChange(probeSelectorFor('flowchart'), (root) =>
    reRenderFlowchart(window, root),
  )
}

/** Vega/Vega-Lite bake axis/label/legend/title colours from `getComputedStyle(wrapper).color` at
 *  render time — same late-settle trap as flowchart, so poll the foreground rather than re-rendering
 *  on a fixed delay (which left the axis numbers in the old theme's colour until reopen). */
function reThemeVega(): void {
  reThemeOnForegroundChange(
    probeSelectorFor('vega', 'vega-lite'),
    // Cache-first per lang (task 436). `reRenderVega` re-renders BOTH dialects in one call, so the
    // fallback is only run when neither was taken over — a partial take-over (one dialect cached,
    // the other not) is already handled by the miss path re-firing the engine for the un-reserved
    // blocks alone, and calling reRenderVega again here would clear the cached one too.
    (root) => {
      const taken = ['vega', 'vega-lite'].filter((l) =>
        rethemeCacheFirst(root ?? document, [l]),
      )
      if (!taken.length) reRenderVega(root)
    },
  )
}

/** Re-render the baked/currentColor SVG renderers after a theme flip — deferred (rAF + 400ms) so the
 *  content-theme `<link>` and the `vditor--dark` class have settled before the re-render reads colours.
 *  `mono` covers plantuml/graphviz/abc/wavedrom/nomnoml/stl; `geo` (geojson/topojson) is SEPARATE so
 *  changing only the `diagram.geo.basemap` setting re-renders the maps without touching the rest of the
 *  group (a content flip sets both → still a single geojson re-render via the `mono || geo` gate); `d2`
 *  is SEPARATE so the single authority (rethemeDiagrams) decides D2's grouping once — D2 can re-render
 *  for a layout/theme change with no content flip, where the mono group must NOT re-render. */
// 185/2a: the mono/geo group MEMBERSHIP comes from the engine registry. Vega is deliberately NOT in
// the mono map even though it bakes colours — it re-themes via reThemeVega() (foreground polling):
// its axis/label colours come from getComputedStyle, which settles too late for this fixed 400ms
// delay (the old colour stuck).
//
// This map now covers ONLY the native-family mono engines (plantuml/graphviz/abc). wavedrom/nomnoml
// (mono) and geojson/topojson (geo) are `family: 'custom'` and used to have a SECOND row here (+ a
// separate GEO_RERENDER map) duplicating CUSTOM_DIAGRAM_ADAPTERS' reRender — task 404 phase 2
// removes that duplication: monoOrGeoRerender() below falls through to the shared adapter map for
// any mono/geo lang this native map doesn't cover.
const MONO_RERENDER: Record<
  string,
  (el: HTMLElement | undefined, cdn: string) => void
> = {
  plantuml: (el, cdn) => reRenderPlantuml(el, cdn),
  graphviz: (el, cdn) => reRenderGraphviz(el, cdn),
  abc: (el, cdn) => reRenderAbc(el, cdn),
  // stl dropped (task 164 §4): its material is theme-independent, so a flip re-render is pure
  // waste (two full three.js/WebGL rebuilds per block). Registry retheme is now 'none' → stl no
  // longer appears in MONO_LANGS, so the fail-loud check below stays satisfied.
}
const MONO_LANGS = engineLangs((e) => e.retheme === 'mono')
const GEO_LANGS = engineLangs((e) => e.retheme === 'geo')

// Task 404 phase 2 — the single dispatch point for every mono/geo engine's re-render: the native
// map above first, else the shared CUSTOM_DIAGRAM_ADAPTERS map (wavedrom/nomnoml/geojson/topojson
// today). `cdn` is ignored by the custom-diagram adapters (only the native engines need it) —
// accepting it here keeps ONE call signature for the reThemeMono/reThemeGeoAndD2 loops below
// instead of branching per lang at every call site. Exported for the unit test (and so a future
// engine that forgets BOTH maps fails a test, not just the module-init throw below).
export function monoOrGeoRerender(
  lang: string,
): ((el: HTMLElement | undefined, cdn: string) => void) | undefined {
  const native = MONO_RERENDER[lang]
  if (native) return native
  const adapter = CUSTOM_DIAGRAM_ADAPTERS[lang]
  return adapter ? (el) => adapter.reRender(el) : undefined
}

// A registry engine tagged mono/geo with no re-render fn (native or adapter) is a wiring bug —
// fail loud at module init (any unit test importing this module catches it), same philosophy as
// the build-time patch asserts.
for (const lang of [...MONO_LANGS, ...GEO_LANGS]) {
  if (!monoOrGeoRerender(lang)) {
    throw new Error(
      `diagram-retheme: registry engine '${lang}' is tagged mono/geo but has no re-render fn`,
    )
  }
}

// Task 412 — generalizes task 166's mermaid-only IntersectionObserver gate (now viewport-gate.ts)
// to every OTHER retheme path below: the mono SVG group (plantuml/graphviz/abc/wavedrom/nomnoml),
// ECharts/mindmap, geo (geojson/topojson), and D2. Every offscreen diagram in the document, across
// ALL of those engines, waits on this ONE shared observer and is redrawn individually the instant
// it scrolls into view — mirroring task 166's "1 of 12 mermaids visible ⇒ only 1 relayout" result
// for engines whose per-block cost is far WORSE than a dagre relayout (plantuml C4 ~2.2s/render,
// D2 ~365ms/compile — tasks 349/352/436). Disposed on re-init via disposeDiagramRethemeGate
// (registered in finish-init.ts, mirroring mermaid's own gate's lifecycle).
const diagramGate = createViewportGate()
export function disposeDiagramRethemeGate(): void {
  diagramGate.dispose()
}

// Enumerate the CURRENT `.language-<lang>` elements under `root`, across EVERY rendered-diagram
// surface (IR/WYSIWYG collapsed preview AND the full/split Preview overlay — diagram-surfaces.ts's
// `renderedDiagramTargets`, task 412 follow-up: this used to be pane-scoped with a selector that
// excluded `.vditor-preview` for the native/echarts group specifically, which is the confirmed-HIGH
// bug this file now shares one fix for). `requireProcessed` must mirror what that lang's ACTUAL
// re-render call scans, or a candidate could be gated here but missed by the real redraw:
//  - native mono (plantuml/graphviz/abc) + echarts: no processed filter — mirrors reRenderLang's /
//    reRenderEcharts's own scans (neither checks data-processed up front).
//  - custom mono (wavedrom/nomnoml) + geo (geojson/topojson): `[data-processed]` required — mirrors
//    resetCustomBlocks' own selector (it only resets ALREADY-drawn blocks; an unprocessed one
//    belongs to the first-render path, not this one — nothing to re-theme yet).
function collectLangCandidates(
  root: HTMLElement,
  lang: string,
  requireProcessed: boolean,
): HTMLElement[] {
  const targets = renderedDiagramTargets(root, lang)
  return requireProcessed
    ? targets.filter((el) => el.hasAttribute('data-processed'))
    : targets
}

// D2's own re-render loop (diagram-engines/d2.ts) also requires `[data-processed]` (only an
// ALREADY-drawn block has anything to re-theme) and, like every custom-family engine, can carry
// more than one target per pane — `renderedDiagramTargets` already returns every match, not one per
// pane, so no special-casing is needed here beyond the processed filter.
function collectD2Candidates(root: HTMLElement): HTMLElement[] {
  return renderedDiagramTargets(root, 'd2').filter((el) =>
    el.hasAttribute('data-processed'),
  )
}

// Mindmap candidates mirror reconstructMindmaps' OWN discovery (echarts-retheme.ts) — both now
// route through the same `renderedDiagramTargets` helper.
function collectMindmapCandidates(root: HTMLElement): HTMLElement[] {
  return renderedDiagramTargets(root, 'mindmap')
}

// Gate `candidates` and render (or re-queue) each one via `renderOne`. `renderOne` fires either
// synchronously below (visible now) or later from the shared observer's callback (scrolled into
// view) — the SAME function either way, so it must read whatever live state it needs itself
// (current cdn/theme) rather than close over a value captured at THIS call's flip time; see
// viewport-gate.ts's contract. Every call site below does this via `deps.getCdn()` (already a live
// getter) or by reading currentColor from the DOM at render time (mono/d2/geo bake it — correct by
// the time the callback runs, since the CSS class flip lands long before any diagram redraw).
// Purely a DOM-visible marker mirroring the gate's internal (WeakSet) defer state — the generic
// viewport-gate.ts module deliberately has no DOM footprint (multiple gate instances would collide
// on one attribute name), but this module owns exactly ONE shared instance (`diagramGate`), so a
// single marker is safe here and gives real-VS-Code specs + unit tests a way to assert "this
// specific diagram is currently deferred" without reaching into the gate's private state. Mirrors
// mermaid-retheme.ts's own `data-vmde-mermaid-defer` compat shim. Never read by this module's own
// logic — purely observability.
const RETHEME_DEFER_ATTR = 'data-vmde-retheme-defer'

function gateAndRender(
  candidates: HTMLElement[],
  renderOne: (el: HTMLElement) => void,
): void {
  // Clears the marker on ANY actual fire — immediate below, or later via the gate's own observer
  // callback when a deferred candidate scrolls into view — so the attribute always tracks "is this
  // element CURRENTLY queued", not just its state at THIS gateAndRender call.
  const fire = (el: HTMLElement) => {
    el.removeAttribute(RETHEME_DEFER_ATTR)
    renderOne(el)
  }
  const visible = diagramGate.partition(candidates, fire)
  const visibleSet = new Set(visible)
  for (const c of candidates) {
    if (!visibleSet.has(c)) c.setAttribute(RETHEME_DEFER_ATTR, '1')
  }
  for (const el of visible) fire(el)
}

/** Re-render the baked/currentColor SVG group (plantuml/graphviz/abc/wavedrom/nomnoml) after a flip
 *  by POLLING the settled foreground — like flowchart/vega (task 164 §3). Replaces the old
 *  unconditional rAF + setTimeout(400) DOUBLE fire, which re-parsed + re-rendered every block TWICE
 *  per flip (incl. the TeaVM/viz.js WASM). `monoGroup` is only ever set on a VS Code flip or a
 *  content-theme switch — both move the foreground — so the poll always fires at least once, and the
 *  final one uses the settled colour (the content-theme `<link>` lands late). The re-render is now
 *  change-gated: no extra fire when the colour didn't actually move. */
function reThemeMono(): void {
  const probe = probeSelectorFor(...MONO_LANGS)
  reThemeOnForegroundChange(probe, (root) => {
    // Matches the pre-412 behavior exactly: every monoOrGeoRerender call below was already a no-op
    // on an undefined root (reRenderPlantuml/Graphviz/Abc and the CUSTOM_DIAGRAM_ADAPTERS all guard
    // `if (!editorEl) return`) — bailing here just skips the now-pointless candidate collection too.
    if (!root) return
    // Task 412 — viewport-gate PER DIAGRAM (not per lang): scope each re-render to just the ONE
    // block wrapper it belongs to (blockScopeOf) so a visible plantuml block's redraw can never
    // touch an offscreen sibling, custom or native. `deps.getCdn()` is read INSIDE renderOne (not
    // hoisted to a `cdn` local) so a deferred fire always uses the CURRENT cdn.
    for (const lang of MONO_LANGS) {
      const native = !!MONO_RERENDER[lang]
      const candidates = collectLangCandidates(root, lang, !native)
      gateAndRender(candidates, (target) => {
        const scope = blockScopeOf(target)
        // wavedrom/nomnoml are cacheable customs and go through the cache first (task 436); the
        // native members of this group (plantuml/graphviz/abc) are `cacheable: false` here — their
        // re-render is not a findBlocks div — so rethemeCacheFirst finds nothing for them and they
        // fall straight through to the live path, unchanged. A cache MISS on a custom lang un-
        // reserves `scope`'s block and appends a trigger comment that re-fires observeCustomDiagrams
        // DOCUMENT-WIDE — safe because every OTHER (still-offscreen, still-deferred) block keeps its
        // `data-processed` untouched, so that document-wide pass only ever picks up the one block we
        // just un-reserved.
        cacheFirstThen(scope, lang, () =>
          monoOrGeoRerender(lang)?.(scope, deps.getCdn()),
        )
      })
    }
  })
}

/** geojson/topojson (Leaflet) + D2 re-render on a DEFERRED rAF + 400ms — deliberately NOT the
 *  foreground poll (task 164 §3 caveat): geo must also re-render on a `geoBasemap`-only setting
 *  change and D2 on a `d2Layout`/`d2Theme` change, neither of which moves the editor foreground, so a
 *  poll would miss them. The mono group split off to reThemeMono(). */
function reThemeGeoAndD2(opts: { geo: boolean; d2: boolean }): void {
  if (!opts.geo && !opts.d2) return
  const run = () => {
    // Task 412 follow-up — was `activeModeElement(window.vditor) ?? undefined`; see reThemeMono's
    // `tick()` for the full story (`.vditor-preview` is a SIBLING of the active mode's element, not
    // a descendant, so it was never reached).
    const el = diagramRenderRoot(window.vditor)
    if (!el) return
    // Task 412 — same per-diagram viewport gate as reThemeMono, wired through the SAME shared
    // observer (diagramGate): an offscreen geo/D2 block skips its (Leaflet init + tile fetch, or
    // WASM compile + layout) cost until it scrolls in. Geo included deliberately, not excluded —
    // a scrolled-offscreen container still has real layout/width (unlike the display:none case
    // `measuresHidden` exists for), so deferring Leaflet's init is exactly as safe as deferring a
    // redraw; only D2 gets task 436's cache-first treatment (geo is `cacheable: false`).
    if (opts.geo) {
      // geojson/topojson: a content flip re-themes the geometry colour AND flips the `auto` basemap
      // light/dark; a geoBasemap setting change swaps the tile source. One re-render covers both.
      for (const lang of GEO_LANGS) {
        const candidates = collectLangCandidates(el, lang, true)
        gateAndRender(candidates, (target) =>
          monoOrGeoRerender(lang)?.(blockScopeOf(target), deps.getCdn()),
        )
      }
    }
    // D2 SVG bakes currentColor, so a flip needs a re-render. It rides the same deferral — and is
    // the engine task 436 exists for: a full WASM compile + layout (~365 ms) per diagram is by far
    // the most expensive thing a flip triggers, so it is the one most worth serving from cache AND
    // (task 412) the one most worth skipping entirely while offscreen.
    if (opts.d2) {
      const candidates = collectD2Candidates(el)
      gateAndRender(candidates, (target) => {
        const scope = blockScopeOf(target)
        cacheFirstThen(scope, 'd2', () => reRenderD2(scope))
      })
    }
  }
  // ONE deferred fire (task 411). This used to be `requestAnimationFrame(run)` AND
  // `window.setTimeout(run, 400)`, both unconditional: every flip re-parsed and re-rendered each
  // D2/geo block TWICE, i.e. two D2 WASM compiles + layouts (~365 ms each, measured) and two tile
  // fetches per map. The rAF leg was not merely redundant, it was the WRONG render: it lands
  // ~16 ms in, BEFORE the content-theme `<link>` settles (the very reason this group is deferred
  // 400 ms — see reThemeMono's poll), so it painted the stale palette and was then overwritten by
  // the leg that survives today. Dropping it changes nothing visible; it removes a discarded render.
  // NOTE this group is still UNGATED by design — unlike every other group it has no change-gate,
  // because a `geoBasemap`/`d2Layout`/`d2Theme` change must re-render without moving the editor
  // foreground a poll could see (task 164 §3). "Fires once" is not "fires only when something moved".
  window.setTimeout(run, 400)
}

/** THE single re-theme authority (task 152 item 3). Both theme-flip sites route through this:
 *  handleSetTheme passes everything (a mode flip re-themes all), handleConfigChanged passes the
 *  changed-flag subset. D2's grouping lives ONLY here — it fires once when the mono SVG group
 *  re-themes (content flip) OR its own layout/theme changed, so the two sites can no longer
 *  double-render D2 or drift. `theme` is the effective light/dark mode the renderers paint with. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches re-theme across every diagram engine's own theming mechanism; pre-existing (task 469 baseline)
export function rethemeDiagrams(f: {
  theme: 'dark' | 'light'
  code: boolean
  mermaid: boolean
  echarts: boolean
  smiles: boolean
  flowchart: boolean
  vega: boolean
  monoGroup: boolean
  geo: boolean
  d2: boolean
}): void {
  // Task 412 follow-up — was `activeModeElement(window.vditor) ?? undefined`; see reThemeMono's
  // `tick()` (above) for the full story.
  const el = diagramRenderRoot(window.vditor)
  const cdn = deps.getCdn()
  const options = deps.getOptions()
  const win = window as any
  // Code-block + content theme: swap the hljs stylesheet + UI mode (no re-init, keeps cursor).
  if (f.code) deps.applyCodeTheme(f.theme)
  // Mermaid/ECharts paint once → apply the theme wrapper + offscreen re-render (tasks 59/86/90).
  if (f.mermaid) {
    const init = resolveMermaidInit(
      options?.mermaidTheme,
      options?.contentTheme,
      f.theme,
    )
    applyMermaidTheme(window, init)
    // Skip the (full re-parse + dagre relayout) re-render when the resolved init is unchanged: a
    // paired/explicit palette is mode-independent, so a flip yields a byte-identical SVG (task 164
    // §1). The signature folds the mode in ONLY for the auto (init===null) branch. applyMermaidTheme
    // above always runs (keeps the wrapper live); only reRenderMermaid is gated. First flip (no
    // stored sig) always renders.
    // Fold the layout (dagre|elk, task 112) into the signature: a layout flip changes the SVG geometry
    // but not the theme, so it must bust the skip-gate too. The re-render itself needs no special ELK
    // setup — reRenderMermaid re-runs mermaid offscreen, and mermaid AWAITS the (synchronously registered)
    // ELK loader, which lazy-loads the adapter on demand; the offscreen poll waits it out.
    const layout = win.__vmdeMermaidLayout === 'elk' ? 'elk' : 'dagre'
    const sig = mermaidInitSignature(init, f.theme, layout)
    if (win.__vmdeLastMermaidSig !== sig) {
      reRenderMermaid(el, cdn, f.theme)
      win.__vmdeLastMermaidSig = sig
    }
  }
  if (f.echarts) {
    const spec = resolveEchartsTheme(
      options?.echartsTheme,
      options?.contentTheme,
      f.theme,
      readVscodePalette(window),
    )
    applyEchartsTheme(window, spec)
    // Skip dispose+reinit (every chart in every pane) + the forced mindmap rebuild when the resolved
    // spec is unchanged (task 164 §2). Sign the FULL spec — the auto case differs only inside
    // theme.backgroundColor/series, so signing `name` alone would wrongly skip and leave charts
    // stale. applyEchartsTheme already ran (cheap registerTheme + resolver reinstall); only
    // reRenderEcharts is gated. First flip always renders; observeMindmaps still handles real resizes.
    const sig = JSON.stringify(spec)
    if (win.__vmdeLastEchartsSig !== sig) {
      // Read at FIRE time by a deferred (task 412) redraw — see latestEchartsMode's own comment.
      latestEchartsMode = f.theme
      if (el) {
        // Task 412 — echarts AND mindmap share reRenderEcharts (it internally handles both: the
        // chart dispose+reinit loop for `.language-echarts`, then reconstructMindmaps for
        // `.language-mindmap` — see its own comment), so ONE candidate list covering both langs,
        // scoped per-diagram via blockScopeOf, gates both through the same call.
        const candidates = [
          ...collectLangCandidates(el, 'echarts', false),
          ...collectMindmapCandidates(el),
        ]
        gateAndRender(candidates, (target) =>
          reRenderEcharts(window, blockScopeOf(target), latestEchartsMode),
        )
      }
      win.__vmdeLastEchartsSig = sig
    }
  }
  // flowchart.js + vega bake their foreground from getComputedStyle → poll the settled colour.
  if (f.flowchart) reThemeFlowchart()
  if (f.vega) reThemeVega()
  // Monochrome/palette-baked SVG group: poll the foreground (change-gated, once per flip) — task 164 §3.
  if (f.monoGroup) reThemeMono()
  // geojson/topojson + D2 ride a deferred rAF+400 (they re-render on settings that don't move the fg).
  reThemeGeoAndD2({ geo: f.geo, d2: f.d2 })
  // SMILES follows the page-background luminance — a flip changes it outside #app, so re-run explicitly.
  if (f.smiles) reThemeSmiles()
}
