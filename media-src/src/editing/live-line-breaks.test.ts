// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { wrapLiveLineBreakIdentity } from './live-line-breaks'

function fakeLute(
  renderedHtml = '<p data-block="0">soft alpha\nsoft beta</p>' +
    '<p data-block="0">two-space alpha<br />two-space beta</p>' +
    '<p data-block="0">backslash alpha<br />backslash beta</p>',
) {
  const render = vi.fn((_markdown: string) => renderedHtml)
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
  it('keeps soft source bytes in text nodes while retaining exact hard-break identity', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute)

    const dom = lute.Md2VditorIRDOM(markdown)
    expect(dom).toContain('soft alpha\nsoft beta')
    expect(dom).not.toContain('data-vmde-soft-break')
    expect(dom.match(/data-vmde-hard-break=/gu)).toHaveLength(2)
    expect(lute.VditorIRDOM2Md(dom)).toBe(`${markdown}\n`)
  })

  it('leaves every prose and verbatim container byte-identical for CSS reflow', () => {
    const rendered =
      '<p>Evidence: <span data-type="a"><span class="vditor-ir__link">label</span></span>\nand section</p>' +
      '<p><strong>strong alpha\nstrong beta</strong></p>' +
      '<ul><li>list alpha\nlist beta</li></ul>' +
      '<blockquote><p>quote alpha\nquote beta</p></blockquote>' +
      '<pre data-type="code-block"><code>code alpha\ncode beta</code></pre>'
    const { lute } = fakeLute(rendered)
    wrapLiveLineBreakIdentity(lute)

    const dom = lute.Md2VditorIRDOM('no explicit hard breaks')

    expect(dom).toBe(rendered)
    expect(dom).not.toContain('data-vmde-soft-break')
    expect(dom).toContain('code alpha\ncode beta')
  })

  it('leaves soft breaks raw and marks exact hard breaks in IR and WYSIWYG', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute)

    for (const render of [lute.Md2VditorIRDOM, lute.Md2VditorDOM]) {
      const dom = render(markdown)
      expect(dom).toContain('soft alpha\nsoft beta')
      expect(dom).not.toContain('data-vmde-soft-break')
      expect(dom).toContain('data-vmde-hard-break="%20%20"')
      expect(dom).toContain('data-vmde-hard-break="%5C"')
    }
  })

  it('restores byte-exact Markdown through both serializers', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute)
    const ir = lute.Md2VditorIRDOM(markdown)
    const wysiwyg = lute.Md2VditorDOM(markdown)

    expect(lute.VditorIRDOM2Md(ir)).toBe(`${markdown}\n`)
    expect(lute.VditorDOM2Md(wysiwyg)).toBe(`${markdown}\n`)
  })

  it('keeps raw soft breaks and hard-break identity through both spin methods', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute)

    for (const [render, spin] of [
      [lute.Md2VditorIRDOM, lute.SpinVditorIRDOM],
      [lute.Md2VditorDOM, lute.SpinVditorDOM],
    ] as const) {
      const spun = spin(render(markdown))
      expect(spun).toContain('soft alpha\nsoft beta')
      expect(spun).not.toContain('data-vmde-soft-break')
      expect(spun.match(/data-vmde-hard-break=/gu)).toHaveLength(2)
    }
  })

  it('restores exact hard-break suffixes in SV source DOM', () => {
    const { lute } = fakeLute()
    wrapLiveLineBreakIdentity(lute)

    const root = document.createElement('div')
    root.innerHTML = lute.SpinVditorSVDOM(markdown)
    expect(root.textContent).toBe(`${markdown}\n`)
  })

  it('is idempotent when installers race on the same Lute instance', () => {
    const { lute, render } = fakeLute()
    wrapLiveLineBreakIdentity(lute)
    wrapLiveLineBreakIdentity(lute)

    lute.Md2VditorIRDOM(markdown)
    expect(render).toHaveBeenCalledTimes(1)
  })
})
