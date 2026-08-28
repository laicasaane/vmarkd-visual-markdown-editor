// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { wrapLiveLineBreakIdentity } from './live-line-breaks'

function fakeLute() {
  const render = vi.fn(
    (_markdown: string) =>
      '<p data-block="0">soft alpha\nsoft beta</p>' +
      '<p data-block="0">two-space alpha<br />two-space beta</p>' +
      '<p data-block="0">backslash alpha<br />backslash beta</p>',
  )
  const serialize = vi.fn((html: string) => {
    const root = document.createElement('div')
    root.innerHTML = html
    return (
      Array.from(root.children, (child) => child.textContent).join('\n\n') +
      '\n'
    )
  })
  const spin = vi.fn((html: string) => html)
  const spinSv = vi.fn((markdown: string) =>
    markdown
      .split('\n')
      .map(
        (line) =>
          `<span data-type="text">${line.replace(/ {2,}$|\\$/u, '')}</span>` +
          '<span data-type="newline"><br><span style="display:none">\n</span></span>',
      )
      .join(''),
  )
  return {
    lute: {
      Md2VditorIRDOM: render,
      Md2VditorDOM: render,
      VditorIRDOM2Md: serialize,
      VditorDOM2Md: serialize,
      SpinVditorIRDOM: spin,
      SpinVditorDOM: spin,
      SpinVditorSVDOM: spinSv,
    },
    render,
    serialize,
    spin,
  }
}

const markdown = [
  'soft alpha',
  'soft beta',
  '',
  'two-space alpha  ',
  'two-space beta',
  '',
  'backslash alpha\\',
  'backslash beta',
].join('\n')

describe('wrapLiveLineBreakIdentity', () => {
  it('keeps soft breaks visually unchanged while disabled but still tags hard-break identity', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute, () => false)

    const dom = lute.Md2VditorIRDOM(markdown)
    expect(dom).toContain('soft alpha\nsoft beta')
    expect(dom).not.toContain('data-vmarkd-soft-break')
    expect(dom.match(/data-vmarkd-hard-break=/gu)).toHaveLength(2)
    expect(lute.VditorIRDOM2Md(dom)).toBe(`${markdown}\n`)
  })

  it('marks soft and exact hard breaks in IR and WYSIWYG render output', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute, () => true)

    for (const render of [lute.Md2VditorIRDOM, lute.Md2VditorDOM]) {
      const dom = render(markdown)
      expect(dom.match(/data-vmarkd-soft-break="1"/gu)).toHaveLength(1)
      expect(dom).toContain('data-vmarkd-hard-break="%20%20"')
      expect(dom).toContain('data-vmarkd-hard-break="%5C"')
    }
  })

  it('restores byte-exact Markdown through both serializers', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute, () => true)
    const ir = lute.Md2VditorIRDOM(markdown)
    const wysiwyg = lute.Md2VditorDOM(markdown)

    expect(lute.VditorIRDOM2Md(ir)).toBe(`${markdown}\n`)
    expect(lute.VditorDOM2Md(wysiwyg)).toBe(`${markdown}\n`)
  })

  it('keeps identity nodes through both block spin methods', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute, () => true)

    for (const [render, spin] of [
      [lute.Md2VditorIRDOM, lute.SpinVditorIRDOM],
      [lute.Md2VditorDOM, lute.SpinVditorDOM],
    ] as const) {
      const spun = spin(render(markdown))
      expect(spun.match(/data-vmarkd-soft-break="1"/gu)).toHaveLength(1)
      expect(spun.match(/data-vmarkd-hard-break=/gu)).toHaveLength(2)
    }
  })

  it('restores exact hard-break suffixes in SV source DOM', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute, () => false)

    const root = document.createElement('div')
    root.innerHTML = lute.SpinVditorSVDOM(markdown)
    expect(root.textContent).toBe(`${markdown}\n`)
  })

  it('is idempotent when installers race on the same Lute instance', () => {
    const { lute, render } = fakeLute()
    wrapLiveLineBreakIdentity(lute, () => true)
    wrapLiveLineBreakIdentity(lute, () => true)

    lute.Md2VditorIRDOM(markdown)
    expect(render).toHaveBeenCalledTimes(1)
  })
})
