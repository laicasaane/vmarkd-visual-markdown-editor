// Separate, lazily-loaded bundle for the D2 layout+render pipeline — the ~109 KB cluster (dagre
// 40 KB + d2-render + d2-refine + elk-layout + astar + d2-geometry) that was STATICALLY pulled into
// the eager media/dist/main.js yet executes ONLY for `.language-d2` blocks. esbuild bundles this
// into media/vditor/dist/js/d2/d2-main.js (media-src/build.mjs); custom-diagrams.ts loads it on
// demand INSIDE the existing async `compileD2(...).then(...)` and reads `window.__vmarkdD2` (task 165).
//
// Splitting it removes that dead-for-most-docs parse + top-level module-eval from editor startup for
// every non-D2 document (the win is startup parse/eval, not network — the bytes are local). Mirrors
// the proven elk-entry.ts precedent (window.__vmarkdElk). MAIN THREAD, no Worker/blob: dagre and our
// ELK path (via elk-main.js's own fake main-thread worker) both already run on the main thread — keep
// it that way. The bridge exposes only FUNCTIONS — it injects NO DOM into the editable surface, so
// the Lute round-trip is untouched (same guarantee elk-entry.ts already satisfies).
import {
  canvasMeasure,
  d2Theme,
  renderD2Graph,
  unsupportedReason,
} from './d2-render'
// rough.js (task 120) rides THIS lazy chunk — imported here (and by d2-render), so it stays out of the
// eager main.js and loads only when a d2 block renders. makeSketch builds the injected sketch emitter.
import { makeSketch } from './d2-sketch'
import { renderD2GraphElk } from './elk-layout'

// faithfulRender is deliberately NOT here — it is shared by the eager wavedrom/vega renderers, so it
// stays in main.js (it is tiny and pulls no dagre).
;(window as unknown as { __vmarkdD2?: Record<string, unknown> }).__vmarkdD2 = {
  renderD2Graph,
  renderD2GraphElk,
  canvasMeasure,
  unsupportedReason,
  d2Theme,
  makeSketch,
}
