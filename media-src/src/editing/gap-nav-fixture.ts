// Shared jsdom scaffolding for the two gap-cursor MOVER tests (gap-nav.test.ts, gap-click.test.ts).
// Both modules read real layout, and jsdom has none — every rect is zero, which the movers correctly
// read as "unmeasurable, do nothing", so without stubbed geometry neither could be tested at all
// below the harness. Stubbing it here (one block per row, a fixed gap between rows) is what lets the
// DECISIONS be unit-tested; the geometry itself is still only proven at the harness/webview layers.
// Not a *.test.ts file on purpose — vitest would collect it as a suite with no tests.

export const BLOCK_H = 20
const STRIP_H = 10 // the empty strip between two rows, where a click can land

const rect = (top: number, height: number): DOMRect =>
  ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect

export const rowTop = (i: number): number => i * (BLOCK_H + STRIP_H)
// The middle of the strip between row `i` and row `i + 1`.
export const stripY = (i: number): number => rowTop(i) + BLOCK_H + STRIP_H / 2

// Give every top-level block a row, and make any Range report the row of the block it sits in — so
// a caret is always on its block's only line, i.e. on BOTH its top and bottom edge.
function stubLayout(editor: HTMLElement): void {
  const blockOf = (node: Node | null): HTMLElement | null => {
    let el =
      node?.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : (node?.parentElement ?? null)
    while (el?.parentElement && el.parentElement !== editor)
      el = el.parentElement
    return el?.parentElement === editor ? el : null
  }
  const indexOf = (el: HTMLElement | null) =>
    el ? Array.from(editor.children).indexOf(el) : -1
  editor.getBoundingClientRect = () => rect(0, rowTop(editor.childElementCount))
  const patchChildren = () => {
    for (const child of Array.from(editor.children) as HTMLElement[]) {
      child.getBoundingClientRect = () => rect(rowTop(indexOf(child)), BLOCK_H)
    }
  }
  patchChildren()
  // Blocks are spliced during the very handlers under test — re-patch on every mutation so a
  // freshly inserted gap paragraph has a row too.
  new MutationObserver(patchChildren).observe(editor, { childList: true })
  Range.prototype.getBoundingClientRect = function getRect(
    this: Range,
  ): DOMRect {
    const i = indexOf(blockOf(this.startContainer))
    return i < 0 ? rect(0, 0) : rect(rowTop(i), BLOCK_H)
  }
}

// A minimal stand-in for `window.vditor` — caret.ts's requestCaret binds its intent to whatever
// activeModeElement() returns, and refuses to write when that is null.
function installFakeVditor(editor: HTMLElement): void {
  ;(window as unknown as { vditor?: unknown }).vditor = {
    vditor: { currentMode: 'ir', ir: { element: editor } },
  }
}

export function editorWithBlocks(html: string): HTMLElement {
  const editor = document.createElement('div')
  editor.innerHTML = html
  document.body.replaceChildren(editor)
  stubLayout(editor)
  installFakeVditor(editor)
  return editor
}

// Put the caret at the end of the first text node inside `block`.
export function caretIn(block: HTMLElement): void {
  const text = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode()
  const r = document.createRange()
  if (text) r.setStart(text, (text as Text).data.length)
  else r.setStart(block, 0)
  r.collapse(true)
  const s = window.getSelection()
  s?.removeAllRanges()
  s?.addRange(r)
}

// The block chain as `tag/type` labels plus which one holds the caret — the same compact shape the
// harness specs assert on.
export function chain(editor: HTMLElement): string {
  return (Array.from(editor.children) as HTMLElement[])
    .map((c) => c.getAttribute('data-type') || c.tagName.toLowerCase())
    .join(' | ')
}

export function caretBlockIndex(editor: HTMLElement): number {
  const s = window.getSelection()
  if (!s?.rangeCount) return -1
  let el: HTMLElement | null =
    s.getRangeAt(0).startContainer.nodeType === Node.ELEMENT_NODE
      ? (s.getRangeAt(0).startContainer as HTMLElement)
      : s.getRangeAt(0).startContainer.parentElement
  while (el?.parentElement && el.parentElement !== editor) el = el.parentElement
  return el?.parentElement === editor
    ? Array.from(editor.children).indexOf(el)
    : -1
}

export const CODE =
  '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>'
export const HR = '<hr data-block="0">'
export const PARA = '<p data-block="0">para</p>'
