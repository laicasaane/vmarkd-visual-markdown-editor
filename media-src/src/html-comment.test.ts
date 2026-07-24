// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { revealPreviewComments } from './html-comment'

// In the full Preview pane Lute emits raw HTML, so an authored `<!-- … -->` arrives as a DOM Comment
// node with no wrapper; revealPreviewComments turns each into a visible element.

function mount(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.replaceChildren(root)
  return root
}

describe('revealPreviewComments', () => {
  it('replaces an authored comment with a visible element', () => {
    const root = mount('<p>a</p><!-- note --><p>b</p>')
    revealPreviewComments(root)
    const el = root.querySelector('.vmarkd-comment')
    expect(el?.textContent).toBe('<!-- note -->')
    expect(el?.getAttribute('contenteditable')).toBe('false')
  })

  it('is idempotent (a second pass finds no Comment nodes left)', () => {
    const root = mount('<!-- note -->')
    revealPreviewComments(root)
    revealPreviewComments(root)
    expect(root.querySelectorAll('.vmarkd-comment')).toHaveLength(1)
  })

  it('labels an empty comment rather than rendering a blank box', () => {
    const root = mount('<!---->')
    revealPreviewComments(root)
    expect(root.querySelector('.vmarkd-comment')?.textContent).toBe(
      '<!-- (empty) -->',
    )
  })

  // Task 366 — graphviz carries the DOT source's own comments through into its rendered SVG (one
  // `<!-- A -->` per node). Rewriting those injected a <div> into an <svg> and made the Preview
  // pane's graphviz markup differ from the IR pane's, where this pass never runs.
  it('leaves comments INSIDE a rendered diagram alone', () => {
    const root = mount(
      '<div class="language-graphviz"><svg><!-- A --><g><!-- B --></g></svg></div>',
    )
    revealPreviewComments(root)
    expect(root.querySelectorAll('.vmarkd-comment')).toHaveLength(0)
    expect(root.querySelector('svg')?.innerHTML).toContain('<!-- A -->')
  })

  it('still reveals an authored comment that merely SITS NEXT TO a diagram', () => {
    const root = mount(
      '<div class="language-graphviz"><svg><!-- A --></svg></div><!-- mine -->',
    )
    revealPreviewComments(root)
    const found = Array.from(root.querySelectorAll('.vmarkd-comment')).map(
      (e) => e.textContent,
    )
    expect(found).toEqual(['<!-- mine -->'])
  })
})
