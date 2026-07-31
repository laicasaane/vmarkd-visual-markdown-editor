// Global link/wiki-chip click + keyboard routing (split out of utils.ts, 185/3g).
//
// A webview anchor must never navigate the panel — every link routes to the host
// (open-link / open-wikilink) under the task-62 modifier policy. Wiki chips get
// click-to-expand, Enter/Space activation, and one-keystroke Backspace/Delete removal
// (contenteditable can't natively delete an opaque inline span).

import './vscode-api'
import { isEditorContentLink, shouldOpenLink } from './link-open-policy'
import { rawHrefOf } from './raw-href'
import { tryScrollToSameDocAnchor } from './same-doc-anchor'

function collapseExpandedWikiChips() {
  for (const el of document.querySelectorAll('.wiki-link-chip--expanded')) {
    el.classList.remove('wiki-link-chip--expanded')
  }
}

// Task 229 — clickable code references. `data-code-ref="1"` is set on BOTH decoration shapes
// (code-ref-decorate.ts's prose chip `<span>` and its attribute-only inline-`<code>` case), so
// one selector/handler covers both — the click target's own data-* attributes carry everything
// needed, no lookup elsewhere. Reads `line`/`col` as plain numbers (the decorator only ever
// writes digit strings — see findCodeRefs' `\d+` capture — so no NaN guard needed here).
function openCodeRefFromElement(el: HTMLElement): boolean {
  const path = el.dataset.codeRefPath
  const line = el.dataset.codeRefLine
  if (!path || !line) return false
  const col = el.dataset.codeRefCol
  vscode.postMessage({
    command: 'open-code-ref',
    path,
    line: Number(line),
    ...(col ? { col: Number(col) } : {}),
  })
  return true
}

export function fixLinkClick() {
  // Task 243 — a bare `#fragment` href is a same-document anchor: resolve + scroll to it
  // entirely in-process (tryScrollToSameDocAnchor, backed by the shared src/heading-slug.ts
  // resolver) and never post it to the host at all. Before this, EVERY href (including
  // same-doc anchors) posted `open-link`, which asset-link-actions.ts's `same-doc-anchor`
  // branch just no-op'd on (task 359's placeholder for this task). Real navigable hrefs
  // (external/local/scheme) are untouched — tryScrollToSameDocAnchor returns false for them.
  const openLink = (url: string) => {
    if (tryScrollToSameDocAnchor(url, window.vditor)) return
    vscode.postMessage({ command: 'open-link', href: url })
  }
  const openWikiLink = (target: string) => {
    vscode.postMessage({ command: 'open-wikilink', target })
  }
  const activateWikiLink = (element: HTMLElement | null) => {
    if (!element?.dataset.wikiTarget) {
      return false
    }
    openWikiLink(element.dataset.wikiTarget)
    return true
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes clicks across wiki-link/regular-link × editable/read-only × modifier-key branches; pre-existing (task 469 baseline)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null
    // Task 229 — same modifier policy as a real link (Ctrl/Cmd+click in editable content,
    // plain click in read-only Preview). Checked before the wiki-chip branch since the two
    // never overlap on the same element, but both must run before the generic `a[href]`
    // fallback below (a code-ref chip is never itself an anchor).
    const codeRefElement = target?.closest<HTMLElement>('[data-code-ref="1"]')
    if (codeRefElement) {
      const inEditable = !!codeRefElement.closest('[contenteditable]')
      if (!inEditable || shouldOpenLink(e)) {
        e.preventDefault()
        e.stopPropagation()
        openCodeRefFromElement(codeRefElement)
      }
      return
    }
    const wikiElement = target?.closest<HTMLElement>('[data-wiki-link="1"]')
    if (wikiElement) {
      // In editable areas (IR/wysiwyg contenteditable) the modifier policy
      // applies: plain click = edit (place caret), Ctrl/Cmd+click = navigate.
      // In read-only areas (preview, chrome) plain click navigates directly.
      const inEditable = !!wikiElement.closest('[contenteditable]')
      if (!inEditable || shouldOpenLink(e)) {
        e.preventDefault()
        e.stopPropagation()
        activateWikiLink(wikiElement)
      }
      // In editable mode with plain click: show [[…]] markers around the
      // chip (expand), but don't allow text editing. Click elsewhere collapses.
      if (inEditable) {
        e.preventDefault()
        e.stopPropagation()
        collapseExpandedWikiChips()
        wikiElement.classList.add('wiki-link-chip--expanded')
      }
      return
    }

    collapseExpandedWikiChips()

    // Real <a href>. Always cancel the browser's own navigation (a webview anchor
    // must never navigate the panel), then route to the host. The modifier policy
    // (task 62) applies ONLY to links in the editor's document content
    // (WYSIWYG/SV/preview), where a plain click means "edit": there a plain click is
    // left for editing and only Ctrl/Cmd+click opens. Links in chrome — the
    // About/Info dialog and other tips, toolbar, panels — are not editable text, so
    // they open on a plain click. Wiki links above are unaffected.
    const linkElement = target?.closest<HTMLAnchorElement>('a[href]')
    if (linkElement) {
      const href = rawHrefOf(linkElement)
      if (href) {
        e.preventDefault()
        e.stopPropagation()
        if (!isEditorContentLink(linkElement) || shouldOpenLink(e)) {
          openLink(href)
        }
      }
    }
  })
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null
    // Task 229 — Enter/Space on a focused code-ref chip opens it unconditionally, same as the
    // wiki chip below: a keyboard user tabbed to the element SPECIFICALLY to activate it, unlike
    // a mouse click which could be an accidental caret placement (hence the click handler's
    // modifier requirement in editable content, which doesn't apply here).
    const codeRefElement = target?.closest<HTMLElement>('[data-code-ref="1"]')
    if (codeRefElement && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      e.stopPropagation()
      openCodeRefFromElement(codeRefElement)
      return
    }
    const wikiElement = target?.closest<HTMLElement>('[data-wiki-link="1"]')
    if (!wikiElement) {
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      activateWikiLink(wikiElement)
    }
  })

  // Delete/Backspace on wiki chips: contenteditable can't natively remove an
  // opaque inline <span> with one keystroke. Handle it ourselves: if the caret
  // is adjacent to a wiki chip (or inside one), remove the chip and leave the
  // caret in its place. Capture phase so we run before Vditor's input handler.
  document.addEventListener(
    'keydown',
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Backspace/Delete-adjacent-to-a-wiki-chip removal across the caret-position/chip-boundary branches; pre-existing (task 469 baseline)
    (e) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return

      const range = sel.getRangeAt(0)
      const container = range.startContainer
      const offset = range.startOffset

      // Case 1: caret is INSIDE a wiki chip span
      const inside =
        (container as HTMLElement)?.closest?.('[data-wiki-link="1"]') ??
        container.parentElement?.closest?.('[data-wiki-link="1"]')
      if (inside) {
        e.preventDefault()
        e.stopPropagation()
        const parent = inside.parentNode!
        const textNode = document.createTextNode('')
        parent.replaceChild(textNode, inside)
        range.setStart(textNode, 0)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        // Trigger Vditor's input handler to re-parse the block
        ;(parent as Element)
          .closest?.('[contenteditable]')
          ?.dispatchEvent(new Event('input', { bubbles: true }))
        return
      }

      // Case 2: caret is right BEFORE a chip (Delete) or right AFTER (Backspace),
      // tolerating the zero-width space (U+200B) we render after each chip — the
      // caret typically sits in/after that ZWSP, so we skip ZWSP-only text nodes
      // (and ZWSP chars before the caret) when looking for the adjacent chip.
      const isChip = (n: Node | null): n is HTMLElement =>
        !!n &&
        n.nodeType === 1 &&
        (n as HTMLElement).matches?.('[data-wiki-link="1"]') === true
      const isZwspText = (n: Node | null): boolean =>
        !!n &&
        n.nodeType === 3 &&
        (n.textContent ?? '').replace(/\u200B/g, '') === ''

      let node: Node | null = null
      if (container.nodeType === 3) {
        const slice =
          e.key === 'Backspace'
            ? container.textContent!.slice(0, offset)
            : container.textContent!.slice(offset)
        // only proceed if there's no REAL text between the caret and the edge
        if (slice.replace(/\u200B/g, '') === '') {
          node =
            e.key === 'Backspace'
              ? container.previousSibling
              : container.nextSibling
        }
      } else if (container.nodeType === 1) {
        const el = container as HTMLElement
        node =
          e.key === 'Backspace'
            ? (el.childNodes[offset - 1] ?? null)
            : (el.childNodes[offset] ?? null)
      }
      // hop over any ZWSP-only text nodes between the caret and the chip
      const junk: Node[] = []
      while (isZwspText(node)) {
        junk.push(node as Node)
        node =
          e.key === 'Backspace'
            ? (node as Node).previousSibling
            : (node as Node).nextSibling
      }
      if (isChip(node)) {
        e.preventDefault()
        e.stopPropagation()
        for (const j of junk) j.parentNode?.removeChild(j)
        const parent = node.parentNode!
        const textNode = document.createTextNode('')
        parent.replaceChild(textNode, node)
        range.setStart(textNode, 0)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        ;(parent as Element)
          .closest?.('[contenteditable]')
          ?.dispatchEvent(new Event('input', { bubbles: true }))
      }
    },
    true, // capture phase — before Vditor
  )
  window.open = (url: string, ..._args: any[]) => {
    openLink(url)
    return window
  }
}
