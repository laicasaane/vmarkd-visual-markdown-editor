// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  BUILTIN_SNIPPETS,
  createSnippetHintExtension,
  DETAILS_SNIPPET_MARKDOWN,
  escapeSnippetSource,
  installSnippetHintUndoBoundary,
  snippetHints,
} from './snippet-templates'

describe('built-in snippet registry', () => {
  it('reserves one source-owned details skeleton for the ;; hint', () => {
    expect(BUILTIN_SNIPPETS).toEqual([
      {
        trigger: 'details',
        label: 'Details',
        markdown: DETAILS_SNIPPET_MARKDOWN,
      },
    ])
    expect(DETAILS_SNIPPET_MARKDOWN).toBe(
      '<details>\n<summary>Details</summary>\n\nDetails body\n\n</details>',
    )
  })

  it('filters by trigger/label and delegates mode-specific rendering', () => {
    const render = vi.fn((markdown: string) => `rendered:${markdown}`)
    expect(snippetHints('det', render)).toEqual([
      {
        html: '<span data-vmde-snippet-hint="1">Details</span>',
        value: `rendered:${DETAILS_SNIPPET_MARKDOWN}`,
      },
    ])
    expect(render).toHaveBeenCalledOnce()
    expect(snippetHints('table', render)).toEqual([])
    const extension = createSnippetHintExtension(render)
    expect(extension.key).toBe(';;')
    expect(extension.hint('details')).toHaveLength(1)
  })

  it('escapes source for parse=false insertion into SV', () => {
    expect(escapeSnippetSource('<details>&</details>')).toBe(
      '&lt;details&gt;&amp;&lt;/details&gt;',
    )
  })

  it('checkpoints mouse and keyboard selection of a visible snippet hint', () => {
    document.body.innerHTML =
      '<div class="vditor-hint" style="display: block"><button class="vditor-hint--current"><span data-vmde-snippet-hint="1">Details</span></button></div><div id="editor"></div>'
    const checkpoint = vi.fn()
    const dispose = installSnippetHintUndoBoundary(document, checkpoint)
    document
      .querySelector('span')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document
      .querySelector('#editor')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
      )
    expect(checkpoint).toHaveBeenCalledTimes(2)
    dispose()
    document
      .querySelector('span')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(checkpoint).toHaveBeenCalledTimes(2)
  })
})
