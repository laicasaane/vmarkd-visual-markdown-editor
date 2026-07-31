// Task 412 follow-up — the CONFIRMED HIGH bug: every viewport-gated retheme path resolved its scan
// root from `activeModeElement(window.vditor)`, which is ONLY `vditor.ir.element` /
// `vditor.wysiwyg.element`. Vditor appends the full/split Preview surface (`.vditor-preview`) as a
// SIBLING of those, not a descendant (see vditor's own `initUI.ts`) — so in `sv`/split view or the
// full Preview overlay, an already-rendered diagram living in `.vditor-preview` was never even
// COLLECTED as a gate candidate (not "judged offscreen" — never enumerated at all) and stayed stale
// after a theme flip until the document was reopened. Measured: a flip that should redraw N visible
// diagrams across BOTH the editable pane and `.vditor-preview` only reached the editable pane's half.
//
// Fix: resolve the scan root from the STABLE `#app` mount (an ancestor of every surface — IR/WYSIWYG
// AND `.vditor-preview` alike) instead of the active mode's own element, falling back to
// `activeModeElement` only if `#app` is somehow absent (defensive; #app always exists once Vditor has
// mounted). Every collector below also enumerates `.vditor-preview` alongside the two split-mode
// preview classes — this is now the SINGLE source of truth for "where can a rendered diagram live",
// shared by diagram-retheme.ts (root resolution + candidate collection) and every native engine's own
// re-render scan (plantuml-retheme.ts, mermaid-retheme.ts, echarts-retheme.ts) that used to hardcode
// a narrower 2-selector list.
import { blockScopeOf } from './diagram-dom'
import { activeModeElement } from '../util/source-map'

const RENDERED_DIAGRAM_PANE_SELECTOR =
  '.vditor-ir__preview, .vditor-wysiwyg__preview, .vditor-preview'

/** The scan root for every retheme path: the stable `#app` mount, which is an ANCESTOR of both the
 *  active mode's editable pane AND the full/split Preview surface (siblings of each other, not
 *  nested) — unlike `activeModeElement`, which only ever resolves to the editable pane and silently
 *  excludes `.vditor-preview` entirely. Falls back to `activeModeElement` if `#app` is absent (should
 *  not happen once Vditor has mounted; defensive only). */
export function diagramRenderRoot(vditor: unknown): HTMLElement | undefined {
  return (
    document.getElementById('app') ?? activeModeElement(vditor) ?? undefined
  )
}

/** Every rendered-diagram preview pane under `root` (IR, WYSIWYG, AND full/split Preview) — `root`
 *  itself counts too if it happens to already be one (a narrowed per-diagram scope can be). */
export function renderedDiagramPanes(root: ParentNode): HTMLElement[] {
  const own =
    root instanceof HTMLElement && root.matches(RENDERED_DIAGRAM_PANE_SELECTOR)
      ? [root]
      : []
  return [
    ...own,
    ...Array.from(
      root.querySelectorAll<HTMLElement>(RENDERED_DIAGRAM_PANE_SELECTOR),
    ),
  ]
}

/** Rendered `.language-<lang>` targets whose ANY ancestor is one of the three preview-pane classes —
 *  deliberately NOT "find panes as descendants of `root`, then query within each pane" (what
 *  `renderedDiagramPanes` gives you): a descendant-combinator selector like this one is evaluated
 *  against each candidate's FULL ancestor chain, not just the ancestors that happen to sit inside
 *  `root` — so it still finds the target correctly when `root` itself is a NARROW per-diagram scope
 *  (blockScopeOf's `.vditor-preview` fallback is the element's own immediate parent, which does NOT
 *  itself carry a preview-pane class; the real `.vditor-preview` ancestor sits further up, outside
 *  `root`). "Panes as descendants of root" would find nothing in that case and silently skip the
 *  redraw even though the candidate was already correctly identified — this is what broke
 *  plantuml-retheme.ts's `reRenderLang`, echarts-retheme.ts's chart loop, and
 *  diagram-dom.ts's `resetCustomBlocks`/`reRenderD2`'s reset step for a scoped full-Preview target. */
export function renderedDiagramTargets(
  root: ParentNode,
  lang: string,
): HTMLElement[] {
  const selector = `:is(${RENDERED_DIAGRAM_PANE_SELECTOR}) .language-${lang}`
  const own =
    root instanceof HTMLElement && root.matches(selector) ? [root] : []
  return [...own, ...Array.from(root.querySelectorAll<HTMLElement>(selector))]
}

/** Read a native diagram's editable source, resolved from the LIVE render target itself — NOT a
 *  pane-wide query. (Task 466 — this replaces the earlier `nativeSourceForPane(pane, lang)`, which
 *  read `pane.querySelector('.language-lang')?.getAttribute('data-code')`: a FIRST match within
 *  `pane`. That's correct for `.vditor-ir__preview`/`.vditor-wysiwyg__preview`, which wrap exactly
 *  ONE diagram each, but wrong for `.vditor-preview` — the full/split Preview surface is a SINGLE
 *  pane holding every diagram in the document, so with two-or-more same-lang diagrams there every
 *  one of them resolved to the FIRST one's source. Every caller already has (or can trivially get)
 *  the live node — typically from `renderedDiagramTargets` above — so reading off it directly is
 *  correct by construction: there is no widened pane search to get wrong. Lives here, next to
 *  `renderedDiagramTargets`, rather than in native-offscreen.ts or duplicated per-engine (task 454's
 *  `resolveEchartsSource` was the same function under a different name before this move) — this
 *  module is the single source of truth for "where can a rendered diagram live" and "given a live
 *  node, what's its source" is the natural next question once you have one.
 *
 *  Prefers the `data-code` stamp the patched native/custom renderers write on `live` as they draw
 *  (same convention `plantuml-retheme.ts` and others rely on for recovery). Falls back to the
 *  sibling editable `<code class="language-X">` OUTSIDE the preview pane — its textContent survives
 *  every render, unlike the preview node's own textContent, which the rendered output overwrites —
 *  for documents rendered before the stamp existed. That fallback only ever finds anything in
 *  IR/WYSIWYG (a real sibling exists there); `.vditor-preview` has no 1:1 editable-block pairing, so
 *  it depends on the stamp being present. Shared by every re-theme/resize path + the render cache. */
export function nativeSourceForLive(
  live: HTMLElement,
  lang: string,
): string | null {
  const stamped = live.getAttribute('data-code')
  if (stamped != null) return stamped
  const pane = live.closest<HTMLElement>(RENDERED_DIAGRAM_PANE_SELECTOR)
  const block = blockScopeOf(live)
  const source = Array.from(
    block.querySelectorAll<HTMLElement>(`.language-${lang}`),
  ).find((m) => !pane?.contains(m))?.textContent
  return source ?? null
}
