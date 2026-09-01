// @vitest-environment jsdom

import fs from 'node:fs'
import vm from 'node:vm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resolveSvSourceLink } from './sv-source-link'

interface RealLute {
  Md2VditorSVDOM(markdown: string): string
  SetVditorSV(enabled: boolean): void
}

let lute: RealLute

beforeAll(() => {
  const sandbox: Record<string, unknown> = {
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(
    fs.readFileSync('media/vditor/dist/js/lute/lute.min.js', 'utf8'),
    sandbox,
  )
  lute = (sandbox as { Lute: { New(): RealLute } }).Lute.New()
  lute.SetVditorSV(true)
})

beforeEach(() => document.body.replaceChildren())

function render(markdown: string): HTMLElement {
  const root = document.createElement('pre')
  root.className = 'vditor-sv'
  root.innerHTML = lute.Md2VditorSVDOM(markdown)
  document.body.append(root)
  return root
}

function exactSpan(root: Element, text: string): HTMLElement {
  const target = Array.from(root.querySelectorAll<HTMLElement>('span')).find(
    (element) => element.textContent === text,
  )
  if (!target) throw new Error(`SV span not found: ${text}`)
  return target
}

describe('resolveSvSourceLink against the vendored Lute SV DOM', () => {
  it('resolves inline label and destination clicks with raw href fidelity', () => {
    const root = render('[Label](./notes/a%20b.md?q=x#frag)')
    const label = root.querySelector<HTMLElement>('[data-type="link-text"]')!
    const destination = root.querySelector<HTMLElement>(
      '.vditor-sv__marker--link',
    )!

    expect(resolveSvSourceLink(label)).toBe('./notes/a%20b.md?q=x#frag')
    expect(resolveSvSourceLink(destination)).toBe('./notes/a%20b.md?q=x#frag')
  })

  it.each([
    ['[Title](<./a b.md> "Shown")', './a b.md'],
    ['[Escaped](./a\\(b\\).md)', './a\\(b\\).md'],
    ['[Nested](https://example.com/a_(b))', 'https://example.com/a_(b)'],
    ['<https://example.com/a?q=x#f>', 'https://example.com/a?q=x#f'],
    ['<mail@example.com>', 'mailto:mail@example.com'],
    ['<tel:+123456>', 'tel:+123456'],
  ])('resolves %s as %s', (markdown, expected) => {
    const root = render(markdown)
    expect(
      resolveSvSourceLink(
        root.querySelector<HTMLElement>('[data-type="link-text"]')!,
      ),
    ).toBe(expected)
    expect(
      resolveSvSourceLink(
        root.querySelector<HTMLElement>('.vditor-sv__marker--link')!,
      ),
    ).toBe(expected)
  })

  it('keeps two inline links in one source line isolated', () => {
    const root = render('[A](one.md) and [B](two.md)')
    const labels = root.querySelectorAll<HTMLElement>('[data-type="link-text"]')
    const destinations = root.querySelectorAll<HTMLElement>(
      '.vditor-sv__marker--link',
    )

    expect(resolveSvSourceLink(labels[0])).toBe('one.md')
    expect(resolveSvSourceLink(destinations[0])).toBe('one.md')
    expect(resolveSvSourceLink(labels[1])).toBe('two.md')
    expect(resolveSvSourceLink(destinations[1])).toBe('two.md')
  })

  it('resolves full reference labels and markers from their source definitions', () => {
    const root = render(
      '[A][one] and [B][two]\n\n[one]: ./one.md\n[two]: ../two%20file.md#part',
    )
    const refs = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.vditor-sv__marker--link:not([data-type])',
      ),
    )
    const labelA = exactSpan(root, 'A')
    const labelB = exactSpan(root, 'B')

    expect(resolveSvSourceLink(labelA)).toBe('./one.md')
    expect(resolveSvSourceLink(refs[0])).toBe('./one.md')
    expect(resolveSvSourceLink(labelB)).toBe('../two%20file.md#part')
    expect(resolveSvSourceLink(refs[1])).toBe('../two%20file.md#part')
  })

  it('normalizes reference labels while preserving an angle destination raw href', () => {
    const root = render(
      '[A][Mixed Label]\n\n[mIxEd Label]: <../two%20file.md?q=x#part> "Title"',
    )
    const reference = root.querySelector<HTMLElement>(
      '.vditor-sv__marker--link:not([data-type])',
    )!

    expect(resolveSvSourceLink(reference)).toBe('../two%20file.md?q=x#part')
  })

  it.each([
    ['image destination', '![Alt](./image.png)', './image.png'],
    ['reference image', '![Alt][ref]\n\n[ref]: image.png', '[ref]'],
    ['definition', '[ref]: ./target.md', 'ref'],
    ['footnote use', 'Text[^1]\n\n[^1]: note', '^1'],
    ['code span', '`[Code](./no.md)`', '[Code](./no.md)'],
    ['incomplete link', '[Broken](./no.md', '[Broken](./no.md'],
    ['collapsed reference', '[ref][]\n\n[ref]: target.md', 'ref'],
    ['shortcut reference', '[ref]\n\n[ref]: target.md', 'ref'],
  ])('rejects %s', (_label, markdown, clickedText) => {
    const root = render(markdown)
    expect(resolveSvSourceLink(exactSpan(root, clickedText))).toBeNull()
  })

  it('rejects bracket/paren markers and detached link nodes', () => {
    const root = render('[Label](target.md)')
    const bracket = exactSpan(root, '[')
    const paren = exactSpan(root, '(')
    const label = root.querySelector<HTMLElement>('[data-type="link-text"]')!
    label.remove()

    expect(resolveSvSourceLink(bracket)).toBeNull()
    expect(resolveSvSourceLink(paren)).toBeNull()
    expect(resolveSvSourceLink(label)).toBeNull()
  })
})
