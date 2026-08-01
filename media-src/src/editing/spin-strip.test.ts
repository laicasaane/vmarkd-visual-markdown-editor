// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { stripPreviewForSpin } from './spin-strip'

// The IR dual-node shape: editable source `<code>` (carries the `<wbr>` caret) + a rendered preview.
const block = (preview: string) =>
  `<div data-block="0" class="vditor-ir__node vditor-ir__node--expand" data-type="code-block">` +
  `<pre class="vditor-ir__marker--pre"><code class="language-mermaid">graph TD; A--&gt;B;<wbr></code></pre>` +
  preview +
  `</div>`

const bigSvg = `<svg width="800" height="600">${'<path d="M0 0"/><text>n</text>'.repeat(500)}</svg>`

describe('stripPreviewForSpin (task 172)', () => {
  it('is a no-op for prose / blocks with no rendered preview', () => {
    const prose = '<p data-block="0">The quick brown fox.<wbr></p>'
    expect(stripPreviewForSpin(prose)).toBe(prose)
  })

  it('empties the rendered preview SVG but keeps the source <code> and its <wbr>', () => {
    const html = block(
      `<pre class="vditor-ir__preview" data-render="2"><code>${bigSvg}</code></pre>`,
    )
    const out = stripPreviewForSpin(html)
    expect(out).not.toContain('<svg') // the heavy render is gone from the spin input
    expect(out).not.toContain('<path')
    expect(out).toContain('language-mermaid') // source markers preserved
    expect(out).toContain('graph TD; A--&gt;B;') // source text round-trips (entity preserved)
    expect(out).toContain('<wbr>') // caret marker survives (it lives in the source, not the preview)
    expect(out).toContain('vditor-ir__preview') // the data-render shell is kept (the spin rebuilds it)
    expect(out).toContain('data-render="2"')
    // and the input shrank dramatically
    expect(out.length).toBeLessThan(html.length / 5)
  })

  it('strips our task-161 keep-last overlay too', () => {
    const html = block(
      `<pre class="vditor-ir__preview vmarkd-deferred" data-render="2">` +
        `<div class="vmarkd-stale-overlay" data-render="1">${bigSvg}</div>` +
        `</pre>`,
    )
    const out = stripPreviewForSpin(html)
    expect(out).not.toContain('<svg')
    expect(out).toContain('<wbr>')
  })

  it('handles multiple previews (widened/multi-block spin) in one pass', () => {
    const html =
      block(
        `<pre class="vditor-ir__preview" data-render="2"><code>${bigSvg}</code></pre>`,
      ) +
      block(
        `<pre class="vditor-ir__preview" data-render="2"><code>${bigSvg}</code></pre>`,
      )
    const out = stripPreviewForSpin(html)
    expect(out.match(/<svg/g)).toBeNull()
    expect(out.match(/language-mermaid/g)?.length).toBe(2) // both sources kept
  })
})
