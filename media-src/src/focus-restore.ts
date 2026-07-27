// Task 389 — the caret disappears after leaving the editor and returning to the vMarkd tab.
//
// MEASURED in a real VS Code, because the three defects that look identical to a user have
// different fixes. What actually happens is the FIRST of them — focus is lost, the selection is not:
//
//   before leaving   activeElement=PRE.vditor-reset  rangeCount=1  offset=246  typing lands
//   after returning  activeElement=BODY              rangeCount=1  offset=246  typing goes nowhere
//
// The panel is created with `retainContextWhenHidden`, so the webview DOM — and with it the DOM
// selection — survives the round trip intact. What does not survive is focus: VS Code hands focus
// back to the webview's BODY, not to the contenteditable the caret lives in. A collapsed Range in an
// unfocused document paints no caret and receives no keystrokes, which is exactly the report: the
// caret is gone, and the place is still right underneath it.
//
// The sequence the frame sees across the round trip is `focusout` → `blur` → `focus`, with
// `activeElement === BODY` already set by the time `focus` fires. So `focus` on the window is the
// signal, and the repair is to put focus back on the editable element and keep the Range that is
// already there.
import { restoreEditorCaretIfLost } from './editor-caret'
import { activeModeElement } from './source-map'

// Anything focusable the user could have deliberately put focus on inside the webview. If focus came
// back to one of these, it is not ours to take — only a bare BODY/HTML (VS Code's default target)
// means "nothing is focused".
const NOT_OURS_TO_TAKE =
  'input, textarea, select, button, [contenteditable="true"], [tabindex]'

function restoreEditorFocus(win: Window): void {
  const vditor = (win as unknown as { vditor?: unknown }).vditor
  if (!vditor) return
  const editor = activeModeElement(vditor)
  if (!editor) return

  const active = win.document.activeElement as HTMLElement | null
  // Already in the editor — the normal case for every focus event that is not a tab return.
  if (active && editor.contains(active)) return
  // Focus landed on something the user can actually interact with (a toolbar input, a dialog):
  // stealing it would be worse than the bug.
  if (
    active &&
    active !== win.document.body &&
    active.closest(NOT_OURS_TO_TAKE)
  )
    return

  // Snapshot the surviving Range BEFORE focusing: focusing a contenteditable is allowed to move the
  // caret to its start, and landing the user at the top of the document is the damaging variant of
  // this bug, not the fix for it.
  const selection = win.getSelection()
  const live =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const saved =
    live && editor.contains(live.startContainer) ? live.cloneRange() : null

  // preventScroll: the view must stay exactly where the user left it — restoring the caret is not a
  // licence to scroll to it (same rule as the toolbar focus-scroll guard, task 71).
  editor.focus({ preventScroll: true })

  if (saved) {
    const sel = win.getSelection()
    // Re-assert only if focusing actually disturbed it; removeAllRanges on an untouched selection
    // would be a pointless selectionchange for every observer downstream.
    const now = sel?.rangeCount ? sel.getRangeAt(0) : null
    if (
      !now ||
      now.startOffset !== saved.startOffset ||
      now.startContainer !== saved.startContainer
    ) {
      try {
        sel?.removeAllRanges()
        sel?.addRange(saved)
      } catch {}
    }
    return
  }
  // No Range survived (a re-created webview, or focus was never in the editor): fall back to the
  // caret snapshot editor-caret.ts keeps on selectionchange for exactly this class of focus loss.
  restoreEditorCaretIfLost()
}

/**
 * Put focus (and therefore the caret) back on the editable surface whenever the webview regains
 * focus with nothing focused inside it. Called once from main.ts; the listener is on the window, so
 * it outlives every re-init.
 */
export function installFocusRestore(win: Window): void {
  win.addEventListener('focus', () => {
    // One frame later: VS Code sets `activeElement` to BODY as part of handing focus back, and a
    // synchronous restore here can be undone by the rest of that handover.
    win.requestAnimationFrame(() => restoreEditorFocus(win))
  })
}
