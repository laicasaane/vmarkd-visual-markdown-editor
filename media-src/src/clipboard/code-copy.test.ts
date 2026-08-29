// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { codeCopyText, installCodeCopy } from './code-copy'

describe('codeCopyText', () => {
  it("uses Vditor's hidden textarea, so line-number nodes never reach the clipboard", () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'const answer = 42;\u200B'
    expect(codeCopyText(textarea)).toBe('const answer = 42;')
  })
})

describe('installCodeCopy', () => {
  it('posts the code payload for the CSP-safe delegated button', () => {
    document.body.innerHTML =
      '<div class="vditor-copy"><textarea>line one\u200B</textarea><span data-vmde-copy-code="true"></span></div>'
    const post = vi.fn()
    installCodeCopy(window, post)
    document
      .querySelector('[data-vmde-copy-code]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(post).toHaveBeenCalledWith({
      command: 'copy-code',
      content: 'line one',
    })
  })
})
