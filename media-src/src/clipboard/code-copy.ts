import type { WebviewMessage } from '../../../src/shared/protocol'

const COPY_BUTTON_SELECTOR = '[data-vmarkd-copy-code="true"]'

export function codeCopyText(textarea: HTMLTextAreaElement): string {
  // Vditor has already removed line-number nodes before it creates this textarea.
  // Keep its non-breaking-space normalisation, then remove editor-only zero-width breaks.
  return textarea.value.replace(/\u200B/g, '')
}

export function installCodeCopy(
  target: Window,
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
