// Task 385 — Ctrl+C / Ctrl+X with nothing selected.
//
// In VS Code, and in every editor a VS Code user comes from, a collapsed Ctrl+C copies the current
// LINE and a collapsed Ctrl+X cuts it. vMarkd did neither. Worse, both of Vditor's collapsed paths
// are actively wrong (probe-confirmed in task 191, then left in place pending this decision):
//
//   - Ctrl+C in split mode WIPED the clipboard. `sv`'s copy handler writes `getSelectText(...)` to
//     text/plain with no empty-selection guard, so an empty selection sets it to "". Copy, then
//     paste, and nothing comes back — the literal "copy/paste doesn't work".
//   - Ctrl+X anywhere was a STEALTH BACKSPACE. `cutEvent` runs `execCommand("delete")`
//     unconditionally, even when the copy half early-returned, so it silently ate the character
//     before the caret.
//
// Rather than reimplement copy or cut, this expands the SELECTION to the current block just before
// Vditor's own handler runs (installed via the esbuild patches in esbuild-shared.mjs). Vditor then
// serializes the block through its normal path — which is what makes the copied text real markdown
// rather than DOM text — and the cut's own delete removes exactly what was copied. One small helper
// buys line-copy, line-cut, and the removal of both defects.
//
// "Line" means the containing BLOCK (paragraph, heading, list item, table row, code block…), which
// is the markdown analogue of a VS Code source line: a soft-wrapped paragraph is one line of
// markdown however many rows it occupies on screen.

const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, tr, pre, .vditor-ir__node, .vditor-wysiwyg__block, div[data-block]'

/**
 * If the selection inside `editorElement` is collapsed, grow it to cover the block the caret sits
 * in. Returns whether there is now something to copy — `false` means the caller must NOT delete
 * anything, which is what keeps a collapsed cut from behaving like a backspace.
 */
export function expandToLine(editorElement: HTMLElement | null): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  if (!range.collapsed) return true
  if (!editorElement) return false

  // The caret must actually be inside this editor — a copy fired while focus sits elsewhere
  // (the toolbar, an outline entry) must not silently grab a block.
  const anchor =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  if (!anchor || !editorElement.contains(anchor)) return false

  const block = anchor.closest(BLOCK_SELECTOR)
  // `closest` can walk out of the editor (the editor element itself matches `div[data-block]` in
  // some modes); anything at or above the editor is not a line.
  if (!block || block === editorElement || !editorElement.contains(block))
    return false
  if ((block.textContent ?? '') === '') return false

  const lineRange = document.createRange()
  lineRange.selectNodeContents(block)
  selection.removeAllRanges()
  selection.addRange(lineRange)
  return true
}

/** The editable surface the caret is in, whichever mode is live. */
function activeEditor(doc: Document): HTMLElement | null {
  const active = doc.activeElement
  if (!active) return null
  return (active.closest('.vditor-ir, .vditor-wysiwyg, .vditor-sv') ??
    null) as HTMLElement | null
}

/**
 * Why this has to run on KEYDOWN and not in the copy/cut handler: with a collapsed selection
 * Chromium does not dispatch a `copy` event at all — there is nothing to copy, so the browser
 * never asks. Vditor's handler (and therefore any expansion inside it) simply never runs, which
 * is why a collapsed Ctrl+C did nothing at all in IR and WYSIWYG. Expanding the selection BEFORE
 * the browser makes that decision turns the keystroke into an ordinary copy of a real selection,
 * and every downstream handler — Vditor's markdown serializer included — behaves normally.
 *
 * Deliberately does NOT preventDefault or stop propagation: the whole point is to let the native
 * copy/cut proceed, just with something selected.
 */
export function installClipboardLine(win: Window & typeof globalThis): void {
  ;(win as unknown as Record<string, unknown>).__vmarkdExpandToLine = (
    editorElement: HTMLElement | null,
  ) => {
    try {
      return expandToLine(editorElement)
    } catch {
      // Never let a clipboard helper break copy/cut. Returning true keeps Vditor's own behaviour.
      return true
    }
  }

  win.document.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod || event.altKey) return
      // COPY only. Cut is deliberately excluded: expanding there makes the browser cut natively
      // AND leaves Vditor's own deferred `execCommand("delete")` to fire against a selection that
      // has since collapsed, which deletes part of the block. A collapsed cut is instead made
      // INERT by the cutEvent patch — safe and predictable, where before it silently ate a
      // character. Line-cut parity is left as follow-up work rather than shipped half-done.
      if (event.key.toLowerCase() !== 'c') return
      const selection = win.getSelection()
      if (!selection || selection.rangeCount === 0) return
      if (!selection.getRangeAt(0).collapsed) return
      try {
        expandToLine(activeEditor(win.document))
      } catch {
        /* a failed expansion just leaves the keystroke as it was */
      }
    },
    true,
  )
}
