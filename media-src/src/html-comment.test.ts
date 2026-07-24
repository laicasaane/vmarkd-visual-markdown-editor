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

// Task 367 — the preview render sanitises, and Lute's sanitiser drops HTML comments outright, so an
// authored comment was missing from the Preview pane entirely while IR showed it. Rewrite it into
// something the sanitiser keeps, without disabling sanitising.
import { maskCommentsForPreview } from './html-comment'

describe('maskCommentsForPreview', () => {
  it('rewrites a block comment into a sanitiser-proof element carrying the same text', () => {
    expect(maskCommentsForPreview('a\n\n<!-- note -->\n\nb')).toBe(
      'a\n\n<div class="vmarkd-comment" data-vmarkd-comment="1">&lt;!-- note --&gt;</div>\n\nb',
    )
  })

  it('joins a multi-line comment into one block', () => {
    const out = maskCommentsForPreview('<!-- line one\nline two -->')
    expect(out).toBe(
      '<div class="vmarkd-comment" data-vmarkd-comment="1">&lt;!-- line one\nline two --&gt;</div>',
    )
  })

  it('escapes the comment body so it cannot inject markup', () => {
    const out = maskCommentsForPreview('<!-- <img src=x onerror=alert(1)> -->')
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(out).not.toContain('<img')
  })

  // The one that makes a naive regex wrong: inside a fence the comment is literal text the reader
  // asked to see.
  it('leaves a comment inside a fenced code block alone', () => {
    const md = 'a\n\n```html\n<!-- kept literal -->\n```\n\nb'
    expect(maskCommentsForPreview(md)).toBe(md)
  })

  it('handles tilde fences and longer closing fences', () => {
    const md = 'a\n\n~~~~\n<!-- kept -->\n~~~~\n\n<!-- masked -->'
    const out = maskCommentsForPreview(md)
    expect(out).toContain('~~~~\n<!-- kept -->\n~~~~')
    expect(out).toContain('&lt;!-- masked --&gt;')
  })

  it('resumes masking after a fence closes', () => {
    const out = maskCommentsForPreview('```\n<!-- a -->\n```\n\n<!-- b -->')
    expect(out).toContain('```\n<!-- a -->\n```')
    expect(out).toContain('&lt;!-- b --&gt;')
  })

  it('leaves a mid-paragraph comment inline (rewriting it would reflow the paragraph)', () => {
    const md = 'text <!-- inline --> more'
    expect(maskCommentsForPreview(md)).toBe(md)
  })

  it('labels an empty comment and is a no-op on a document without any', () => {
    expect(maskCommentsForPreview('<!---->')).toContain(
      '&lt;!-- (empty) --&gt;',
    )
    const plain = 'just prose\n\nmore'
    expect(maskCommentsForPreview(plain)).toBe(plain)
  })

  it('runs a comment left unterminated to the end rather than dropping the rest', () => {
    const out = maskCommentsForPreview('a\n\n<!-- never closed\nstill inside')
    expect(out).toContain('&lt;!-- never closed\nstill inside --&gt;')
  })
})
