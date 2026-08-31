// Heading-anchored scroll sync for Vditor's split (sv) view. Task 48.
//
// Vditor's built-in sv sync is purely proportional
// (`preview.scrollTop = textScrollTop * preview.scrollHeight / textScrollHeight`),
// so a tall rendered <h1> vs its one-line `# Heading` source drift out of
// alignment. This overrides it.
//
// Anchoring is on HEADINGS, not all blocks: blocks don't pair 1:1 (e.g. link
// reference definitions are whole source blocks that render to *nothing*), but
// every markdown heading renders to exactly one <h1>..<h6> in the same order, so
// headings are reliable sync points. We align the headings bracketing the source
// viewport's centre and interpolate between them — the centre stays aligned, with
// slight drift between headings (accepted).
//
// One-directional (source -> preview), matching Vditor's own sync direction, so
// there's no scroll-feedback loop. We run inside requestAnimationFrame so our
// write lands AFTER Vditor's synchronous proportional write and wins. A single
// capture-phase listener on document survives mode switches without rebinding.

import { alignByHeadings } from './heading-align'
import { ATX_HEADING, createFenceTracker } from '../../../src/shared/md-scan'

const PREVIEW_SEL = '.vditor-preview'
const RESET_SEL = '.vditor-reset'

let installed = false

export interface SourceHeadingOffset {
  offset: number
  length: number
  level: number
  text: string
}

interface TextEntry {
  node: Text
  start: number
  end: number
}

interface SourceTextMap {
  text: string
  entries: TextEntry[]
}

interface SourceCache {
  dirty: boolean
  map: SourceTextMap
  headings: SourceHeadingOffset[]
  observer: MutationObserver
}

const headingCache = new WeakMap<HTMLElement, SourceCache>()

export function scanSourceHeadings(markdown: string): SourceHeadingOffset[] {
  const headings: SourceHeadingOffset[] = []
  const fences = createFenceTracker()
  let start = 0
  while (start <= markdown.length) {
    const newline = markdown.indexOf('\n', start)
    const physicalEnd = newline < 0 ? markdown.length : newline
    const lineEnd =
      physicalEnd > start && markdown[physicalEnd - 1] === '\r'
        ? physicalEnd - 1
        : physicalEnd
    const line = markdown.slice(start, lineEnd)
    if (!fences.consume(line)) {
      const match = ATX_HEADING.exec(line)
      if (match)
        headings.push({
          offset: start,
          length: line.length,
          level: match[1].length,
          text: match[2],
        })
    }
    if (newline < 0) break
    start = newline + 1
  }
  return headings
}

function appendTextNodes(
  root: Node,
  parts: string[],
  entries: TextEntry[],
  offset: number,
): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    const text = node.data
    parts.push(text)
    entries.push({ node, start: offset, end: offset + text.length })
    offset += text.length
  }
  return offset
}

function sourceTextMap(source: HTMLElement): SourceTextMap {
  const parts: string[] = []
  const entries: TextEntry[] = []
  let offset = 0
  const roots =
    source.children.length > 1 ? Array.from(source.children) : [source]
  for (const [index, root] of roots.entries()) {
    offset = appendTextNodes(root, parts, entries, offset)
    if (index < roots.length - 1 && !parts.at(-1)?.endsWith('\n')) {
      parts.push('\n')
      offset++
    }
  }
  return { text: parts.join(''), entries }
}

function sourceCache(source: HTMLElement): SourceCache {
  const existing = headingCache.get(source)
  if (existing && !existing.dirty) return existing
  const map = sourceTextMap(source)
  const headings = scanSourceHeadings(map.text)
  if (existing) {
    existing.dirty = false
    existing.map = map
    existing.headings = headings
    return existing
  }
  const cache: SourceCache = {
    dirty: false,
    map,
    headings,
    observer: new MutationObserver(() => {
      cache.dirty = true
    }),
  }
  cache.observer.observe(source, {
    childList: true,
    characterData: true,
    subtree: true,
  })
  headingCache.set(source, cache)
  return cache
}

export function sourceHeadingOffsets(
  source: HTMLElement,
): SourceHeadingOffset[] {
  return sourceCache(source).headings
}

function pointAt(
  entries: readonly TextEntry[],
  offset: number,
): { node: Text; offset: number } | null {
  for (const entry of entries) {
    if (offset < entry.start || offset > entry.end) continue
    return { node: entry.node, offset: offset - entry.start }
  }
  return null
}

export function rangeForSourceOffset(
  source: HTMLElement,
  offset: number,
  length: number,
): Range | null {
  const map = sourceCache(source).map
  const start = pointAt(map.entries, offset)
  const end = pointAt(map.entries, offset + length)
  if (!start || !end) return null
  const range = document.createRange()
  try {
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    return range
  } catch {
    return null
  }
}

function sourceHeadingTops(source: HTMLElement): number[] | null {
  const tops: number[] = []
  for (const heading of sourceHeadingOffsets(source)) {
    const range = rangeForSourceOffset(source, heading.offset, heading.length)
    const rect = range?.getClientRects()[0]
    if (!rect) return null
    tops.push(rect.top - source.getBoundingClientRect().top + source.scrollTop)
  }
  return tops
}

// Top of `el` relative to the scroll container's content (0 = top of content).
function topWithin(container: HTMLElement, el: HTMLElement): number {
  return (
    el.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  )
}

function syncSourceToPreview(source: HTMLElement) {
  const content = source.closest('.vditor-content') ?? source.parentElement
  const preview = content?.querySelector<HTMLElement>(PREVIEW_SEL)
  if (preview?.style.display !== 'block') return
  const reset = preview.querySelector<HTMLElement>(RESET_SEL)
  if (!reset) return

  // Source headings come from authored Markdown offsets, then resolve through live text-node
  // Ranges. This works for the current one-wrapper syntax-highlighted SV DOM and excludes fences.
  const pvHeads = (Array.from(reset.children) as HTMLElement[]).filter((el) =>
    /^H[1-6]$/.test(el.tagName),
  )

  const srcTops = sourceHeadingTops(source)
  if (!srcTops) return
  const pvTops = pvHeads.map((el) => topWithin(preview, el))
  // Mismatch → alignByHeadings returns null → leave Vditor's proportional value
  // untouched (never worse).
  const target = alignByHeadings(source, srcTops, preview, pvTops)
  if (target !== null) preview.scrollTop = target
}

export function setupSplitScrollSync() {
  if (installed) return
  installed = true

  let pending = false
  let lastSource: HTMLElement | null = null

  document.addEventListener(
    'scroll',
    (e) => {
      const t = e.target as HTMLElement | null
      if (!t?.classList?.contains('vditor-sv')) return
      lastSource = t
      if (pending) return
      pending = true
      // After Vditor's synchronous proportional write, so ours wins.
      requestAnimationFrame(() => {
        pending = false
        if (lastSource) syncSourceToPreview(lastSource)
      })
    },
    true, // capture: scroll doesn't bubble, but capture sees inner-pane scrolls
  )
}
