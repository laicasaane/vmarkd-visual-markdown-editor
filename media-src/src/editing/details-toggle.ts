import { captureCalloutActionTarget } from './callouts'
import { transformDetailsSelection } from './details'
import { innerVditor } from '../util/inner-vditor'
import { activeModeElement } from '../util/source-map'
import { findScroller } from '../chrome/toolbar-scroll-guard'
import { replaceSvMarkdownRange } from './rewrap-command'

export interface DetailsToggleDeps {
  setApplying(applying: boolean): void
  postExact(markdown: string): void
  onError(error: unknown): void
  snapshotMarkdown?(): string
}

interface SourceRange {
  markdown: string
  startOffset: number
  endOffset: number
}

function sameIgnoringTrailingBreaks(a: string, b: string): boolean {
  return (
    a.replace(/(?:(?:\r\n|\n|\r)[\t ]*)+$/u, '') ===
    b.replace(/(?:(?:\r\n|\n|\r)[\t ]*)+$/u, '')
  )
}

interface MarkdownLine {
  text: string
  start: number
  end: number
}

function sourceLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = []
  let start = 0
  for (const match of markdown.matchAll(/\r\n|\n|\r/gu)) {
    lines.push({
      text: markdown.slice(start, match.index),
      start,
      end: match.index,
    })
    start = match.index + match[0].length
  }
  lines.push({ text: markdown.slice(start), start, end: markdown.length })
  return lines
}

function lineForOffset(lines: readonly MarkdownLine[], offset: number): number {
  const found = lines.findIndex((line) => offset <= line.end)
  return found < 0 ? lines.length - 1 : found
}

function fenceRanges(lines: readonly MarkdownLine[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let opening: { index: number; marker: string; length: number } | null = null
  lines.forEach((line, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line.text)?.[1]
    if (!marker) return
    if (!opening) {
      opening = { index, marker: marker[0], length: marker.length }
      return
    }
    const trailing = line.text.slice(line.text.indexOf(marker) + marker.length)
    if (
      marker[0] === opening.marker &&
      marker.length >= opening.length &&
      trailing.trim() === ''
    ) {
      ranges.push([opening.index, index])
      opening = null
    }
  })
  if (opening) ranges.push([opening.index, lines.length - 1])
  return ranges
}

type LineRole = 'blank' | 'table' | 'list' | 'quote' | 'atomic' | 'prose'

function lineRole(text: string): LineRole {
  if (!text.trim()) return 'blank'
  if (text.includes('|')) return 'table'
  if (/^\s*(?:[-+*]|\d+[.)])\s+/u.test(text)) return 'list'
  if (/^\s*>/u.test(text)) return 'quote'
  if (/^ {0,3}(?:#{1,6}(?:\s|$)|(?:[-*_]\s*){3,}$)/u.test(text)) return 'atomic'
  return 'prose'
}

function sameBlockRole(role: LineRole, text: string): boolean {
  const candidate = lineRole(text)
  if (role === 'list') return candidate === 'list' || /^\s{2,}\S/u.test(text)
  return candidate === role
}

function expandFencedSelection(
  lines: readonly MarkdownLine[],
  first: number,
  last: number,
  startOffset: number,
  endOffset: number,
): [number, number] | null {
  let expandedFirst = first
  let expandedLast = last
  for (const [open, close] of fenceRanges(lines)) {
    if (last < open || first > close) continue
    if (startOffset > lines[open].start || endOffset < lines[close].end)
      return null
    expandedFirst = Math.min(expandedFirst, open)
    expandedLast = Math.max(expandedLast, close)
  }
  return [expandedFirst, expandedLast]
}

const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[\t ]*$/u

function setextRange(
  lines: readonly MarkdownLine[],
  first: number,
  last: number,
): [number, number] | null {
  if (
    SETEXT_UNDERLINE.test(lines[first].text) &&
    first > 0 &&
    lineRole(lines[first - 1].text) === 'prose'
  ) {
    first--
    while (first > 0 && lineRole(lines[first - 1].text) === 'prose') first--
    return [first, last]
  }
  if (
    lineRole(lines[first].text) === 'prose' &&
    last + 1 < lines.length &&
    SETEXT_UNDERLINE.test(lines[last + 1].text)
  ) {
    last++
    while (first > 0 && lineRole(lines[first - 1].text) === 'prose') first--
    return [first, last]
  }
  return null
}

function expandList(
  lines: readonly MarkdownLine[],
  first: number,
  last: number,
): [number, number] {
  while (first > 0) {
    if (sameBlockRole('list', lines[first - 1].text)) {
      first--
      continue
    }
    if (
      lineRole(lines[first - 1].text) === 'blank' &&
      first > 1 &&
      sameBlockRole('list', lines[first - 2].text)
    ) {
      first -= 2
      continue
    }
    break
  }
  while (last + 1 < lines.length) {
    if (sameBlockRole('list', lines[last + 1].text)) {
      last++
      continue
    }
    if (
      lineRole(lines[last + 1].text) === 'blank' &&
      last + 2 < lines.length &&
      sameBlockRole('list', lines[last + 2].text)
    ) {
      last += 2
      continue
    }
    break
  }
  return [first, last]
}

function lazyContainerRange(
  lines: readonly MarkdownLine[],
  first: number,
  last: number,
): [number, number] | null {
  if (lineRole(lines[first].text) !== 'prose' || first === 0) return null
  let proseStart = first
  let proseEnd = last
  while (proseStart > 0 && lineRole(lines[proseStart - 1].text) === 'prose')
    proseStart--
  while (
    proseEnd + 1 < lines.length &&
    lineRole(lines[proseEnd + 1].text) === 'prose'
  )
    proseEnd++
  if (proseStart === 0) return null
  const ownerIndex = proseStart - 1
  const owner = lineRole(lines[ownerIndex].text)
  if (owner !== 'list' && owner !== 'quote') return null
  if (owner === 'list')
    return [expandList(lines, ownerIndex, ownerIndex)[0], proseEnd]
  first = ownerIndex
  while (first > 0 && lineRole(lines[first - 1].text) === 'quote') first--
  return [first, proseEnd]
}

function expandSingleBlock(
  lines: readonly MarkdownLine[],
  first: number,
  last: number,
): [number, number] {
  if (first !== last) return [first, last]
  const lazy = lazyContainerRange(lines, first, last)
  if (lazy) return lazy
  const setext = setextRange(lines, first, last)
  if (setext) return setext
  const role = lineRole(lines[first].text)
  if (role === 'atomic' || role === 'table') return [first, last]
  if (role === 'list') return expandList(lines, first, last)
  while (first > 0 && sameBlockRole(role, lines[first - 1].text)) first--
  while (last + 1 < lines.length && sameBlockRole(role, lines[last + 1].text))
    last++
  if (
    role === 'prose' &&
    last + 1 < lines.length &&
    SETEXT_UNDERLINE.test(lines[last + 1].text)
  )
    last++
  return [first, last]
}

export function resolveDetailsBlockRange(
  markdown: string,
  startOffset: number,
  endOffset: number,
): SourceRange | null {
  if (startOffset >= endOffset) return null
  const lines = sourceLines(markdown)
  let first = lineForOffset(lines, startOffset)
  let last = lineForOffset(lines, Math.max(startOffset, endOffset - 1))
  const fenced = expandFencedSelection(
    lines,
    first,
    last,
    startOffset,
    endOffset,
  )
  if (!fenced) return null
  ;[first, last] = fenced
  const firstRole = lineRole(lines[first].text)
  const lastRole = lineRole(lines[last].text)
  if (
    (firstRole === 'table' && startOffset > lines[first].start) ||
    (lastRole === 'table' && endOffset < lines[last].end)
  )
    return null
  ;[first, last] = expandSingleBlock(lines, first, last)
  return {
    markdown,
    startOffset: lines[first].start,
    endOffset: lines[last].end,
  }
}

function uniqueMarker(markdown: string, base: string): string {
  let index = 0
  for (;;) {
    const marker = `\uE480${base}_${index}\uE48F`
    if (!markdown.includes(marker)) return marker
    index++
  }
}

function removeMarker(
  root: HTMLElement,
  marker: string,
): { node: Text; offset: number } | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    const offset = text.data.indexOf(marker)
    if (offset < 0) continue
    text.deleteData(offset, marker.length)
    return { node: text, offset }
  }
  return null
}

function captureTarget(exactMarkdown?: string): SourceRange | null {
  const target = captureCalloutActionTarget(window)
  if (!target) return null
  const snapshot =
    configuredDeps?.snapshotMarkdown?.() ?? target.selection.markdown
  const markdown =
    exactMarkdown &&
    sameIgnoringTrailingBreaks(target.selection.markdown, exactMarkdown)
      ? exactMarkdown
      : snapshot
  return resolveDetailsBlockRange(
    markdown,
    target.selection.startOffset,
    target.selection.endOffset,
  )
}

function runDetailsToggle(
  win: Window,
  deps: DetailsToggleDeps,
  captured: SourceRange | null,
): boolean {
  try {
    const outer = win.vditor
    const inner = innerVditor()
    const editor = outer ? activeModeElement(outer) : null
    if (!captured || !outer || !inner || !editor) return false
    const result = transformDetailsSelection({ ...captured, resolved: true })
    if (result.status === 'disabled') return false
    const startMarker = uniqueMarker(result.markdown, 'VMDE_DETAILS_START')
    const endMarker = uniqueMarker(
      result.markdown + startMarker,
      'VMDE_DETAILS_END',
    )
    const marked =
      result.markdown.slice(0, result.endOffset) +
      endMarker +
      result.markdown.slice(result.endOffset)
    const withMarkers =
      marked.slice(0, result.startOffset) +
      startMarker +
      marked.slice(result.startOffset)
    const scroller = findScroller(editor)
    const scrollTop = scroller.scrollTop
    deps.setApplying(true)
    try {
      inner.undo?.addToUndoStack?.(inner)
      if (inner.currentMode === 'sv') {
        if (
          !replaceSvMarkdownRange(
            editor,
            editor.textContent ?? captured.markdown,
            {
              markdown: withMarkers,
              caretOffset: result.endOffset + startMarker.length,
            },
          )
        )
          return false
      } else {
        outer.setValue(withMarkers)
      }
      const fresh = activeModeElement(outer)
      const start = fresh ? removeMarker(fresh, startMarker) : null
      const end = fresh ? removeMarker(fresh, endMarker) : null
      if (!fresh || !start || !end) {
        outer.setValue(captured.markdown)
        return false
      }
      inner.undo?.addToUndoStack?.(inner)
      const range = fresh.ownerDocument.createRange()
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
      const selection = fresh.ownerDocument.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      fresh.focus({ preventScroll: true })
      const nextScroller = findScroller(fresh)
      nextScroller.scrollTop = Math.min(
        scrollTop,
        Math.max(0, nextScroller.scrollHeight - nextScroller.clientHeight),
      )
    } finally {
      deps.setApplying(false)
    }
    deps.postExact(result.markdown)
    return true
  } catch (error) {
    deps.onError(error)
    return false
  }
}

let configuredDeps: DetailsToggleDeps | undefined

export function configureDetailsToggle(deps: DetailsToggleDeps): void {
  configuredDeps = deps
}

function previewOpen(): boolean {
  const button = innerVditor()?.toolbar?.elements?.preview?.children[0]
  return button?.classList.contains('vditor-menu--current') === true
}

export function installDetailsToggleControls(): () => void {
  const doc = document
  const button = doc.querySelector<HTMLButtonElement>(
    '.vditor-toolbar [data-type="details"]',
  )
  let pending: SourceRange | null = null
  let retained: SourceRange | null = null
  let exactMarkdown: string | undefined
  let frame = 0
  const retainedForCurrentSource = () => {
    if (
      !retained ||
      !sameIgnoringTrailingBreaks(
        window.vditor?.getValue() ?? '',
        retained.markdown,
      )
    )
      return null
    return retained
  }
  const selectionExpanded = () => {
    const selection = doc.getSelection()
    return Boolean(selection?.rangeCount && !selection.isCollapsed)
  }
  const currentTarget = () => {
    const retainedTarget = retainedForCurrentSource()
    if (!selectionExpanded()) return retainedTarget
    return captureTarget(exactMarkdown) ?? retainedTarget
  }
  const update = () => {
    frame = 0
    const target = previewOpen() ? null : currentTarget()
    const context = target
      ? transformDetailsSelection({ ...target, resolved: true })
      : null
    const enabled = Boolean(context && context.status !== 'disabled')
    const active = context?.status === 'unwrap'
    if (button) {
      button.disabled = !enabled
      button.setAttribute('aria-disabled', String(!enabled))
      button.setAttribute('aria-pressed', String(active))
      button.classList.toggle('vditor-menu--current', active)
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  const onPointerDown = () => {
    pending = currentTarget()
  }
  const onToggle = () => {
    const target = pending ?? currentTarget()
    const result = target
      ? transformDetailsSelection({ ...target, resolved: true })
      : null
    if (
      configuredDeps &&
      target &&
      result?.status !== 'disabled' &&
      runDetailsToggle(window, configuredDeps, target)
    ) {
      retained = {
        markdown: result.markdown,
        startOffset: result.startOffset,
        endOffset: result.endOffset,
      }
      exactMarkdown = result.markdown
    }
    pending = null
    schedule()
  }
  const onEditorPointerDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('.vditor-reset')) retained = null
  }
  const onInput = (event: Event) => {
    if (event.isTrusted) {
      retained = null
      exactMarkdown = undefined
    }
    schedule()
  }
  button?.addEventListener('pointerdown', onPointerDown, true)
  doc.addEventListener('pointerdown', onEditorPointerDown, true)
  doc.addEventListener('vmde-toggle-details', onToggle)
  doc.addEventListener('selectionchange', schedule)
  doc.addEventListener('input', onInput, true)
  const previewButton = innerVditor()?.toolbar?.elements?.preview?.children[0]
  const previewObserver = new MutationObserver(schedule)
  if (previewButton)
    previewObserver.observe(previewButton, {
      attributes: true,
      attributeFilter: ['class'],
    })
  schedule()
  return () => {
    if (frame) cancelAnimationFrame(frame)
    previewObserver.disconnect()
    button?.removeEventListener('pointerdown', onPointerDown, true)
    doc.removeEventListener('pointerdown', onEditorPointerDown, true)
    doc.removeEventListener('vmde-toggle-details', onToggle)
    doc.removeEventListener('selectionchange', schedule)
    doc.removeEventListener('input', onInput, true)
  }
}
