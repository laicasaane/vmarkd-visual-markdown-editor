// Drop-in replacement for `elkjs/lib/elk.bundled.js`, aliased ONLY inside the mermaid-elk-main.js
// bundle (media-src/build.mjs `mermaidElkOptions.alias`). @mermaid-js/layout-elk's render chunk does
// `import ELK from "elkjs/lib/elk.bundled.js"`, then `new ELK()` and `await elk.layout(graph)` — the
// stock bundle spawns a blob Web Worker that the VS Code webview REJECTS (the same blocker task 104/113
// hit for D2). Instead we delegate to the ONE shared main-thread ELK we already ship for D2
// (window.__vmdeElk, built from elk-entry.ts → elk-main.js). Net: mermaid + D2 share a single elkjs;
// this bundle adds only the thin layout adapter, not a second ~1.5 MB engine (task 112).
//
// Only `.layout()` is ever called on the instance (verified against the vendored render chunk — the
// other `elk.*` tokens there are layoutOptions STRING KEYS, not method calls), so that is all we
// implement. We import bootElk so `.layout()` is self-sufficient: mermaid drives the render and does
// NOT await our boot, so if the shared engine isn't up yet we boot it here (bootElk is cached, so this
// coalesces with any D2 / ensureMermaidElk boot in flight).
import { bootElk } from './boot-elk'

declare const window: Window & {
  __vmdeElk?: { layout(graph: unknown): Promise<unknown> }
  __vmdeCdn?: string
}

export default class ELK {
  // Signature-compatible with elkjs's `layout(graph, opts?)`; mermaid-layout-elk calls it with just the
  // graph. `opts` is accepted and ignored (elkjs supports per-call options, but the adapter bakes all
  // layoutOptions into the graph itself).
  layout(graph: unknown): Promise<unknown> {
    const existing = window.__vmdeElk
    if (existing) return existing.layout(graph)
    return bootElk(window.__vmdeCdn ?? '').then((elk) => {
      if (!elk) throw new Error('vmde: shared main-thread ELK unavailable')
      return elk.layout(graph)
    })
  }
}
