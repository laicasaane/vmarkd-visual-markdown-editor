import '../src/boot/preload'
import Vditor from 'vditor'
import {
  rangeForSourceOffset,
  setupSplitScrollSync,
  sourceHeadingOffsets,
} from '../src/nav/split-scroll-sync'

// Split-view scroll sync harness. Creates Vditor in SV mode with preview.mode
// "both" (source + preview side-by-side) and enough headings to scroll.
// The spec scrolls the source pane and verifies the preview follows.

const sections: string[] = ['# Document title', '']
for (let i = 1; i <= 18; i++) {
  sections.push(
    `## Section ${i}`,
    '',
    `Paragraph under section ${i}. `.repeat(6),
    '',
  )
  if (i === 4) {
    for (let ref = 0; ref < 80; ref++)
      sections.push(`[unused-${ref}]: https://example.com/${ref}`)
    sections.push('')
  }
  if (i === 8)
    sections.push('```md', '# fenced fake', '## fenced fake two', '```', '')
}
const value = sections.join('\n')

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'sv',
  cdn: `${location.origin}/vditor`,
  value,
  preview: { mode: 'both' },
  height: '100%',
  after() {
    ;(window as any).vditor = editor
    const source = editor.vditor.sv.element
    const sourceWrapper = document.createElement('div')
    while (source.firstChild) sourceWrapper.appendChild(source.firstChild)
    source.appendChild(sourceWrapper)
    setupSplitScrollSync()
    const inner = (editor as unknown as { vditor: IVditor }).vditor
    ;(window as any).__centerSplitHeading = (text: string) => {
      const source = inner.sv.element as HTMLElement
      const heading = sourceHeadingOffsets(source).find(
        (candidate) => candidate.text === text,
      )
      if (!heading) return false
      const range = rangeForSourceOffset(source, heading.offset, heading.length)
      const rect = range?.getClientRects()[0]
      if (!rect) return false
      const sourceRect = source.getBoundingClientRect()
      source.scrollTop +=
        rect.top + rect.height / 2 - (sourceRect.top + sourceRect.height / 2)
      source.dispatchEvent(new Event('scroll'))
      return true
    }
    ;(window as any).__splitAlignment = (text: string) => {
      const source = inner.sv.element as HTMLElement
      const preview = inner.preview.element as HTMLElement
      const reset = inner.preview.previewElement as HTMLElement
      const heading = sourceHeadingOffsets(source).find(
        (candidate) => candidate.text === text,
      )
      const range = heading
        ? rangeForSourceOffset(source, heading.offset, heading.length)
        : null
      const sourceRect = source.getBoundingClientRect()
      const sourceHeadingRect = range?.getClientRects()[0]
      const previewRect = preview.getBoundingClientRect()
      const rendered = Array.from(
        reset.querySelectorAll<HTMLElement>(
          ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6',
        ),
      )
      const nearest = rendered
        .map((element) => ({
          text: element.textContent?.trim() ?? '',
          offset:
            element.getBoundingClientRect().top +
            element.getBoundingClientRect().height / 2 -
            (previewRect.top + previewRect.height / 2),
        }))
        .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))[0]
      const target = rendered.find(
        (element) => element.textContent?.trim() === text,
      )
      const targetRect = target?.getBoundingClientRect()
      return {
        sourceChildren: source.children.length,
        sourceCount: sourceHeadingOffsets(source).length,
        previewCount: rendered.length,
        fencedExcluded: !sourceHeadingOffsets(source).some((item) =>
          item.text.includes('fenced fake'),
        ),
        sourceOffset: sourceHeadingRect
          ? sourceHeadingRect.top +
            sourceHeadingRect.height / 2 -
            (sourceRect.top + sourceRect.height / 2)
          : null,
        previewOffset: targetRect
          ? targetRect.top +
            targetRect.height / 2 -
            (previewRect.top + previewRect.height / 2)
          : null,
        nearest,
      }
    }
    ;(window as any).__ready = true
  },
})
