import { requestCaret } from './caret'
import { activeModeElement } from '../util/source-map'

// Reveal-in-Source (task 16): remember the caret inside the editor. When the
// command runs from VS Code chrome (the toolbar button), focus leaves the
// webview iframe and the live selection collapses to the editor start — so the
// raw selection would read as offset 0. We snapshot the last in-editor caret on
// selectionchange and restore it before measuring, so the button and the command
// palette resolve to the SAME caret. Stored as a cloned Range.
let lastEditorRange: Range | null = null

function trackEditorCaret() {
  const v = window.vditor
  if (!v) return
  const editor = activeModeElement(v)
  if (!editor) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const node = sel.anchorNode
  if (!node || !editor.contains(node)) return
  // ignore a caret collapsed to the very start of the editor (the focus-loss
  // artifact we are guarding against) so it can't overwrite a real position
  if (node === editor && sel.anchorOffset === 0 && sel.isCollapsed) return
  lastEditorRange = sel.getRangeAt(0).cloneRange()
}

// Wire the selectionchange snapshot. Called once from main.ts (the caret state is
// a singleton across re-inits — it tracks whatever editor is currently mounted).
export function installEditorCaretTracking(): void {
  document.addEventListener('selectionchange', trackEditorCaret)
}

// The last caret seen INSIDE the editor, without touching the live selection. Task 390 needs it
// because WYSIWYG's link button opens a popover and focuses its input, so by the time the debounced
// edit posts, the live selection is in that input and the edited block can no longer be resolved
// from it.
export function trackedEditorRange(): Range | null {
  return lastEditorRange
}

// Restore the remembered caret when the live selection is missing or collapsed
// to the editor start (focus left the iframe). Returns true if a restore ran.
//
// The write goes through caret.ts's requestCaret (ADR-0007 / task 446) instead of a hand-rolled
// removeAllRanges()/addRange() — this module is one of the six the ADR names as a former direct
// writer. The snapshot mechanism above (trackEditorCaret / lastEditorRange / trackedEditorRange)
// stays here unchanged: it only ever READS the selection, so it's outside the ADR's scope (every
// programmatic selection WRITE), and task 390's link path reads trackedEditorRange() directly.
export function restoreEditorCaretIfLost(): boolean {
  const v = window.vditor
  if (!v || !lastEditorRange) return false
  const editor = activeModeElement(v)
  if (!editor) return false
  const sel = window.getSelection()
  const node = sel && sel.rangeCount > 0 ? sel.anchorNode : null
  const live = node && editor.contains(node)
  const collapsedAtStart =
    node === editor && sel!.anchorOffset === 0 && sel!.isCollapsed
  if (live && !collapsedAtStart) return false // a real caret is present; keep it
  return requestCaret({
    node: lastEditorRange.startContainer,
    offset: lastEditorRange.startOffset,
  })
}
