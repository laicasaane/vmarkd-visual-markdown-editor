// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createDetailsController, pairDetailsBlocks } from './details'

const htmlBlock = (source: string, id = '') =>
  `<div ${id ? `id="${id}" ` : ''}data-block="0" data-type="html-block" class="vditor-ir__node"><pre class="vditor-ir__marker--pre"><code data-type="html-block">${source.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</code></pre><pre class="vditor-ir__preview" data-render="2"></pre></div>`

function editor(markup: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'vditor-reset vditor-ir'
  root.contentEditable = 'true'
  root.innerHTML = markup
  document.body.replaceChildren(root)
  return root
}

describe('details HTML-block pairing', () => {
  it('pairs multiple and nested details while ignoring unclosed blocks', () => {
    const root = editor(
      [
        htmlBlock('<details>\n<summary>Outer</summary>', 'outer'),
        '<p id="outer-body">body</p>',
        htmlBlock('<details open>\n<summary>Inner</summary>', 'inner'),
        '<p id="inner-body">nested</p>',
        htmlBlock('</details>', 'inner-end'),
        htmlBlock('</details>', 'outer-end'),
        htmlBlock('<details><summary>Unclosed</summary>', 'unclosed'),
      ].join(''),
    )

    const pairs = pairDetailsBlocks(root)
    expect(pairs).toHaveLength(2)
    expect(pairs.map((pair) => pair.summary)).toEqual(['Inner', 'Outer'])
    expect(pairs[0]).toMatchObject({ defaultOpen: true })
    expect(pairs[0].start.id).toBe('inner')
    expect(pairs[0].end.id).toBe('inner-end')
    expect(pairs[1].start.id).toBe('outer')
    expect(pairs[1].end.id).toBe('outer-end')
  })

  it('keeps independent sibling pairs in source order', () => {
    const root = editor(
      htmlBlock('<details><summary>One</summary>', 'one') +
        '<p>first</p>' +
        htmlBlock('</details>', 'one-end') +
        htmlBlock('<details open><summary>Two</summary>', 'two') +
        '<p>second</p>' +
        htmlBlock('</details>', 'two-end'),
    )
    expect(
      pairDetailsBlocks(root).map(({ summary, defaultOpen }) => ({
        summary,
        defaultOpen,
      })),
    ).toEqual([
      { summary: 'One', defaultOpen: false },
      { summary: 'Two', defaultOpen: true },
    ])
  })

  it('ignores details-shaped tags inside HTML comments', () => {
    const root = editor(
      htmlBlock('<!-- <details><summary>Fake</summary> -->', 'comment') +
        '<p id="victim">Must stay visible</p>' +
        htmlBlock('<!-- </details> -->', 'comment-end'),
    )
    expect(pairDetailsBlocks(root)).toEqual([])
    const controller = createDetailsController(root)
    expect(root.querySelector('.vmde-details__toggle')).toBeNull()
    expect(
      root
        .querySelector<HTMLElement>('#victim')!
        .hasAttribute('data-vmde-details-hidden'),
    ).toBe(false)
    controller.dispose()
  })

  it('ignores details-shaped text inside raw HTML elements', () => {
    const root = editor(
      htmlBlock(
        '<script>const sample = "<details><summary>Fake</summary></details>"</script>',
      ) +
        htmlBlock('<details><summary>Real</summary>', 'real') +
        '<p>real body</p>' +
        htmlBlock('</details>', 'real-end'),
    )
    expect(pairDetailsBlocks(root)).toMatchObject([
      { start: { id: 'real' }, end: { id: 'real-end' }, summary: 'Real' },
    ])
  })

  it('does not accept a raw-element closing tag-name prefix', () => {
    const root = editor(
      htmlBlock(
        '<script>const sample = 1</scriptx><details><summary>Fake</summary></script>',
      ) +
        '<p id="victim">Must stay visible</p>' +
        htmlBlock('</details>'),
    )
    expect(pairDetailsBlocks(root)).toEqual([])
  })

  it('consolidates Lute-coalesced nested tags onto the outer DOM pair', () => {
    const root = editor(
      htmlBlock(
        '<details>\n<summary>Outer</summary>\n<details open>\n<summary>Inner</summary>',
        'shared-start',
      ) +
        '<p>nested body</p>' +
        htmlBlock('</details>\n</details>', 'shared-end'),
    )
    expect(pairDetailsBlocks(root)).toMatchObject([
      {
        start: { id: 'shared-start' },
        end: { id: 'shared-end' },
        summary: 'Outer',
        defaultOpen: false,
      },
    ])
    const controller = createDetailsController(root)
    expect(root.querySelectorAll('.vmde-details__toggle')).toHaveLength(1)
    expect(
      root
        .querySelector('.vmde-details__toggle')
        ?.getAttribute('aria-expanded'),
    ).toBe('false')
    controller.dispose()
  })
})

describe('details edit-mode controller', () => {
  it('uses a semantic toggle, follows open defaults, and changes visual state only', () => {
    const root = editor(
      htmlBlock('<details><summary>More <em>info</em></summary>', 'start') +
        '<p id="body">Body</p>' +
        htmlBlock('</details>', 'end') +
        htmlBlock('<details open><summary>Open initially</summary>', 'open') +
        '<p id="open-body">Visible</p>' +
        htmlBlock('</details>', 'open-end') +
        '<p id="outside">Outside</p>',
    )
    const authored = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>('pre code, #body, #open-body'),
      ).map((element) => element.textContent)
    const before = authored()
    const controller = createDetailsController(root)

    const start = root.querySelector<HTMLElement>('#start')!
    const body = root.querySelector<HTMLElement>('#body')!
    const button = start.querySelector<HTMLButtonElement>(
      '.vmde-details__toggle',
    )!
    expect(button.tagName).toBe('BUTTON')
    expect(button.textContent).toContain('More info')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(body.hasAttribute('data-vmde-details-hidden')).toBe(true)
    expect(
      root
        .querySelector<HTMLElement>('#open-body')!
        .hasAttribute('data-vmde-details-hidden'),
    ).toBe(false)

    const rootQuery = vi.spyOn(root, 'querySelectorAll')
    controller.apply()
    expect(rootQuery).not.toHaveBeenCalled()
    rootQuery.mockRestore()

    const bodyWrite = vi.spyOn(body, 'setAttribute')
    const boundaryRead = vi.spyOn(
      root.querySelector<HTMLElement>('#start')!,
      'compareDocumentPosition',
    )
    controller.applyWithin(root.querySelector('#outside')!)
    expect(bodyWrite).not.toHaveBeenCalled()
    expect(boundaryRead).not.toHaveBeenCalled()
    const outsideText = root.querySelector<HTMLElement>('#outside')!.firstChild!
    const outsideRange = document.createRange()
    outsideRange.setStart(outsideText, 1)
    outsideRange.collapse(true)
    const outsideSelection = document.getSelection()!
    outsideSelection.removeAllRanges()
    outsideSelection.addRange(outsideRange)
    document.dispatchEvent(new Event('selectionchange'))
    expect(boundaryRead).not.toHaveBeenCalled()
    bodyWrite.mockRestore()
    boundaryRead.mockRestore()

    button.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
    )
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(body.hasAttribute('data-vmde-details-hidden')).toBe(false)
    expect(authored()).toEqual(before)

    button.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
    )
    const replacement = document.createElement('p')
    replacement.id = 'body-replacement'
    replacement.textContent = 'Replacement body'
    body.replaceWith(replacement)
    controller.applyWithin(replacement)
    expect(replacement.hasAttribute('data-vmde-details-hidden')).toBe(true)

    controller.dispose()
    expect(root.querySelector('.vmde-details__toggle')).toBeNull()
    expect(replacement.hasAttribute('data-vmde-details-hidden')).toBe(false)
  })

  it('reveals both raw tags and the body while the caret is inside, then restores collapse', () => {
    const root = editor(
      htmlBlock('<details>\n<summary>Details</summary>', 'start') +
        '<p id="body">Body text</p>' +
        htmlBlock('</details>', 'end') +
        '<p id="after">After</p>',
    )
    const controller = createDetailsController(root)
    const body = root.querySelector<HTMLElement>('#body')!
    const text = body.firstChild!
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(text, 2)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))

    expect(
      root
        .querySelector<HTMLElement>('#start')!
        .hasAttribute('data-vmde-details-editing'),
    ).toBe(true)
    expect(
      root
        .querySelector<HTMLElement>('#end')!
        .hasAttribute('data-vmde-details-editing'),
    ).toBe(true)
    expect(body.hasAttribute('data-vmde-details-hidden')).toBe(false)

    const after = root.querySelector<HTMLElement>('#after')!.firstChild!
    range.setStart(after, 1)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    expect(root.querySelector('[data-vmde-details-editing]')).toBeNull()
    expect(body.hasAttribute('data-vmde-details-hidden')).toBe(true)
    controller.dispose()
  })
})
