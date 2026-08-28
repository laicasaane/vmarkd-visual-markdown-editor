import { rewrapMarkdownRange, type RewrapResult } from './rewrap-markdown'
import { requestCaret } from './caret'
import { restoreEditorCaretIfLost } from './editor-caret'
import { findScroller } from '../chrome/toolbar-scroll-guard'
import { innerVditor, type InnerVditor } from '../util/inner-vditor'
import { activeModeElement } from '../util/source-map'

export interface SourceSelection {
  markdown: string
  startOffset: number
  endOffset: number
  caretOffset: number
}

interface DomSelectionInput {
  editor: HTMLElement
  range: Range
  serialize: (html: string) => string
}

interface RewrapTransactionDeps {
  checkpointUndo: () => void
  applyMarkdown: (
    markdownWithCaret: string,
    caretMarker: string,
    result: RewrapResult,
  ) => boolean
  readScroll: () => number
  restoreScroll: (scrollTop: number) => void
  sync: () => void
}

const SOURCE_START_BASE = '\uE100VMARKD_REWRAP_START'
const SOURCE_END_BASE = '\uE101VMARKD_REWRAP_END'
const RENDER_CARET_BASE = '\uE102VMARKD_REWRAP_RENDER_CARET'

interface RewrapCommandDeps {
  column: number | undefined
  setApplying: (applying: boolean) => void
  invalidate: () => void
  scheduleSync: () => void
  onError: (error: unknown) => void
}

function uniqueMarker(source: string, base: string): string {
  let marker = base
  while (source.includes(marker)) marker += '_'
  return marker
}

function removeMarkerNode(node: Text): void {
  node.remove()
}

/**
 * Map a live DOM Range to Markdown offsets by inserting collision-free text markers through the
 * same mode serializer production uses. Removing the marker nodes restores byte-identical HTML;
 * deliberately do not normalize adjacent text nodes because the saved Range may still point into
 * one of them and the editor's next normal spin will normalize its own DOM.
 */
export function sourceSelectionFromDom(
  input: DomSelectionInput,
): SourceSelection | null {
  const { editor, range, serialize } = input
  if (
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  ) {
    return null
  }
  const source = editor.textContent ?? ''
  const startMarker = uniqueMarker(source, SOURCE_START_BASE)
  const endMarker = uniqueMarker(source + startMarker, SOURCE_END_BASE)
  const collapsed = range.collapsed
  const endNode = document.createTextNode(endMarker)
  const startNode = document.createTextNode(startMarker)
  try {
    if (!collapsed) {
      const endRange = range.cloneRange()
      endRange.collapse(false)
      endRange.insertNode(endNode)
    }
    const startRange = range.cloneRange()
    startRange.collapse(true)
    startRange.insertNode(startNode)
    const marked = serialize(editor.innerHTML)
    const startOffset = marked.indexOf(startMarker)
    if (startOffset < 0) return null
    const markedWithoutStart =
      marked.slice(0, startOffset) +
      marked.slice(startOffset + startMarker.length)
    if (collapsed) {
      return {
        markdown: markedWithoutStart,
        startOffset,
        endOffset: startOffset,
        caretOffset: startOffset,
      }
    }
    const endOffset = markedWithoutStart.indexOf(endMarker)
    if (endOffset < startOffset) return null
    return {
      markdown:
        markedWithoutStart.slice(0, endOffset) +
        markedWithoutStart.slice(endOffset + endMarker.length),
      startOffset,
      endOffset,
      caretOffset: endOffset,
    }
  } finally {
    removeMarkerNode(startNode)
    removeMarkerNode(endNode)
  }
}

export function applyRewrapTransaction(
  selection: SourceSelection,
  column: number,
  deps: RewrapTransactionDeps,
): boolean {
  const result = rewrapMarkdownRange(
    selection.markdown,
    selection.startOffset,
    selection.endOffset,
    selection.caretOffset,
    column,
  )
  if (!result.changed) return false

  const marker = uniqueMarker(result.markdown, RENDER_CARET_BASE)
  const markedMarkdown =
    result.markdown.slice(0, result.caretOffset) +
    marker +
    result.markdown.slice(result.caretOffset)
  const scrollTop = deps.readScroll()
  deps.checkpointUndo()
  if (!deps.applyMarkdown(markedMarkdown, marker, result)) {
    deps.restoreScroll(scrollTop)
    return false
  }
  deps.checkpointUndo()
  deps.restoreScroll(scrollTop)
  deps.sync()
  return true
}

function serializeForMode(inner: InnerVditor, html: string): string {
  if (inner.currentMode === 'ir') {
    return inner.lute?.VditorIRDOM2Md(html) ?? ''
  }
  if (inner.currentMode === 'wysiwyg') {
    return inner.lute?.VditorDOM2Md(html) ?? ''
  }
  const clone = document.createElement('div')
  clone.innerHTML = html
  return clone.textContent ?? ''
}

function sourceSelectionForEditor(win: Window): SourceSelection | null {
  const vditor = win.vditor
  const inner = innerVditor()
  const editor = vditor ? activeModeElement(vditor) : null
  restoreEditorCaretIfLost()
  const selection = win.getSelection()
  if (
    !vditor ||
    !inner ||
    !editor ||
    !selection ||
    selection.rangeCount === 0
  ) {
    return null
  }
  const mapped = sourceSelectionFromDom({
    editor,
    range: selection.getRangeAt(0),
    serialize: (html) => serializeForMode(inner, html),
  })
  // The marker round-trip must describe the exact same Markdown the command will replace. A
  // mismatch means this DOM shape is context-sensitive or ambiguous; fail closed instead of
  // applying source offsets to a different byte string.
  return mapped?.markdown === vditor.getValue() ? mapped : null
}

export function cancelPendingUndoSnapshot(inner: InnerVditor): void {
  const mode = inner.currentMode
  const timeout =
    mode === 'wysiwyg'
      ? inner.wysiwyg?.afterRenderTimeoutId
      : mode === 'ir'
        ? inner.ir?.processTimeoutId
        : inner.sv?.processTimeoutId
  if (timeout !== undefined) window.clearTimeout(timeout)
}

function checkpointUndo(inner: InnerVditor): void {
  cancelPendingUndoSnapshot(inner)
  inner.undo?.addToUndoStack?.(inner)
}

function removeRenderedCaret(editor: HTMLElement, marker: string): boolean {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    const offset = text.data.indexOf(marker)
    if (offset < 0) continue
    text.data =
      text.data.slice(0, offset) + text.data.slice(offset + marker.length)
    requestCaret({ node: text, offset })
    return true
  }
  return false
}

function textPointAt(
  root: HTMLElement,
  sourceOffset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = sourceOffset
  let last: Text | null = null
  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    last = node
    if (remaining <= node.data.length) return { node, offset: remaining }
    remaining -= node.data.length
  }
  return last ? { node: last, offset: last.data.length } : null
}

function replaceSvMarkdownRange(
  editor: HTMLElement,
  before: string,
  result: RewrapResult,
): boolean {
  if (editor.textContent !== before) return false
  let start = 0
  while (
    start < before.length &&
    start < result.markdown.length &&
    before[start] === result.markdown[start]
  ) {
    start++
  }
  let suffix = 0
  while (
    suffix < before.length - start &&
    suffix < result.markdown.length - start &&
    before[before.length - 1 - suffix] ===
      result.markdown[result.markdown.length - 1 - suffix]
  ) {
    suffix++
  }
  const end = before.length - suffix
  const replacement = result.markdown.slice(
    start,
    result.markdown.length - suffix,
  )
  const startPoint = textPointAt(editor, start)
  const endPoint = textPointAt(editor, end)
  if (!startPoint || !endPoint) return false
  const range = document.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  range.deleteContents()
  range.insertNode(document.createTextNode(replacement))
  editor.normalize()
  if (editor.textContent !== result.markdown) return false
  const caret = textPointAt(editor, result.caretOffset)
  return caret ? requestCaret(caret) : false
}

export function runRewrapCommand(
  win: Window,
  deps: RewrapCommandDeps,
): boolean {
  try {
    const selection = sourceSelectionForEditor(win)
    const vditor = win.vditor
    const inner = innerVditor()
    const editor = vditor ? activeModeElement(vditor) : null
    if (!selection || !vditor || !inner || !editor) return false
    return applyRewrapTransaction(selection, deps.column ?? 80, {
      checkpointUndo: () => checkpointUndo(inner),
      readScroll: () => findScroller(editor).scrollTop,
      restoreScroll: (scrollTop) => {
        const fresh = activeModeElement(vditor)
        if (!fresh) return
        const scroller = findScroller(fresh)
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
        scroller.scrollTop = Math.min(scrollTop, max)
      },
      applyMarkdown: (markedMarkdown, marker, result) => {
        deps.setApplying(true)
        try {
          if (inner.currentMode === 'sv') {
            if (replaceSvMarkdownRange(editor, selection.markdown, result)) {
              return true
            }
            vditor.setValue(selection.markdown)
            cancelPendingUndoSnapshot(inner)
            return false
          }
          vditor.setValue(markedMarkdown)
          const fresh = activeModeElement(vditor)
          if (fresh && removeRenderedCaret(fresh, marker)) return true
          // A missing marker means the parser consumed or relocated it. Restore the original bytes
          // immediately and decline the command; never leave a private marker in editable content.
          vditor.setValue(selection.markdown)
          cancelPendingUndoSnapshot(inner)
          return false
        } finally {
          deps.setApplying(false)
        }
      },
      sync: () => {
        deps.invalidate()
        deps.scheduleSync()
      },
    })
  } catch (error) {
    deps.onError(error)
    return false
  }
}

export function rewrapShortcut(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): boolean {
  return (
    event.key.toLowerCase() === 'q' &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  )
}

export function setupRewrapKeybind(win: Window, run: () => void): void {
  win.addEventListener(
    'keydown',
    (event) => {
      if (!rewrapShortcut(event)) return
      event.preventDefault()
      event.stopPropagation()
      run()
    },
    true,
  )
}
