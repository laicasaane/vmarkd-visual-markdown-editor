// Shared DOM plumbing for the custom-diagram engines (wavedrom, nomnoml, geojson, topojson,
// vega/vega-lite, stl, d2 — task 409, splitting `custom-diagrams.ts`'s god-module into one file
// per engine). This module holds only what MORE THAN ONE engine needs: the cdn accessor, the
// preview-pane selector, the code→div swap (`findBlocks`), and the shared reset step
// (`resetCustomBlocks`, task 400). Engine-specific helpers (theming, script loaders, per-engine
// state) stay in that engine's own `diagram-engines/<engine>.ts` file.

declare const window: Window & {
  vditor?: { options?: { cdn?: string } }
}

export function getCdn(): string {
  const v = window.vditor as any
  return v?.vditor?.options?.cdn ?? v?.options?.cdn ?? ''
}

export const PANE_SEL =
  '.vditor-ir__preview, .vditor-wysiwyg__preview, .vditor-preview'

// Shared reset step for every reRenderX (wavedrom, nomnoml, geojson, topojson, vega/vega-lite,
// stl) — task 400: these were 6 near-identical bodies (clear data-processed/error, blank
// innerHTML), the same "fixed it in 5 of 6 copies" risk engine-registry.ts exists to prevent for
// other per-engine lists. `lang` accepts an array for vega/vega-lite, which share ONE reset pass
// (renderVegaBlock always calls faithfulRender with the literal 'vega', so vega-lite blocks carry
// `data-vega-error` too, not `data-vega-lite-error` — pass that literal as `errorAttr`, not derived
// from `lang`). D2/PlantUML/Graphviz/mermaid are WASM/worker-backed and out of scope (task 400).
export function resetCustomBlocks(
  container: ParentNode,
  lang: string | string[],
  errorAttr?: string,
): void {
  const langs = Array.isArray(lang) ? lang : [lang]
  const sel = langs
    .flatMap((l) => [
      `code.language-${l}[data-processed]`,
      `div.language-${l}[data-processed]`,
    ])
    .join(', ')
  for (const pane of Array.from(
    container.querySelectorAll<HTMLElement>(PANE_SEL),
  )) {
    for (const el of Array.from(pane.querySelectorAll<HTMLElement>(sel))) {
      el.removeAttribute('data-processed')
      if (errorAttr) el.removeAttribute(errorAttr)
      el.innerHTML = ''
    }
  }
}

// Exported for unit testing the code→div swap (notably the hljs-strip — see diagram-dom.test.ts).
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
