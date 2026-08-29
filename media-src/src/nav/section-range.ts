export interface SectionRange {
  start: number
  end: number
  level: number
}

export interface HeadingPathEntry {
  index: number
  level: number
  text: string
}

const HEADING_TAG = /^H([1-6])$/

export function topLevelBlocks(surface: HTMLElement): HTMLElement[] {
  return Array.from(surface.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute('data-block'),
  )
}

export function headingLevel(block: HTMLElement): number | null {
  const match = HEADING_TAG.exec(block.tagName)
  return match ? Number(match[1]) : null
}

export function sectionRangeForHeading(
  blocks: readonly HTMLElement[],
  start: number,
): SectionRange | null {
  const level = blocks[start] ? headingLevel(blocks[start]) : null
  if (level === null) return null
  let end = blocks.length
  for (let index = start + 1; index < blocks.length; index++) {
    const candidateLevel = headingLevel(blocks[index])
    if (candidateLevel !== null && candidateLevel <= level) {
      end = index
      break
    }
  }
  return { start, end, level }
}

export function headingLabel(block: HTMLElement): string {
  const clone = block.cloneNode(true) as HTMLElement
  for (const marker of clone.querySelectorAll(
    '.vditor-ir__marker, [data-type$="marker"]',
  )) {
    marker.remove()
  }
  return clone.textContent?.trim() ?? ''
}

export function headingPathForIndex(
  blocks: readonly HTMLElement[],
  target: number,
): HeadingPathEntry[] {
  const path: HeadingPathEntry[] = []
  for (let index = 0; index <= target && index < blocks.length; index++) {
    const level = headingLevel(blocks[index])
    if (level === null) continue
    while ((path.at(-1)?.level ?? 0) >= level) path.pop()
    path.push({ index, level, text: headingLabel(blocks[index]) })
  }
  return path
}
