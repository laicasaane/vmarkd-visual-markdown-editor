import type { WebviewMessage } from '../../../src/shared/protocol'

const COPY_BUTTON_SELECTOR = '[data-vmarkd-copy-code="true"]'

export function codeCopyText(textarea: HTMLTextAreaElement): string {
  // Vditor has already removed line-number nodes before it creates this textarea.
  // Keep its non-breaking-space normalisation, then remove editor-only zero-width breaks.
  return textarea.value.replace(/\u200B/g, '')
}

export function installCodeCopy(
  // `Window & typeof globalThis`, not bare `Window`: the instanceof guard below reads the
  // constructor (`target.HTMLTextAreaElement`) off the window, and that lives on the global scope
  // half of the type — with a bare `Window` the typecheck fails (TS2339).
  target: Window & typeof globalThis,
  post: (message: Extract<WebviewMessage, { command: 'copy-code' }>) => void,
): void {
  target.document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest(
      COPY_BUTTON_SELECTOR,
    )
    if (!button) return
    const textarea = button.parentElement?.querySelector('textarea')
    if (!(textarea instanceof target.HTMLTextAreaElement)) return
    event.preventDefault()
    event.stopPropagation()
    post({ command: 'copy-code', content: codeCopyText(textarea) })
  })
}
