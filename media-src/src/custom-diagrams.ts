// Custom diagram renderers for languages Vditor doesn't natively support.
// Each renderer: lazy-loads the engine script, finds unprocessed code blocks,
// replaces them with rendered SVG. Themed via currentColor (same as graphviz/plantuml).

import { engineLangs } from './engine-registry'
// Task 409 — splitting this god-module into one file per engine (`diagram-engines/<engine>.ts`)
// plus the shared DOM plumbing (`diagram-dom.ts`). custom-diagrams.ts is becoming a TRANSITIONAL
// FACADE as engines migrate out: each migrated engine's logic moves entirely to its own file, and
// this file re-exports it (below, next to each engine's original section) so every existing
// importer of './custom-diagrams' (finish-init.ts, diagram-retheme.ts, the test suite) keeps
// working without a churny cross-file import-path update in the same commit as the move. What's
// left INLINE below is the shared scheduling layer (`observeCustomDiagrams`), which stays here
// permanently — see task 409's "keep the shared scheduling layer as a small dispatcher". D2 (the
// last engine, deferred from the initial 409 pass — WASM + ELK/dagre + its own Lute instance + a
// bespoke reset deserved its own round) has now migrated too, so every `family: 'custom'` engine
// lives in its own file; nothing custom-diagram-specific remains inline below except the shared
// dispatcher.
export { findBlocks, getCdn, PANE_SEL, resetCustomBlocks } from './diagram-dom'
import { renderStl, reRenderStl } from './diagram-engines/stl'
export {
  STL_MATERIAL_COLOR,
  renderStl,
  reRenderStl,
} from './diagram-engines/stl'
import { renderWavedrom, reRenderWavedrom } from './diagram-engines/wavedrom'
export { renderWavedrom, reRenderWavedrom } from './diagram-engines/wavedrom'
import { renderNomnoml, reRenderNomnoml } from './diagram-engines/nomnoml'
export {
  themeNomnomlSvg,
  renderNomnoml,
  reRenderNomnoml,
} from './diagram-engines/nomnoml'
import {
  renderGeojson,
  renderTopojson,
  reRenderGeojson,
  reRenderTopojson,
} from './diagram-engines/geojson-topojson'
export {
  basemapFor,
  initLeafletMap,
  renderGeojson,
  renderTopojson,
  reRenderGeojson,
  reRenderTopojson,
} from './diagram-engines/geojson-topojson'
export type { Basemap } from './diagram-engines/geojson-topojson'
import {
  renderVega,
  renderVegaLite,
  reRenderVega,
} from './diagram-engines/vega'
export {
  stripRemoteData,
  vegaRenderConfig,
  renderVega,
  renderVegaLite,
  reRenderVega,
} from './diagram-engines/vega'
import {
  isTyping,
  deferUntilSettle,
  beginSettleRender,
  scheduleReveal,
} from './edit-activity'
import { renderD2, reRenderD2 } from './diagram-engines/d2'
export {
  enrichMarkdownLabels,
  renderD2,
  reRenderD2,
} from './diagram-engines/d2'

// --- WaveDrom --- moved to diagram-engines/wavedrom.ts (task 409); re-exported below (facade).
// --- nomnoml --- moved to diagram-engines/nomnoml.ts (task 409); re-exported below (facade).
// --- D2 --- moved to diagram-engines/d2.ts (task 409, the deferred sixth engine); re-exported
// below (facade).
// --- GeoJSON / TopoJSON --- moved to diagram-engines/geojson-topojson.ts (task 409); re-exported
// below (facade).
// --- Vega / Vega-Lite --- moved to diagram-engines/vega.ts (task 409); re-exported below (facade).
// --- STL 3D models (three.js) ---
// Moved to diagram-engines/stl.ts (task 409); re-exported here for existing importers (facade —
// see the note above CUSTOM_DIAGRAM_ADAPTERS).

// Task 404 phase 1 — inert scaffolding, nothing calls this map yet. `engine-registry.ts` is
// documented PURE DATA (must import nothing from engine modules), so this per-lang function
// map lives HERE instead, keyed to match ENGINES' `family: 'custom'` set; a completeness test
// (custom-diagrams.test.ts) asserts the two stay in sync in both directions — the concrete
// mechanism that makes a forgotten adapter for a new custom engine fail a test instead of
// silently never rendering. 'vega-lite' maps to reRenderVega (not a separate function): task
// 400 found renderVegaBlock always resets/renders vega + vega-lite together in one pass.
export interface CustomDiagramAdapter {
  render: (root?: ParentNode) => void
  reRender: (root?: ParentNode) => void
}

export const CUSTOM_DIAGRAM_ADAPTERS: Record<string, CustomDiagramAdapter> = {
  wavedrom: { render: renderWavedrom, reRender: reRenderWavedrom },
  nomnoml: { render: renderNomnoml, reRender: reRenderNomnoml },
  geojson: { render: renderGeojson, reRender: reRenderGeojson },
  topojson: { render: renderTopojson, reRender: reRenderTopojson },
  vega: { render: renderVega, reRender: reRenderVega },
  'vega-lite': { render: renderVegaLite, reRender: reRenderVega },
  stl: { render: renderStl, reRender: reRenderStl },
  d2: { render: renderD2, reRender: reRenderD2 },
}

// Task 404 phase 2 — observeCustomDiagrams' per-lang dispatch list, DERIVED from the registry +
// CUSTOM_DIAGRAM_ADAPTERS instead of a second hand-maintained `{lang, render}` array (this file
// used to carry both, byte-for-byte in sync only by discipline — the exact "fixed it in N of N+1
// copies" risk the registry exists to prevent). Order follows ENGINES' family:'custom' rows
// (wavedrom, nomnoml, geojson, topojson, vega, vega-lite, stl, d2), matching the array this
// replaces; a unit test pins both the order and that each entry IS the adapter's `render` fn (not
// a copy), so the two can never drift again.
export function customDiagramRenderers(): {
  lang: string
  render: (root: ParentNode) => void
}[] {
  return engineLangs((e) => e.family === 'custom').map((lang) => ({
    lang,
    render: CUSTOM_DIAGRAM_ADAPTERS[lang].render,
  }))
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
  // actually uses (task 164 §5), instead of walking all 8 every sweep. Task 404 phase 2: derived
  // from CUSTOM_DIAGRAM_ADAPTERS (see customDiagramRenderers) instead of a second hard-coded list.
  const renderers = customDiagramRenderers()
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
