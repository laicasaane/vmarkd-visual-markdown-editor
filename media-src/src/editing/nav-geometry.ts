// Pure geometry helpers shared by the three "step the caret across a void or non-editable
// block" keydown handlers — callout-nav.ts, gap-nav.ts, gap-paragraph.ts's setupTrailingNav.
// Extracted (task 473, `jscpd`'s duplication baseline) out of all three, which each carried their
// own byte-identical (topLevelBlock) or brace-style-only-different (caretLineRect) copy: the
// three handlers are deliberately parallel structure (see each file's own header — collapsing
// their keydown-guard/edge-detection SHAPE behind one abstraction would trade "here is what
// ArrowDown does next to a collapsed callout" for a metric), but these two functions are pure —
// no side effects, no caret writes — and were never anything but the same DOM math three times
// over. No caret writes here; requestCaret (caret.ts) still owns every actual Range write.

// The top-level block (direct child of the editor) that contains `node`.
export function topLevelBlock(
  editor: HTMLElement,
  node: Node,
): HTMLElement | null {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement
  while (el?.parentElement && el.parentElement !== editor) {
    el = el.parentElement
  }
  return el && el.parentElement === editor ? el : null
}

// The caret's line box. A collapsed range can report a zero rect at element boundaries —
// expand it by one character (forward, else backward) for a measurable line rect; last
// resort: the container element's box.
export function caretLineRect(range: Range): DOMRect | null {
  const own = range.getBoundingClientRect()
  if (own.height > 0) return own
  const t = range.startContainer
  if (t.nodeType === Node.TEXT_NODE) {
    try {
      const c = range.cloneRange()
      const data = (t as Text).data
      if (range.startOffset < data.length) c.setEnd(t, range.startOffset + 1)
      else if (range.startOffset > 0) c.setStart(t, range.startOffset - 1)
      const rects = c.getClientRects()
      if (rects.length) return rects[rects.length - 1]
    } catch {
      // fall through to the element box
    }
  }
  const el = (
    t.nodeType === Node.ELEMENT_NODE ? t : t.parentElement
  ) as HTMLElement | null
  return el ? el.getBoundingClientRect() : null
}
