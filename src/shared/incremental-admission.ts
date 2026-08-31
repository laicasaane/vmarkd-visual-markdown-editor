export const INCREMENTAL_MIN_BLOCKS = 700

export interface IncrementalComplexity {
  chars: number
  lines: number
  blocks: number
  descendants: number
  listItems: number
  tables: number
  inlineRich: number
}

export interface IncrementalAdmission {
  enabled: boolean
  reason: 'block-count' | 'nested-structure' | 'ordinary' | 'non-ir'
}

export interface IncrementalSourceComplexity {
  chars: number
  lines: number
  blockHints: number
  listItems: number
  tableRows: number
  inlineRich: number
  fencedBlocks: number
}

export interface IncrementalSeedPreparation {
  prepare: boolean
  reason: 'source-blocks' | 'source-structure' | 'ordinary'
}

export interface IncrementalSeedPayload {
  markdown: string
  source: IncrementalSourceComplexity
  reason: 'source-blocks' | 'source-structure'
  hostMs: number
}

const COMPLEX_MIN_BLOCKS = 350
const COMPLEX_MIN_CHARS = 30_000
const COMPLEX_DESCENDANT_RATIO = 4
const COMPLEX_STRUCTURE_SCORE = 500
const SOURCE_BLOCK_HINTS = 650
const SOURCE_MIN_CHARS = 20_000
const SOURCE_MIN_LINES = 800
const SOURCE_STRUCTURE_SCORE = 200

export function sourceComplexitySignature(
  markdown: string,
): IncrementalSourceComplexity {
  const lines = markdown.split(/\r?\n/)
  let blockHints = 0
  let inBlock = false
  let listItems = 0
  let tableRows = 0
  let fenceLines = 0
  let inlineRich = 0
  for (const line of lines) {
    const blank = line.trim() === ''
    if (!blank && !inBlock) blockHints++
    inBlock = !blank
    if (/^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(line)) listItems++
    if (/^\s*\|.*\|\s*$/.test(line)) tableRows++
    if (/^\s{0,3}(?:```|~~~)/.test(line)) fenceLines++
    inlineRich +=
      line.match(/\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`/g)?.length ?? 0
  }
  return {
    chars: markdown.length,
    lines: lines.length,
    blockHints,
    listItems,
    tableRows,
    inlineRich,
    fencedBlocks: Math.floor(fenceLines / 2),
  }
}

export function incrementalSeedPreparation(
  signature: IncrementalSourceComplexity,
): IncrementalSeedPreparation {
  if (signature.blockHints >= SOURCE_BLOCK_HINTS)
    return { prepare: true, reason: 'source-blocks' }
  const structureScore =
    signature.listItems * 2 +
    signature.tableRows * 6 +
    signature.inlineRich +
    signature.fencedBlocks * 10
  return signature.chars >= SOURCE_MIN_CHARS &&
    signature.lines >= SOURCE_MIN_LINES &&
    structureScore >= SOURCE_STRUCTURE_SCORE
    ? { prepare: true, reason: 'source-structure' }
    : { prepare: false, reason: 'ordinary' }
}

export function buildIncrementalSeedPayload(
  markdown: string,
  canonicalize: (markdown: string) => string | undefined,
  now: () => number = () => performance.now(),
): IncrementalSeedPayload | undefined {
  const source = sourceComplexitySignature(markdown)
  const preparation = incrementalSeedPreparation(source)
  if (!preparation.prepare || preparation.reason === 'ordinary')
    return undefined
  const started = now()
  const canonical = canonicalize(markdown)
  const hostMs = now() - started
  if (canonical === undefined) return undefined
  return {
    markdown: canonical,
    source,
    reason: preparation.reason,
    hostMs,
  }
}

export function incrementalAdmission(
  mode: string | undefined,
  complexity: number | IncrementalComplexity,
): IncrementalAdmission {
  if (mode !== 'ir') return { enabled: false, reason: 'non-ir' }
  const blocks = typeof complexity === 'number' ? complexity : complexity.blocks
  if (blocks >= INCREMENTAL_MIN_BLOCKS)
    return { enabled: true, reason: 'block-count' }
  if (typeof complexity === 'number')
    return { enabled: false, reason: 'ordinary' }
  const structureScore =
    complexity.listItems * 2 + complexity.tables * 20 + complexity.inlineRich
  const nestedEnough =
    complexity.descendants >= blocks * COMPLEX_DESCENDANT_RATIO ||
    structureScore >= COMPLEX_STRUCTURE_SCORE
  return blocks >= COMPLEX_MIN_BLOCKS &&
    complexity.chars >= COMPLEX_MIN_CHARS &&
    nestedEnough
    ? { enabled: true, reason: 'nested-structure' }
    : { enabled: false, reason: 'ordinary' }
}
