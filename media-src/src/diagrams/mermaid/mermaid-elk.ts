// Task 112 — opt-in ELK layout for mermaid GRAPH diagrams (flowchart / class / state / ER), an
// alternative to mermaid's default dagre. mermaid ≥10.3 made layout pluggable: register layout loaders,
// then `layout: "elk"` (globally via config, or per-diagram via `%%{init:{"layout":"elk"}}%%`) resolves.
//
// KEY DESIGN — no first-render race. mermaid AWAITS a loader's `loader()` before it renders, so we
// register the (tiny) loader DEFINITIONS SYNCHRONOUSLY the moment mermaid loads (from mermaid-theme.ts's
// window.mermaid hook), for EVERY mermaid doc. A dagre diagram never invokes a loader → nothing heavy
// loads (lazy preserved). An ELK diagram makes mermaid await our loader(), which lazy-loads the vendored
// @mermaid-js/layout-elk render chunk (mermaid-elk-main.js) + boots the shared main-thread elkjs
// (window.__vmarkdElk — the stock blob Worker is rejected by the VS Code webview, ADR-0004) and returns
// the render module. Because mermaid awaits it, the FIRST render is already ELK — no dagre-first flash,
// no settle re-render, no source pre-scan. Kept dependency-light (boot-elk + load-script only) so nothing
// heavy re-enters the eager main.js and undoes the task-165 code-split.
import { bootElk } from '../d2/boot-elk'
import { loadScript } from '../../util/load-script'

declare const window: Window & {
  mermaid?: { registerLayoutLoaders?: (loaders: unknown) => void }
  __vmarkdMermaidElkLayouts?: Array<{ loader: () => Promise<unknown> }>
  __vmarkdMermaidElkRegistered?: boolean
  __vmarkdCdn?: string
}

// The mermaid ELK layout algorithms exposed by @mermaid-js/layout-elk 0.2.2. Mirrored here (stable list)
// so registration is a SYNCHRONOUS eager step — the render chunk that implements them stays lazy.
const ELK_ALGORITHMS: Array<{ name: string; algorithm: string }> = [
  { name: 'elk', algorithm: 'elk.layered' },
  { name: 'elk.stress', algorithm: 'elk.stress' },
  { name: 'elk.force', algorithm: 'elk.force' },
  { name: 'elk.mrtree', algorithm: 'elk.mrtree' },
  { name: 'elk.sporeOverlap', algorithm: 'elk.sporeOverlap' },
]

// The lazy loader mermaid awaits before rendering an ELK diagram: load the adapter bundle + boot the
// shared ELK, then hand back the vendored render module (all vendored entries share ONE render chunk, so
// [0].loader() yields the `{ render }` module for every algorithm — our per-entry `algorithm` above tells
// the render which ELK algorithm to run). Throws if the adapter can't load → mermaid falls back to dagre.
async function loadElkRenderModule(): Promise<unknown> {
  const ok = await ensureMermaidElk(window.__vmarkdCdn ?? '')
  const vendored = window.__vmarkdMermaidElkLayouts
  if (!ok || !vendored?.[0]) {
    throw new Error('vmarkd: mermaid ELK adapter unavailable')
  }
  return vendored[0].loader()
}

// Register the ELK layout loaders on the mermaid global. MUST be called AFTER mermaid.initialize()
// completes (mermaid-theme.ts calls it from inside the initialize wrapper, after the original init):
// mermaid lazily (re)initialises its layout-algorithm registry — the `y2 = {}` reset in mermaid's own
// module init runs on the first initialize and WIPES an earlier registration (verified: registering in
// the window.mermaid load hook left `layout:'elk'` falling back to dagre; re-registering right before
// render fixed it, task 112). mermaid's registerLayoutLoaders is a plain `y2[name] = entry` overwrite —
// no dupes, no warning — so re-running it on every initialize is cheap + safe. Registering these tiny
// definitions pulls NOTHING heavy: the render chunk + elkjs load only when mermaid awaits
// loadElkRenderModule for an actual ELK diagram.
export function registerMermaidElkLoaders(): void {
  // Called from the initialize wrapper, which also runs in node unit tests (fake window) — `typeof`
  // guards the ReferenceError before touching the real global.
  if (typeof window === 'undefined') return
  const m = window.mermaid
  if (!m || typeof m.registerLayoutLoaders !== 'function') return
  m.registerLayoutLoaders(
    ELK_ALGORITHMS.map((a) => ({
      name: a.name,
      algorithm: a.algorithm,
      loader: loadElkRenderModule,
    })),
  )
  window.__vmarkdMermaidElkRegistered = true
}

let readyPromise: Promise<boolean> | null = null

// Load the ELK adapter bundle (→ window.__vmarkdMermaidElkLayouts) AND boot the shared main-thread ELK
// (→ window.__vmarkdElk) in parallel. Cached: one fetch per session; on failure the cache is cleared so
// a later render can retry. Awaited by loadElkRenderModule (i.e. lazily, the first time an ELK diagram
// renders), and directly by the live-flip re-render in diagram-retheme.ts.
export function ensureMermaidElk(cdn: string): Promise<boolean> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const [, elk] = await Promise.all([
        loadScript(
          `${cdn}/dist/js/mermaid-layout-elk/mermaid-elk-main.js`,
          'vditorMermaidElkScript',
        ),
        bootElk(cdn),
      ])
      if (!window.__vmarkdMermaidElkLayouts || !elk) {
        readyPromise = null
        return false
      }
      return true
    })()
  }
  return readyPromise
}
