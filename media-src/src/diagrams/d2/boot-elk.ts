// Lazy loader for the shared main-thread ELK (Eclipse Layout Kernel) instance. elk-main.js (built from
// elk-entry.ts) constructs an ELK on the MAIN THREAD — no Web Worker, which the VS Code webview rejects
// (see elk-entry.ts) — and exposes it as `window.__vmdeElk`. This module owns the ONE lazy-load of
// that script + its cached promise.
//
// Extracted from elk-layout.ts (task 112) so it can be imported by BOTH the D2 pipeline (d2-main.js,
// via elk-layout.ts) AND the mermaid-ELK adapter (mermaid-elk-main.js, via elk-bundled-shim.ts) WITHOUT
// dragging in d2-render.ts's dagre cluster — i.e. so nothing here re-enters the eager main.js and undoes
// the task-165 code-split. Keep this module's imports to load-script only.
import { loadScript } from '../../util/load-script'

declare const window: Window & { __vmdeElk?: ElkInstance }

// The main-thread ELK instance exposed by elk-main.js as window.__vmdeElk. Only `.layout()` is ever
// called on it (by D2's layoutElk and by mermaid-layout-elk's render chunk via elk-bundled-shim.ts).
export interface ElkInstance {
  layout(graph: unknown): Promise<unknown>
}

let elkInstance: ElkInstance | null = null
let bootPromise: Promise<ElkInstance | null> | null = null

// Lazy-load elk-main.js (constructs a main-thread ELK instance → window.__vmdeElk) and cache it.
// Returns null if the engine can't be loaded (callers then fall back: D2 → dagre; mermaid → its own
// dagre default). Two SEPARATE bundles now call this (d2-main.js + mermaid-elk-main.js), each with its
// own module-level cache but the SAME `vditorElkScript` id — and loadScript's getElementById dedup
// resolves the instant the <script> tag EXISTS, before it has EXECUTED and set the global (the same
// race task 165 hit with addScript). So after the script "loads", POLL briefly for the global rather
// than trusting it is set — a no-op when we won the race, a short wait when the other bundle's load is
// still executing.
export function bootElk(cdn: string): Promise<ElkInstance | null> {
  if (elkInstance) return Promise.resolve(elkInstance)
  // Null-check on the boot-memoization cache (`Promise<X> | null`), not a missed `await`: a
  // truthy `bootPromise` means a boot is already in flight, and we deliberately return that
  // SAME promise to every concurrent caller rather than starting a second boot (task 482).
  // biome-ignore lint/nursery/noMisusedPromises: see the comment above — this is intentional
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    await loadScript(`${cdn}/dist/js/elk/elk-main.js`, 'vditorElkScript')
    let elk = window.__vmdeElk ?? null
    for (let i = 0; !elk && i < 100; i++) {
      await new Promise((r) => setTimeout(r, 20))
      elk = window.__vmdeElk ?? null
    }
    elkInstance = elk
    // Drop the cached promise on failure so a later call can retry (e.g. the script was still 404-ing).
    if (!elk) bootPromise = null
    return elk
  })()
  return bootPromise
}
