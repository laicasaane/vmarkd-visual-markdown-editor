import { explicitHardBreaks } from './rewrap-markdown'

interface LineBreakLute {
  Md2VditorIRDOM(markdown: string): string
  Md2VditorDOM(markdown: string): string
  VditorIRDOM2Md(html: string): string
  VditorDOM2Md(html: string): string
  SpinVditorIRDOM(html: string): string
  SpinVditorDOM(html: string): string
  SpinVditorSVDOM(markdown: string): string
}

interface MarkerReplacement {
  marker: string
  markdown: string
  html: string
}

const wrappedLutes = new WeakSet<object>()
const SOFT_MARKER_BASE = '\uE300VMARKD_SOFT_BREAK'
const HARD_MARKER_BASE = '\uE301VMARKD_HARD_BREAK'
const EXCLUDED_DOM =
  'pre, code, table, [data-type*="code"], [data-type*="html"], [data-type*="math"]'

function uniqueMarker(source: string, base: string): string {
  let counter = 0
  for (;;) {
    const marker = `${base}_${counter}\uE30F`
    if (!source.includes(marker)) return marker
    counter++
  }
}

function htmlRoot(html: string): HTMLDivElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

function eligibleParagraphs(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('p')).filter(
    (paragraph) => !paragraph.closest(EXCLUDED_DOM),
  )
}

function replaceSoftNewlines(paragraph: HTMLElement): void {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    if (
      text.data.includes('\n') &&
      !text.parentElement?.closest(EXCLUDED_DOM)
    ) {
      textNodes.push(text)
    }
  }
  for (const text of textNodes) {
    const parts = text.data.split('\n')
    const fragment = document.createDocumentFragment()
    parts.forEach((part, index) => {
      if (index > 0) {
        const softBreak = document.createElement('span')
        softBreak.dataset.vmarkdSoftBreak = '1'
        softBreak.contentEditable = 'false'
        softBreak.textContent = ' '
        fragment.append(softBreak)
      }
      fragment.append(document.createTextNode(part))
    })
    text.replaceWith(fragment)
  }
}

function renderIdentityDom(
  html: string,
  markdown: string,
  reflowSoftBreaks: boolean,
): string {
  const root = htmlRoot(html)
  const suffixes = explicitHardBreaks(markdown).map((entry) => entry.suffix)
  const hardBreaks = eligibleParagraphs(root).flatMap((paragraph) =>
    Array.from(paragraph.querySelectorAll<HTMLBRElement>('br')).filter(
      (br) => !br.closest(EXCLUDED_DOM),
    ),
  )
  // A raw-HTML `<br>` or another context-sensitive shape makes source↔DOM ordering ambiguous.
  // Fail closed: leave the entire render untouched instead of tagging the wrong break.
  if (hardBreaks.length !== suffixes.length) return html
  hardBreaks.forEach((br, index) => {
    br.dataset.vmarkdHardBreak = encodeURIComponent(suffixes[index])
  })
  if (reflowSoftBreaks) {
    for (const paragraph of eligibleParagraphs(root)) {
      replaceSoftNewlines(paragraph)
    }
  }
  return root.innerHTML
}

function renderSvIdentityDom(html: string, markdown: string): string {
  const root = htmlRoot(html)
  const newlines = Array.from(
    root.querySelectorAll<HTMLElement>('[data-type="newline"]'),
  )
  const entries = explicitHardBreaks(markdown)
  if (entries.some((entry) => !newlines[entry.line])) return html
  for (const entry of entries) {
    newlines[entry.line].before(document.createTextNode(entry.suffix))
  }
  return root.innerHTML
}

function encodeIdentityDom(html: string): {
  html: string
  replacements: MarkerReplacement[]
} {
  const root = htmlRoot(html)
  const replacements: MarkerReplacement[] = []
  for (const softBreak of root.querySelectorAll<HTMLElement>(
    '[data-vmarkd-soft-break="1"]',
  )) {
    const marker = uniqueMarker(root.innerHTML, SOFT_MARKER_BASE)
    replacements.push({
      marker,
      markdown: '\n',
      html: '<span data-vmarkd-soft-break="1" contenteditable="false"> </span>',
    })
    softBreak.replaceWith(document.createTextNode(marker))
  }
  for (const hardBreak of root.querySelectorAll<HTMLElement>(
    'br[data-vmarkd-hard-break]',
  )) {
    const encoded = hardBreak.dataset.vmarkdHardBreak
    if (!encoded) continue
    const suffix = decodeURIComponent(encoded)
    const marker = uniqueMarker(root.innerHTML, HARD_MARKER_BASE)
    replacements.push({
      marker,
      markdown: `${suffix}\n`,
      html: `<br data-vmarkd-hard-break="${encoded}">`,
    })
    hardBreak.replaceWith(document.createTextNode(marker))
  }
  return { html: root.innerHTML, replacements }
}

function decodeMarkdown(
  markdown: string,
  replacements: MarkerReplacement[],
): string {
  let result = markdown
  for (const replacement of replacements) {
    result = result.split(replacement.marker).join(replacement.markdown)
  }
  return result
}

function decodeHtml(html: string, replacements: MarkerReplacement[]): string {
  let result = html
  for (const replacement of replacements) {
    result = result.split(replacement.marker).join(replacement.html)
  }
  return result
}

export function wrapLiveLineBreakIdentity(
  lute: LineBreakLute,
  enabled: () => boolean,
): void {
  if (wrappedLutes.has(lute)) return
  wrappedLutes.add(lute)

  for (const key of ['Md2VditorIRDOM', 'Md2VditorDOM'] as const) {
    const original = lute[key].bind(lute)
    lute[key] = (markdown: string) => {
      const html = original(markdown)
      return renderIdentityDom(html, markdown, enabled())
    }
  }
  for (const key of ['VditorIRDOM2Md', 'VditorDOM2Md'] as const) {
    const original = lute[key].bind(lute)
    lute[key] = (html: string) => {
      if (!html.includes('data-vmarkd-')) return original(html)
      const encoded = encodeIdentityDom(html)
      return decodeMarkdown(original(encoded.html), encoded.replacements)
    }
  }
  for (const key of ['SpinVditorIRDOM', 'SpinVditorDOM'] as const) {
    const original = lute[key].bind(lute)
    lute[key] = (html: string) => {
      if (!html.includes('data-vmarkd-')) return original(html)
      const encoded = encodeIdentityDom(html)
      return decodeHtml(original(encoded.html), encoded.replacements)
    }
  }
  const originalSvSpin = lute.SpinVditorSVDOM.bind(lute)
  lute.SpinVditorSVDOM = (markdown: string) =>
    renderSvIdentityDom(originalSvSpin(markdown), markdown)
}
