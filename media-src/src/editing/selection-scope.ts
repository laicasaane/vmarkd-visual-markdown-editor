// Task 506 — Word/Word-processor behaviour for the promoted inline-format keys: pressing
// Ctrl+B / Ctrl+I / Ctrl+D (bold / italic / strike) with a COLLAPSED caret inside a word must wrap
// THAT WORD (`Hello **world**.`), not insert open markers at the caret. Vditor's own collapsed
// branches (`**<wbr>**` in IR, an empty <strong>/<em>/<s> in WYSIWYG) are right for "type after
// pressing the key", wrong for the word you're standing in.
//
// Why a capture-phase document CLICK listener rather than a Vditor TS patch: both the toolbar
// buttons and the hotkey path (message-router's `trigger-toolbar-hotkey` dispatches a synthetic
// click on the same button) converge on Vditor's MenuItem bubble-phase click handler, which calls
// `getEditorRange(vditor)` → `getSelection().getRangeAt(0)` LIVE (selection.ts). Expanding the
// selection in capture, before that bubble handler runs, makes Vditor's existing NON-collapsed
// branches do the right thing in every mode (IR wraps `**word**`, WYSIWYG execCommands the word,
// and both toggle-off paths remove the strong/em/s from the word) — zero vendored changes. Same
// capture-phase shape as escape-toolbar.ts.
//
// Two real-webview measurements shape the expansion (task 506):
//  1. "No selection" must be tested as `range.toString() === ''`, NOT `sel.isCollapsed` — Vditor's
//     caret restoration leaves the caret as a NON-collapsed empty range (start === end, no
//     `collapse()`), which is why Vditor's own handlers test `range.toString() === ""`.
//  2. A mid-word caret sits on a TEXT-NODE boundary: Vditor splits the containing text node at the
//     caret, so "world" becomes the adjacent nodes "wo" | "rld". The word must be re-joined ACROSS
//     direct text siblings (never across elements — IR markers are spans, so crossing only text
//     siblings can never swallow a `**` marker).
import { invalidateCaret, requestCaret } from './caret'
import { activeModeElement } from '../util/source-map'
import { hasClosestBlock } from 'vditor/src/ts/util/hasClosest'
import { guardComposition } from '../util/caret-gesture'
import { innerVditor } from '../util/inner-vditor'

// Exactly the three formats the user named (task 506 scope decision). `inline-code` (Ctrl+G) keeps
// its collapsed-caret behaviour — deliberately not expanded here; see the task file.
const WORD_FORMAT_BUTTONS: ReadonlySet<string> = new Set([
  'bold',
  'italic',
  'strike',
])

// Opening marker length in the IR DOM for each word format. Wrapping shifts the word (and a caret
// inside it) by exactly this many text characters (`Hello world.` → `Hello **world**.` moves the
// caret +2); unwrapping shifts it back by the same amount.
const FORMAT_MARKER_LENGTH: Record<string, number> = {
  bold: 2, // **
  italic: 1, // *
  strike: 2, // ~~
}

const FORMAT_INLINE_TAG: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
}

const WS = /\s/
// Punctuation that ends a sentence/clause is not part of the word it trails — `Hello world.` with a
// caret in "world" must bold `world`, not `world.` (Word-style). Deliberately not a full
// `\p{P}` set: `*`, `_`, `~`, backtick etc. are markdown markers and belong to neighbouring
// formats, not to a word boundary decision.
const TRAILING_PUNCT = /[.,;:!?)\]}>"'”’…]/

/**
 * The maximal run of non-whitespace touching `offset` in `text`, or null when the caret is not in
 * (or immediately at the edge of) a word. `offset` is exclusive: chars before it are the left side,
 * chars at/after it the right side. A caret parked between two whitespace chars — or in an empty
 * text node — walks to `start === end` and yields null. Pure, no DOM (unit-tested directly).
 */
export function wordRangeInText(
  text: string,
  offset: number,
): readonly [number, number] | null {
  if (offset < 0 || offset > text.length) return null
  let start = offset
  while (start > 0 && !WS.test(text[start - 1]!)) start--
  let end = offset
  while (end < text.length && !WS.test(text[end]!)) end++
  return start === end ? null : [start, end]
}

// Only DIRECT text siblings count as word continuations. Crossing an element is never right: IR
// renders `**` markers as <span>s, so a word split by Vditor's caret handling is always adjacent
// text nodes, and a genuine source-level word split (a marker element mid-word) should not be
// re-joined.
function prevTextNode(node: Node): Text | null {
  const p = node.previousSibling
  return p?.nodeType === Node.TEXT_NODE ? (p as Text) : null
}

function nextTextNode(node: Node): Text | null {
  const n = node.nextSibling
  return n?.nodeType === Node.TEXT_NODE ? (n as Text) : null
}

function insideMarker(node: Node): boolean {
  const el = node.parentElement
  return (
    !!el &&
    (el.hasAttribute?.('data-marker') ||
      (el.getAttribute('class') ?? '').includes('vditor-ir__marker'))
  )
}

// The absolute character offset of `sel`'s caret within `editor` (0-based, every text node
// depth-first, IR marker spans included). -1 when there is no selection inside the editor.
export function caretTextOffset(editor: Node, sel: Selection): number {
  if (sel.rangeCount === 0) return -1
  const range = sel.getRangeAt(0)
  if (!editor.contains(range.startContainer)) return -1
  const before = range.cloneRange()
  before.selectNodeContents(editor)
  before.setEnd(range.startContainer, range.startOffset)
  return before.toString().length
}

// Is `node` inside an inline format of the given type? Mirrors what makes Vditor's remove-branch
// run — the caret is inside a `data-type="strong"/em/s` element, so the click unwraps rather than
// wraps, and the caret must shift the OTHER way.
export function isInsideInlineFormat(node: Node, type: string): boolean {
  const tag = FORMAT_INLINE_TAG[type]
  const el = node.parentElement
  if (!tag || !el) return false
  return !!el.closest?.(`[data-type="${tag}"], ${tag}`)
}

// Extend a word's LEFT boundary across text siblings: while the boundary sits at a node's START
// and the previous sibling's text ends without whitespace, the word continues into it.
function extendLeft(
  caret: Text,
  startOff: number,
): { node: Text; off: number } {
  let node = caret
  let off = startOff
  while (off === 0) {
    const prev = prevTextNode(node)
    if (
      !prev ||
      prev.data.length === 0 ||
      WS.test(prev.data[prev.data.length - 1]!)
    ) {
      break
    }
    node = prev
    let i = prev.data.length
    while (i > 0 && !WS.test(prev.data[i - 1]!)) i--
    off = i
  }
  return { node, off }
}

// Extend a word's RIGHT boundary across text siblings: while the boundary sits at a node's END and
// the next sibling's text starts without whitespace, the word continues into it.
function extendRight(caret: Text, endOff: number): { node: Text; off: number } {
  let node = caret
  let off = endOff
  while (off === node.data.length) {
    const next = nextTextNode(node)
    if (!next || next.data.length === 0 || WS.test(next.data[0]!)) break
    node = next
    let i = 0
    while (i < next.data.length && !WS.test(next.data[i]!)) i++
    off = i
  }
  return { node, off }
}

// Trim trailing punctuation; if that empties the boundary node entirely, step back to the previous
// text sibling and keep trimming there.
function trimTrailingPunct(
  right: Text,
  rightOff: number,
): { node: Text; off: number } {
  let node = right
  let off = rightOff
  while (off > 0 && TRAILING_PUNCT.test(node.data[off - 1]!)) off--
  while (off === 0) {
    const prev = prevTextNode(node)
    if (!prev) return { node, off }
    node = prev
    off = prev.data.length
    while (off > 0 && TRAILING_PUNCT.test(node.data[off - 1]!)) off--
  }
  return { node, off }
}

/**
 * Expand a "no selected text" caret to the word it stands in. Returns true if it expanded.
 *
 * "No selection" is `range.toString() === ''`, NOT `sel.isCollapsed` — see the file header (Vditor
 * represents a caret as a non-collapsed empty range). Scope guards: only text-node carets (an
 * element-container caret sits on a marker/boundary where cross-node walking is unreliable), only
 * inside `editor`, only when a word actually touches the caret. A real (non-empty) selection passes
 * through untouched — formatting it is already correct.
 */
export function expandCollapsedSelectionToWord(
  sel: Selection,
  editor: Node,
): boolean {
  if (sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (range.toString() !== '') return false
  const start = range.startContainer
  if (start.nodeType !== Node.TEXT_NODE || insideMarker(start)) return false
  if (!editor.contains(start)) return false
  const caret = start as Text
  const inner = wordRangeInText(caret.data, range.startOffset)
  if (!inner) return false

  const rightBound = extendRight(caret, inner[1])
  const right = trimTrailingPunct(rightBound.node, rightBound.off)
  const left = extendLeft(caret, inner[0])
  // The token vanished (all-punctuation "word", or a caret between two whitespace chars).
  if (left.node === right.node && left.off === right.off) return false

  range.setStart(left.node, left.off)
  range.setEnd(right.node, right.off)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

/**
 * Install the capture-phase click listener that word-expands before a bold/italic/strike click
 * runs. Capture is required: it must run before Vditor's MenuItem bubble-phase handler reads the
 * range. Idempotent across re-inits (each call binds its own listener; the returned teardown
 * removes exactly that one). `win` mirrors `setupFormatHotkeyGuard`'s signature for testability.
 */
// Defer a caret restore until after Vditor's synchronous click handler + re-render have run, then
// shift the caret back to its original position within the wrapped word. Vditor's wrap moves the
// caret past the closing marker; the word (and a caret inside it) shifts by the opening marker's
// length on wrap, and back on unwrap. requestCaret's own rAF re-assertion covers any async tail,
// and the next real gesture invalidates the intent (ADR-0007).
function scheduleCaretRestore(
  win: Window & typeof globalThis,
  type: string,
  caretOffset: number,
  removing: boolean,
): void {
  const delta = (removing ? -1 : 1) * (FORMAT_MARKER_LENGTH[type] ?? 0)
  win.setTimeout(() => {
    requestCaret({ textOffset: caretOffset + delta })
  }, 0)
}

export function installFormatWordExpand(
  win: Window & typeof globalThis = window,
): () => void {
  const onToolbarClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof win.Element)) return
    const button = target.closest('button[data-type]')
    if (!button) return
    const type = button.getAttribute('data-type') ?? ''
    if (!WORD_FORMAT_BUTTONS.has(type)) return
    const editor = activeModeElement(win.vditor)
    const sel = win.getSelection()
    if (!editor || !sel || sel.rangeCount === 0) return
    // Capture the caret BEFORE the expansion mutates the selection: its absolute char offset, and
    // whether the click will REMOVE (caret inside an already-formatted word) rather than add.
    const caretOffset = caretTextOffset(editor, sel)
    if (caretOffset < 0) return
    const removing = isInsideInlineFormat(
      sel.getRangeAt(0).startContainer,
      type,
    )
    if (!expandCollapsedSelectionToWord(sel, editor)) return
    scheduleCaretRestore(win, type, caretOffset, removing)
  }
  win.document.addEventListener('click', onToolbarClick, true)
  return () => win.document.removeEventListener('click', onToolbarClick, true)
}

type StructuralScopeKind = 'inline' | 'cell' | 'block' | 'document'

export interface StructuralScope {
  kind: StructuralScopeKind
  element: HTMLElement
  range: Range
}

function elementAt(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

function nodeIsTransient(node: Node): boolean {
  return (
    node instanceof HTMLElement &&
    (node.classList.contains('vditor-ir__marker') ||
      node.hasAttribute('data-render'))
  )
}

/** Select the first contiguous authored-content run inside an inline IR node. Marker spans and
 * renderer/helper DOM are structural chrome, so Ctrl+E never includes them in type-to-replace. */
export function inlineContentRange(node: HTMLElement): Range | null {
  let first: Node | null = null
  let last: Node | null = null
  for (const child of Array.from(node.childNodes)) {
    if (nodeIsTransient(child)) {
      if (first) break
      continue
    }
    first ??= child
    last = child
  }
  if (!first || !last) return null
  const range = document.createRange()
  range.setStartBefore(first)
  range.setEndAfter(last)
  return range
}

function contentsRange(element: HTMLElement): Range {
  const range = document.createRange()
  range.selectNodeContents(element)
  return range
}

function blockRange(element: HTMLElement): Range {
  const range = document.createRange()
  if (element.tagName === 'TABLE') range.selectNode(element)
  else range.selectNodeContents(element)
  return range
}

export function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.startContainer === b.startContainer &&
    a.startOffset === b.startOffset &&
    a.endContainer === b.endContainer &&
    a.endOffset === b.endOffset
  )
}

function structuralBlock(
  node: Node,
  cell: HTMLElement | null,
): HTMLElement | null {
  if (cell) {
    const table = cell.closest<HTMLElement>('table')
    if (table) return table
  }
  const block = hasClosestBlock(node)
  return block || null
}

/** The strict widening ladder under a live IR range: inline authored content → table cell →
 * Markdown block → document. Duplicate scopes (for example a plain block with no inline node) are
 * omitted, so every repeated chord makes visible progress. */
export function structuralScopes(
  editor: HTMLElement,
  range: Range,
): StructuralScope[] {
  if (
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  )
    return []
  const start = elementAt(range.startContainer)
  if (!start) return []
  const scopes: StructuralScope[] = []
  const inline = start.closest<HTMLElement>(
    '.vditor-ir__node:not([data-block])',
  )
  if (inline && editor.contains(inline)) {
    const inlineRange = inlineContentRange(inline)
    if (inlineRange)
      scopes.push({ kind: 'inline', element: inline, range: inlineRange })
  }
  const cell = start.closest<HTMLElement>('td, th')
  if (cell && editor.contains(cell))
    scopes.push({ kind: 'cell', element: cell, range: contentsRange(cell) })
  const block = structuralBlock(range.startContainer, cell)
  if (block && editor.contains(block))
    scopes.push({ kind: 'block', element: block, range: blockRange(block) })
  scopes.push({
    kind: 'document',
    element: editor,
    range: contentsRange(editor),
  })
  return scopes.filter(
    (scope, index) =>
      !scopes
        .slice(0, index)
        .some((earlier) => rangesEqual(earlier.range, scope.range)),
  )
}

function applySelection(
  win: Window & typeof globalThis,
  range: Range,
): boolean {
  const selection = win.getSelection()
  if (!selection) return false
  selection.removeAllRanges()
  selection.addRange(range)
  const editor = activeModeElement(win.vditor)
  editor?.focus({ preventScroll: true })
  return true
}

function currentIrSelection(
  win: Window & typeof globalThis,
): { editor: HTMLElement; range: Range } | null {
  if (innerVditor()?.currentMode !== 'ir') return null
  const editor = activeModeElement(win.vditor)
  const selection = win.getSelection()
  if (!editor || !selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  )
    return null
  return { editor, range }
}

function fenceSourceRange(range: Range): Range | null {
  const start = elementAt(range.startContainer)
  const block = start?.closest<HTMLElement>('[data-type="code-block"]')
  const code = block?.querySelector<HTMLElement>(
    ':scope > .vditor-ir__marker--pre > code',
  )
  return code?.contains(range.startContainer) ? contentsRange(code) : null
}

function selectNextScope(
  win: Window & typeof globalThis,
  scopes: readonly StructuralScope[],
  current: Range,
): boolean {
  const next = scopes.find((scope) => !rangesEqual(scope.range, current))
  return next ? applySelection(win, next.range) : false
}

function handleSelectAll(win: Window & typeof globalThis): boolean {
  const current = currentIrSelection(win)
  if (!current) return false
  const fence = fenceSourceRange(current.range)
  // Preserve Vditor's PRE stage-0 semantics but own the selection in capture: its bubble handler is
  // nondeterministic from a programmatic caret in Chromium (Task 191 recorded the same empty-range
  // outcome). The next captured chord widens to its Markdown block, then the document.
  if (fence && !rangesEqual(fence, current.range))
    return applySelection(win, fence)
  const scopes = structuralScopes(current.editor, current.range).filter(
    (scope) => scope.kind === 'block' || scope.kind === 'document',
  )
  return selectNextScope(win, scopes, current.range)
}

function handleScopeSelect(win: Window & typeof globalThis): boolean {
  const current = currentIrSelection(win)
  if (!current) return false
  return selectNextScope(
    win,
    structuralScopes(current.editor, current.range),
    current.range,
  )
}

function handleEscape(win: Window & typeof globalThis): boolean {
  const current = currentIrSelection(win)
  if (!current) return false
  const start = elementAt(current.range.startContainer)
  const expanded = start?.closest<HTMLElement>(
    '.vditor-ir__node--expand:not([data-block])',
  )
  if (expanded && current.editor.contains(expanded)) {
    const parent = expanded.parentNode
    const index = parent ? Array.from(parent.childNodes).indexOf(expanded) : -1
    if (parent && index >= 0) {
      requestCaret({ node: parent, offset: index + 1 })
      invalidateCaret()
    }
    expanded.classList.remove('vditor-ir__node--expand')
    return true
  }
  const block = structuralScopes(current.editor, current.range).find(
    (scope) => scope.kind === 'block',
  )
  if (block && !rangesEqual(block.range, current.range))
    return applySelection(win, block.range)
  // There is no structural-selection blur setting. Preserve Task 456's established Escape→Tab
  // route to the toolbar instead of inventing a third-stage option or leaking Escape to VS Code.
  return Boolean(block)
}

function consumeStructuralKey(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

type StructuralKeyAction = 'select-all' | 'select-scope' | 'escape'

function structuralKeyAction(event: KeyboardEvent): StructuralKeyAction | null {
  if (guardComposition(event) || event.altKey || event.shiftKey) return null
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (mod && key === 'a') return 'select-all'
  if (mod && key === 'e') return 'select-scope'
  return !mod && event.key === 'Escape' ? 'escape' : null
}

/** Install IR-only structural selection. Ctrl+D and Ctrl+L deliberately remain Vditor's promoted
 * strike/list shortcuts; this task predates those shipped bindings and must not steal them. */
export function installStructuralSelection(
  win: Window & typeof globalThis = window,
): () => void {
  const onKeydown = (event: KeyboardEvent): void => {
    const action = structuralKeyAction(event)
    if (action === 'select-all') {
      if (handleSelectAll(win)) consumeStructuralKey(event)
      return
    }
    if (action === 'select-scope') {
      if (handleScopeSelect(win)) consumeStructuralKey(event)
      return
    }
    if (action === 'escape' && handleEscape(win)) consumeStructuralKey(event)
  }
  const onClick = (event: MouseEvent): void => {
    if (event.detail !== 3 || !(event.target instanceof win.Node)) return
    const current = currentIrSelection(win)
    if (!current?.editor.contains(event.target)) return
    const block = structuralBlock(
      event.target,
      elementAt(event.target)?.closest('td, th') ?? null,
    )
    if (block && current.editor.contains(block))
      applySelection(win, blockRange(block))
  }
  win.document.addEventListener('keydown', onKeydown, true)
  win.document.addEventListener('click', onClick, true)
  return () => {
    win.document.removeEventListener('keydown', onKeydown, true)
    win.document.removeEventListener('click', onClick, true)
  }
}
