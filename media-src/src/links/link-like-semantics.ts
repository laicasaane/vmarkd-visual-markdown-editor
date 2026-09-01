const LINK_LIKE_SELECTOR = '[data-wiki-link="1"], [data-code-ref="1"]'

function labelWiki(element: HTMLElement): void {
  const target = element.dataset.wikiTarget || element.textContent?.trim() || ''
  const prefix = element.dataset.wikiMissing === '1' ? 'Missing' : 'Open'
  element.setAttribute('role', 'link')
  element.setAttribute('aria-label', `${prefix} wiki page ${target}`)
}

function labelCodeRef(element: HTMLElement): void {
  const path = element.dataset.codeRefPath || element.textContent?.trim() || ''
  const line = element.dataset.codeRefLine
  const column = element.dataset.codeRefCol
  const position = line
    ? `, line ${line}${column ? `, column ${column}` : ''}`
    : ''
  element.setAttribute('role', 'link')
  element.setAttribute('aria-label', `Open code reference ${path}${position}`)
}

function labelElement(element: HTMLElement): void {
  if (element.dataset.wikiLink === '1') labelWiki(element)
  else if (element.dataset.codeRef === '1') labelCodeRef(element)
}

export function applyLinkLikeSemantics(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches(LINK_LIKE_SELECTOR)) {
    labelElement(root)
  }
  for (const element of root.querySelectorAll<HTMLElement>(
    LINK_LIKE_SELECTOR,
  )) {
    labelElement(element)
  }
}

export function observeLinkLikeSemantics(
  root: HTMLElement | null | undefined,
): () => void {
  if (!root) return () => undefined
  const observer = new MutationObserver(() => applyLinkLikeSemantics(root))
  observer.observe(root, { childList: true, subtree: true })
  applyLinkLikeSemantics(root)
  return () => observer.disconnect()
}
