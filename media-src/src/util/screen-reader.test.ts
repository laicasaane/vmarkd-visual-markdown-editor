// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { announce, installScreenReaderSemantics } from './screen-reader'

describe('screen-reader editor semantics', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="app"><pre class="vditor-ir" contenteditable="true"></pre>' +
      '<pre class="vditor-wysiwyg" contenteditable="true"></pre>' +
      '<pre class="vditor-sv" contenteditable="true"></pre></div>'
  })

  it('labels every editable mode as one multiline textbox for the document', () => {
    installScreenReaderSemantics('guide.md')

    for (const editor of document.querySelectorAll(
      '.vditor-ir, .vditor-wysiwyg, .vditor-sv',
    )) {
      expect(editor.getAttribute('role')).toBe('textbox')
      expect(editor.getAttribute('aria-multiline')).toBe('true')
      expect(editor.getAttribute('aria-label')).toBe(
        'Markdown editor for guide.md',
      )
    }
  })

  it('creates one polite atomic live region and reuses it across re-init', async () => {
    installScreenReaderSemantics('first.md')
    installScreenReaderSemantics('second.md')
    announce('Saved second.md')
    await Promise.resolve()

    const regions = document.querySelectorAll('#vmde-live-region')
    expect(regions).toHaveLength(1)
    expect(regions[0].getAttribute('role')).toBe('status')
    expect(regions[0].getAttribute('aria-live')).toBe('polite')
    expect(regions[0].getAttribute('aria-atomic')).toBe('true')
    expect(regions[0].textContent).toBe('Saved second.md')
  })
})
