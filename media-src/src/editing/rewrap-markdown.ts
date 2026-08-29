export interface RewrapResult {
  markdown: string
  caretOffset: number
  changed: boolean
}

interface SourceLine {
  start: number
  end: number
  endWithBreak: number
  text: string
  newline: string
  excluded: boolean
}

interface PrefixSpec {
  first: string
  continuation: string
  list: boolean
}

interface LogicalUnit {
  startLine: number
  endLine: number
  prefix: PrefixSpec
}

export interface ExplicitHardBreak {
  line: number
  suffix: string
}

interface DelimitedState {
  fence: { marker: string; length: number } | null
  math: boolean
  frontMatter: boolean
}

const CARET_MARKER_BASE = '\uE000VMDE_REWRAP_CARET'
const HARD_BREAK_RE = /( {2,}|(?<!\\)\\)$/u
const COMBINING_OR_FORMAT_RE = /\p{Mark}|\u200d|\ufe0e|\ufe0f/u
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function sourceLines(markdown: string): SourceLine[] {
  const lines: SourceLine[] = []
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/gu
  for (;;) {
    const match = re.exec(markdown)
    if (!match) break
    if (match[0] === '' && re.lastIndex === markdown.length) break
    const start = match.index
    const text = match[1]
    const newline = match[2]
    lines.push({
      start,
      end: start + text.length,
      endWithBreak: start + text.length + newline.length,
      text,
      newline,
      excluded: false,
    })
    if (!newline) break
  }
  if (lines.length === 0) {
    lines.push({
      start: 0,
      end: 0,
      endWithBreak: 0,
      text: '',
      newline: '',
      excluded: false,
    })
  }
  return lines
}

function markFenceLine(line: SourceLine, state: DelimitedState): boolean {
  const fenceMatch = line.text.match(/^\s{0,3}(`{3,}|~{3,})/u)
  if (state.fence) {
    line.excluded = true
    if (
      fenceMatch &&
      fenceMatch[1][0] === state.fence.marker &&
      fenceMatch[1].length >= state.fence.length
    ) {
      state.fence = null
    }
    return true
  }
  if (!fenceMatch) return false
  line.excluded = true
  state.fence = {
    marker: fenceMatch[1][0],
    length: fenceMatch[1].length,
  }
  return true
}

function markMathLine(line: SourceLine, state: DelimitedState): void {
  if (/^\s{0,3}\$\$\s*$/u.test(line.text)) {
    line.excluded = true
    state.math = !state.math
  } else if (state.math) {
    line.excluded = true
  }
}

function markDelimitedBlocks(lines: SourceLine[]): void {
  const state: DelimitedState = {
    fence: null,
    math: false,
    frontMatter: lines[0]?.text.trim() === '---',
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.text.trim()
    if (state.frontMatter) {
      line.excluded = true
      if (index > 0 && (trimmed === '---' || trimmed === '...')) {
        state.frontMatter = false
      }
      continue
    }
    if (markFenceLine(line, state)) continue
    markMathLine(line, state)
  }
}

function prefixFor(line: string): PrefixSpec {
  let cursor = 0
  let quote = ''
  for (;;) {
    const match = line.slice(cursor).match(/^[ \t]{0,3}>[ \t]?/u)
    if (!match) break
    quote += match[0]
    cursor += match[0].length
  }
  const rest = line.slice(cursor)
  const list = rest.match(
    /^([ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/u,
  )
  if (list) {
    return {
      first: quote + list[1],
      continuation: quote + ' '.repeat(displayWidth(list[1])),
      list: true,
    }
  }
  const callout = quote
    ? rest.match(/^(\[![A-Za-z][A-Za-z0-9_-]*\][ \t]+)/u)
    : null
  if (callout) {
    return {
      first: quote + callout[1],
      continuation: quote,
      list: false,
    }
  }
  return { first: quote, continuation: quote, list: false }
}

function isStandaloneExcluded(line: SourceLine, prefix: PrefixSpec): boolean {
  if (line.excluded) return true
  const content = line.text.slice(prefix.first.length)
  const trimmed = content.trim()
  if (!trimmed) return false
  if (/^(?:#{1,6}[ \t]+|={3,}$|-{3,}$|_{3,}$|\*{3,}$)/u.test(trimmed)) {
    return true
  }
  if (/^(?: {4}|\t)/u.test(line.text) && !prefix.list && !prefix.first) {
    return true
  }
  if (/^<[/!A-Za-z][\s\S]*>?$/u.test(trimmed)) return true
  if (/^\[[^\]]+\]:[ \t]*\S/u.test(trimmed)) return true
  if (line.text.includes('|')) return true
  return false
}

function isLogicalBlank(line: SourceLine): boolean {
  // A blockquote paragraph separator still contains Markdown marker bytes, so raw trim is not enough.
  return (
    line.text.trim() === '' || /^(?:[ \t]{0,3}>[ \t]?)+[ \t]*$/u.test(line.text)
  )
}

export function explicitHardBreaks(markdown: string): ExplicitHardBreak[] {
  const lines = sourceLines(markdown)
  markDelimitedBlocks(lines)
  const breaks: ExplicitHardBreak[] = []
  for (let index = 0; index < lines.length - 1; index++) {
    const line = lines[index]
    const prefix = prefixFor(line.text)
    if (isStandaloneExcluded(line, prefix)) continue
    const content = line.text.slice(prefix.first.length)
    const suffix = content.match(HARD_BREAK_RE)?.[0]
    if (suffix) breaks.push({ line: index, suffix })
  }
  return breaks
}

function compatibleContinuation(line: SourceLine, prefix: PrefixSpec): boolean {
  if (isLogicalBlank(line)) return false
  const nextPrefix = prefixFor(line.text)
  if (prefix.list && nextPrefix.list) return false
  if (prefix.list) return line.text.startsWith(prefix.continuation)
  if (prefix.first) return line.text.startsWith(prefix.continuation)
  return nextPrefix.first === ''
}

function unitEndLine(
  lines: SourceLine[],
  start: number,
  last: number,
  prefix: PrefixSpec,
  failOnExcluded: boolean,
): number {
  let end = start
  while (end < last) {
    const next = lines[end + 1]
    if (isStandaloneExcluded(next, prefixFor(next.text))) {
      return failOnExcluded ? -1 : end
    }
    if (!compatibleContinuation(next, prefix)) break
    end++
  }
  return end
}

function logicalUnits(
  lines: SourceLine[],
  first: number,
  last: number,
  failOnExcluded = true,
): LogicalUnit[] {
  const units: LogicalUnit[] = []
  let index = first
  while (index <= last) {
    const line = lines[index]
    if (isLogicalBlank(line)) {
      index++
      continue
    }
    const prefix = prefixFor(line.text)
    if (isStandaloneExcluded(line, prefix)) {
      if (failOnExcluded) return []
      index++
      continue
    }
    const endLine = unitEndLine(lines, index, last, prefix, failOnExcluded)
    if (endLine < 0) return []
    units.push({ startLine: index, endLine, prefix })
    index = endLine + 1
  }
  return units
}

function lineIndexAt(lines: SourceLine[], offset: number): number {
  const found = lines.findIndex(
    (line) => offset >= line.start && offset <= line.endWithBreak,
  )
  return found < 0 ? lines.length - 1 : found
}

function selectedLineRange(
  lines: SourceLine[],
  startOffset: number,
  endOffset: number,
): { first: number; last: number } {
  const first = lineIndexAt(lines, startOffset)
  let last = lineIndexAt(lines, endOffset)
  if (
    endOffset > startOffset &&
    last > first &&
    endOffset === lines[last].start
  ) {
    last--
  }
  return { first, last }
}

function collapsedUnit(
  lines: SourceLine[],
  caretOffset: number,
): LogicalUnit | null {
  const caretLine = lineIndexAt(lines, caretOffset)
  if (isLogicalBlank(lines[caretLine])) return null
  let first = caretLine
  let last = caretLine
  while (first > 0 && !isLogicalBlank(lines[first - 1])) first--
  while (last + 1 < lines.length && !isLogicalBlank(lines[last + 1])) last++
  const units = logicalUnits(lines, first, last)
  return (
    units.find(
      (unit) => caretLine >= unit.startLine && caretLine <= unit.endLine,
    ) ?? null
  )
}

function codePointWidth(codePoint: number, char: string): number {
  if (
    codePoint === 0 ||
    codePoint < 32 ||
    (codePoint >= 0x7f && codePoint < 0xa0)
  ) {
    return 0
  }
  if (COMBINING_OR_FORMAT_RE.test(char)) return 0
  const wide =
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint !== 0x303f &&
      WIDE_RANGES.some(
        ([first, last]) => codePoint >= first && codePoint <= last,
      ))
  return wide ? 2 : 1
}

function displayWidth(value: string): number {
  let width = 0
  for (const char of value.replaceAll(CARET_MARKER_BASE, '')) {
    width += codePointWidth(char.codePointAt(0) ?? 0, char)
  }
  return width
}

function uniqueCaretMarker(markdown: string): string {
  let marker = CARET_MARKER_BASE
  while (markdown.includes(marker)) marker += '_'
  return marker
}

function contentForLine(
  line: string,
  prefix: PrefixSpec,
  first: boolean,
): string | null {
  const expected = first ? prefix.first : prefix.continuation
  if (!line.startsWith(expected)) return null
  return line.slice(expected.length)
}

function wrapWords(
  text: string,
  prefix: PrefixSpec,
  column: number,
  firstOutput: boolean,
): { lines: string[]; firstOutput: boolean } {
  const words = text.trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return { lines: [], firstOutput }
  const output: string[] = []
  let current = ''
  for (const word of words) {
    const linePrefix = firstOutput ? prefix.first : prefix.continuation
    const candidate = current ? `${current} ${word}` : word
    if (
      current &&
      displayWidth(linePrefix) + displayWidth(candidate) > column
    ) {
      output.push(linePrefix + current)
      firstOutput = false
      current = word
    } else {
      current = candidate
    }
  }
  if (current) {
    output.push((firstOutput ? prefix.first : prefix.continuation) + current)
    firstOutput = false
  }
  return { lines: output, firstOutput }
}

function appendWrappedSegment(
  output: string[],
  segment: string,
  hardBreak: string,
  prefix: PrefixSpec,
  column: number,
  firstOutput: boolean,
): boolean | null {
  const wrapped = wrapWords(segment, prefix, column, firstOutput)
  if (wrapped.lines.length === 0) return hardBreak ? null : firstOutput
  if (hardBreak) wrapped.lines[wrapped.lines.length - 1] += hardBreak
  output.push(...wrapped.lines)
  return wrapped.firstOutput
}

function prosePart(
  line: SourceLine,
  prefix: PrefixSpec,
  first: boolean,
): { text: string; hardBreak: string } | null {
  const raw = contentForLine(line.text, prefix, first)
  if (raw == null) return null
  const hardBreak = raw.match(HARD_BREAK_RE)?.[0] ?? ''
  return {
    text: (hardBreak ? raw.slice(0, -hardBreak.length) : raw).trim(),
    hardBreak,
  }
}

function formatUnit(
  lines: SourceLine[],
  unit: LogicalUnit,
  column: number,
): string[] | null {
  const output: string[] = []
  let segment = ''
  let firstOutput = true
  for (let index = unit.startLine; index <= unit.endLine; index++) {
    const part = prosePart(lines[index], unit.prefix, index === unit.startLine)
    if (!part) return null
    if (part.text) segment = segment ? `${segment} ${part.text}` : part.text
    if (part.hardBreak) {
      const next = appendWrappedSegment(
        output,
        segment,
        part.hardBreak,
        unit.prefix,
        column,
        firstOutput,
      )
      if (next == null) return null
      firstOutput = next
      segment = ''
    }
  }
  if (segment) {
    appendWrappedSegment(output, segment, '', unit.prefix, column, firstOutput)
  }
  return output
}

function unitsForRange(
  lines: SourceLine[],
  start: number,
  end: number,
): LogicalUnit[] {
  if (start === end) {
    const unit = collapsedUnit(lines, start)
    return unit ? [unit] : []
  }
  const range = selectedLineRange(lines, start, end)
  return logicalUnits(lines, range.first, range.last)
}

function formatMarkedUnits(
  markedLines: SourceLine[],
  units: LogicalUnit[],
  column: number,
): string[] | null {
  const replacement: string[] = []
  let cursorLine = units[0].startLine
  for (const unit of units) {
    while (cursorLine < unit.startLine) {
      replacement.push(markedLines[cursorLine].text)
      cursorLine++
    }
    const markedUnit: LogicalUnit = {
      ...unit,
      prefix: prefixFor(markedLines[unit.startLine].text),
    }
    const formatted = formatUnit(markedLines, markedUnit, column)
    if (!formatted) return null
    replacement.push(...formatted)
    cursorLine = unit.endLine + 1
  }
  return replacement
}

export function rewrapMarkdownRange(
  markdown: string,
  startOffset: number,
  endOffset: number,
  caretOffset: number,
  column: number,
): RewrapResult {
  const safeCaret = clamp(caretOffset, 0, markdown.length)
  const noChange = (): RewrapResult => ({
    markdown,
    caretOffset: safeCaret,
    changed: false,
  })
  if (!Number.isFinite(column) || column < 1) return noChange()
  const start = clamp(Math.min(startOffset, endOffset), 0, markdown.length)
  const end = clamp(Math.max(startOffset, endOffset), 0, markdown.length)
  const lines = sourceLines(markdown)
  markDelimitedBlocks(lines)

  const units = unitsForRange(lines, start, end)
  if (units.length === 0) return noChange()

  const rangeStart = lines[units[0].startLine].start
  const lastLine = lines[units[units.length - 1].endLine]
  const rangeEnd = lastLine.endWithBreak
  const marker = uniqueCaretMarker(markdown)
  const markerInRange = safeCaret >= rangeStart && safeCaret < rangeEnd
  const markedMarkdown = markerInRange
    ? markdown.slice(0, safeCaret) + marker + markdown.slice(safeCaret)
    : markdown
  const markedLines = sourceLines(markedMarkdown)
  markDelimitedBlocks(markedLines)

  const replacement = formatMarkedUnits(markedLines, units, Math.floor(column))
  if (!replacement) return noChange()
  const newline = lastLine.newline || '\n'
  let replacementText = replacement.join(newline)
  if (lastLine.newline) replacementText += lastLine.newline
  let nextMarkdown =
    markedMarkdown.slice(0, rangeStart) +
    replacementText +
    markedMarkdown.slice(rangeEnd + (markerInRange ? marker.length : 0))

  let nextCaret: number
  const markerIndex = nextMarkdown.indexOf(marker)
  if (markerIndex >= 0) {
    nextCaret = markerIndex
    nextMarkdown =
      nextMarkdown.slice(0, markerIndex) +
      nextMarkdown.slice(markerIndex + marker.length)
  } else if (safeCaret >= rangeEnd) {
    nextCaret = safeCaret + (nextMarkdown.length - markdown.length)
  } else {
    nextCaret = clamp(
      safeCaret,
      rangeStart,
      rangeStart + replacementText.length,
    )
  }
  if (nextMarkdown === markdown) return noChange()
  return { markdown: nextMarkdown, caretOffset: nextCaret, changed: true }
}

export function rewrapMarkdownDocument(
  markdown: string,
  caretOffset: number,
  column: number,
): RewrapResult {
  const safeCaret = clamp(caretOffset, 0, markdown.length)
  const noChange = (): RewrapResult => ({
    markdown,
    caretOffset: safeCaret,
    changed: false,
  })
  if (!Number.isFinite(column) || column < 1) return noChange()

  const lines = sourceLines(markdown)
  markDelimitedBlocks(lines)
  const units = logicalUnits(lines, 0, lines.length - 1, false)
  if (units.length === 0) return noChange()

  const marker = uniqueCaretMarker(markdown)
  const markedMarkdown =
    markdown.slice(0, safeCaret) + marker + markdown.slice(safeCaret)
  const markedLines = sourceLines(markedMarkdown)
  markDelimitedBlocks(markedLines)
  let nextMarkdown = markedMarkdown

  for (let index = units.length - 1; index >= 0; index--) {
    const unit = units[index]
    const markedUnit: LogicalUnit = {
      ...unit,
      prefix: prefixFor(markedLines[unit.startLine].text),
    }
    const formatted = formatUnit(markedLines, markedUnit, Math.floor(column))
    if (!formatted) return noChange()
    const firstLine = markedLines[unit.startLine]
    const lastLine = markedLines[unit.endLine]
    const newline = lastLine.newline || firstLine.newline || '\n'
    let replacement = formatted.join(newline)
    if (lastLine.newline) replacement += lastLine.newline
    nextMarkdown =
      nextMarkdown.slice(0, firstLine.start) +
      replacement +
      nextMarkdown.slice(lastLine.endWithBreak)
  }

  const nextCaret = nextMarkdown.indexOf(marker)
  if (nextCaret < 0) return noChange()
  nextMarkdown =
    nextMarkdown.slice(0, nextCaret) +
    nextMarkdown.slice(nextCaret + marker.length)
  if (nextMarkdown === markdown) return noChange()
  return { markdown: nextMarkdown, caretOffset: nextCaret, changed: true }
}
