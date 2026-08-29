// Lightweight "engine is loading" placeholder for a diagram block (task 139). The FIRST PlantUML
// render in a session pays ~0.9–1.15s (measured, real VS Code webview) to parse the ~7MB TeaVM engine
// + warm it up + first-render; the block otherwise sits EMPTY that whole time with no signal, reading
// as "broken" rather than "working". This shows a compact themed "Rendering <Engine>…" placeholder in
// the block while the engine loads, removed atomically when the real SVG lands (removeDiagramLoading,
// called from the renderer's <svg>-detection). Every SUBSEQUENT block renders in ~30–50ms (engine
// warm), so the placeholder just flashes-and-vanishes there — harmless.
//
// Lute-safety: identical guarantee to diagram-error.ts — the box carries data-render="1" and always
// lives inside an engine's preview half (`.vditor-ir__preview` / `.vditor-wysiwyg__preview`, itself
// data-render="2"), so it is invisible to BOTH Lute AST walkers → never serialized, markdown round-trips
// byte-identical (see the vmde-lute-features skill). Theme-var driven (`.vmde-diagram-loading` in
// main.css), no palette interaction.

import { diagramErrorTitle } from './diagram-error'

const LOADING_CLASS = 'vmde-diagram-loading'

/** The `.vmde-diagram-loading` placeholder markup for an engine (title from the shared engine → human
 *  name map, e.g. `plantuml` → "PlantUML"; unknown slug falls back to itself). Exported for the unit
 *  test. The title is a static registry constant (never user input), so no escaping is needed. */
export function diagramLoadingHtml(engine: string): string {
  return (
    `<div class="${LOADING_CLASS}" data-render="1">` +
    `<span class="${LOADING_CLASS}__spinner" aria-hidden="true"></span>` +
    `<span class="${LOADING_CLASS}__label">Rendering ${diagramErrorTitle(engine)}…</span>` +
    '</div>'
  )
}

/** Show the loading placeholder in `el` (the engine's preview wrapper), replacing its content. Call
 *  right before kicking off the (async) engine load/first-render. */
export function renderDiagramLoading(el: HTMLElement, engine: string): void {
  el.innerHTML = diagramLoadingHtml(engine)
}

/** Remove any loading placeholder from `el` (idempotent — a no-op if the engine already replaced the
 *  block's innerHTML with its SVG). Call when the real render lands, before theming. */
export function removeDiagramLoading(el: HTMLElement): void {
  el.querySelector(`.${LOADING_CLASS}`)?.remove()
}
