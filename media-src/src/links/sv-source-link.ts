// Task 542 — Lute renders split-source Markdown links as flat syntax spans, never <a href>.
// Resolve only the exact sibling shapes Lute emits so clicks cannot walk into another link, code,
// an image, a definition, or a footnote. No DOM attributes or cache are added: SV serialization is
// raw textContent, and live/external/streamed rebuilds therefore cannot leave stale destinations.

const BRACKET = 'vditor-sv__marker--bracket'
const PAREN = 'vditor-sv__marker--paren'
const LINK = 'vditor-sv__marker--link'

function directElement(node: Node | null): HTMLElement | null {
  return node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null
}

function marker(
  node: Node | null,
  className: string,
  text?: string,
): HTMLElement | null {
  const element = directElement(node)
  if (!element?.classList.contains(className)) return null
  return text === undefined || element.textContent === text ? element : null
}

function isImageOpening(openBracket: HTMLElement): boolean {
  const bang = marker(openBracket.previousSibling, 'vditor-sv__marker', '!')
  return bang !== null
}

function hasInlineClose(destination: HTMLElement): boolean {
  let node = destination.nextSibling
  while (node) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).getAttribute('data-type') === 'newline'
    )
      return false
    const element = directElement(node)
    if (element?.classList.contains(LINK)) return false
    if (marker(node, PAREN, ')')) return true
    node = node.nextSibling
  }
  return false
}

function inlineDestinationFromLabel(label: HTMLElement): string | null {
  if (label.dataset.type !== 'link-text') return null
  const open = marker(label.previousSibling, BRACKET, '[')
  const close = marker(label.nextSibling, BRACKET, ']')
  const openParen = marker(close?.nextSibling ?? null, PAREN, '(')
  const destination = marker(openParen?.nextSibling ?? null, LINK)
  if (
    !open ||
    !close ||
    !openParen ||
    !destination ||
    destination.dataset.type ||
    isImageOpening(open) ||
    !hasInlineClose(destination)
  )
    return null
  return destination.textContent || null
}

function inlineDestinationFromMarker(destination: HTMLElement): string | null {
  if (!destination.classList.contains(LINK) || destination.dataset.type)
    return null
  const openParen = marker(destination.previousSibling, PAREN, '(')
  const close = marker(openParen?.previousSibling ?? null, BRACKET, ']')
  const label = directElement(close?.previousSibling ?? null)
  const open = marker(label?.previousSibling ?? null, BRACKET, '[')
  if (
    !openParen ||
    !close ||
    !label ||
    label.dataset.type !== 'link-text' ||
    !open ||
    isImageOpening(open) ||
    !hasInlineClose(destination)
  )
    return null
  return destination.textContent || null
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

function skipWhitespace(text: string, from: number): number {
  let index = from
  while (/\s/.test(text[index] ?? '')) index++
  return index
}

function parseBareDestination(text: string, from: number): string | null {
  let index = from
  const start = index
  let depth = 0
  let escaped = false
  for (; index < text.length; index++) {
    const char = text[index]
    if (escaped) escaped = false
    else if (char === '\\') escaped = true
    else if (char === '(') depth++
    else if (char === ')' && depth > 0) depth--
    else if (/\s/.test(char) && depth === 0) break
  }
  return text.slice(start, index) || null
}

function parseDefinitionDestination(lineTail: string): string | null {
  let index = skipWhitespace(lineTail, 0)
  if (lineTail[index] !== ':') return null
  index = skipWhitespace(lineTail, index + 1)
  if (index >= lineTail.length) return null
  // Lute has already stripped optional <...> destination delimiters from the SV definition DOM;
  // parse the remaining raw destination token without decoding its escapes/percent/query/fragment.
  return parseBareDestination(lineTail, index)
}

function definitionHref(root: Element, rawLabel: string): string | null {
  const wanted = normalizeReferenceLabel(rawLabel)
  for (const definition of root.querySelectorAll<HTMLElement>(
    `.${LINK}[data-type="link-ref-defs-block"]`,
  )) {
    if (normalizeReferenceLabel(definition.textContent ?? '') !== wanted)
      continue
    const open = marker(definition.previousSibling, BRACKET, '[')
    const close = marker(definition.nextSibling, BRACKET, ']')
    if (!open || !close) continue
    let tail = ''
    let node = close.nextSibling
    while (node) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).getAttribute('data-type') === 'newline'
      )
        break
      tail += node.textContent ?? ''
      node = node.nextSibling
    }
    return parseDefinitionDestination(tail)
  }
  return null
}

function referenceParts(
  target: HTMLElement,
): { label: string; marker: HTMLElement; open: HTMLElement } | null {
  let label = target
  let reference = marker(label.nextSibling, LINK)
  let close = marker(label.nextSibling, BRACKET, ']')
  if (close) reference = marker(close.nextSibling, LINK)
  else if (target.classList.contains(LINK)) {
    reference = target
    close = marker(reference.previousSibling, BRACKET, ']')
    label = directElement(close?.previousSibling ?? null) ?? target
  }
  const open = marker(label.previousSibling, BRACKET, '[')
  const match = /^\[([^\]\n]+)\]$/.exec(reference?.textContent ?? '')
  if (
    !open ||
    !close ||
    !reference ||
    reference.dataset.type ||
    !match ||
    isImageOpening(open)
  )
    return null
  return { label: match[1], marker: reference, open }
}

/** Resolve an activatable raw Markdown destination from Lute's editable SV source DOM. */
export function resolveSvSourceLink(target: Element): string | null {
  if (!target.isConnected) return null
  const root = target.closest('.vditor-sv')
  if (!root?.contains(target)) return null
  const clicked = target as HTMLElement
  if (
    clicked.closest('.sup') ||
    clicked.dataset.type === 'link-ref-defs-block' ||
    clicked.dataset.type === 'footnotes-link'
  )
    return null

  const inline = clicked.classList.contains(LINK)
    ? inlineDestinationFromMarker(clicked)
    : inlineDestinationFromLabel(clicked)
  if (inline) return inline

  const reference = referenceParts(clicked)
  return reference ? definitionHref(root, reference.label) : null
}
