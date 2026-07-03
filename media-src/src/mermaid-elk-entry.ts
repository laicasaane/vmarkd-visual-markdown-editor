// Separate, lazily-loaded bundle entry for the OFFICIAL mermaid ELK layout adapter
// (@mermaid-js/layout-elk, vendored — task 112). esbuild bundles this into
// media/vditor/dist/js/mermaid-layout-elk/mermaid-elk-main.js (media-src/build.mjs `mermaidElkOptions`);
// mermaid-elk.ts loads it on demand and reads `window.__vmarkdMermaidElkLayouts`, then hands the array
// to `mermaid.registerLayoutLoaders(...)` so `layout: "elk"` resolves.
//
// The vendored package's ONLY heavy dependency, `elkjs/lib/elk.bundled.js`, is ALIASED to
// elk-bundled-shim.ts in this bundle's esbuild config, so NO second elkjs lands here — the shim
// delegates to the ONE shared main-thread ELK we already ship for D2 (window.__vmarkdElk). The other
// import, d3's `curveLinear`, is tree-shaken from node_modules. Result: a thin (~tens of KB) adapter,
// truly lazy (a dagre-only mermaid doc never fetches it), no Worker/blob (CSP-safe).
//
// The default export is mermaid's LayoutLoaderDefinition[] — five entries (elk / elk.stress /
// elk.force / elk.mrtree / elk.sporeOverlap), each with a lazy `loader()` that pulls the actual render
// chunk only when that algorithm is first used.
import layouts from '../vendor/mermaid-layout-elk/mermaid-layout-elk.core.mjs'

;(
  window as unknown as { __vmarkdMermaidElkLayouts?: unknown }
).__vmarkdMermaidElkLayouts = layouts
