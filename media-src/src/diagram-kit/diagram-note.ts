// Informational note APPENDED to a diagram block (task 140). Unlike diagram-error.ts (replaces the
// block on a failure) and diagram-loading.ts (a placeholder during load), this sits ALONGSIDE a
// successful render to flag a non-fatal caveat. The case that motivated it: a single ` ```plantuml `
// fence holding several `@startuml…@enduml` diagrams — the TeaVM engine renders only the FIRST
// (verified, task 140 Step 0), so the rest would vanish SILENTLY. The note makes that visible
// ("put each in its own code block") instead of dropping diagrams with no signal.
//
// Lute-safety: same guarantee as diagram-error.ts — the note carries data-render="1" and lives inside
// an engine's preview half (data-render="2"), so it is invisible to both Lute AST walkers → never
// serialized, markdown round-trips byte-identical. Theme-var driven (.vmde-diagram-note in main.css).

const NOTE_CLASS = 'vmde-diagram-note'

// Escape &/</> so a message that ever includes user-derived text can't inject HTML (& first).
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The `.vmde-diagram-note` info-note markup for a message (escaped). Exported for the unit test. */
export function diagramNoteHtml(message: string): string {
  return (
    `<div class="${NOTE_CLASS}" data-render="1">` +
    // Plain ASCII "i" drawn as a circular badge in CSS — a unicode ⓘ/ℹ tofus in the webview font.
    `<span class="${NOTE_CLASS}__icon" aria-hidden="true">i</span>` +
    `<span class="${NOTE_CLASS}__msg">${escapeHtml(message)}</span></div>`
  )
}

/** Append the info note to `el` (below its render). Idempotent: a prior note (direct child) is removed
 *  first, so a re-render / live re-theme re-adds exactly one, never stacks duplicates. */
export function appendDiagramNote(el: HTMLElement, message: string): void {
  el.querySelector(`:scope > .${NOTE_CLASS}`)?.remove()
  el.insertAdjacentHTML('beforeend', diagramNoteHtml(message))
}
