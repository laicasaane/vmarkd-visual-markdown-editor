import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as vm from 'node:vm'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  dropRefImageTitleMarkers,
  dropSvRefTitleMarkers,
  fenceFor,
  fenceIndentedCode,
  normalizeWysiwygFenceMarker,
  repairIrBlocks,
  repairSvBlocks,
  repairWysiwygBlocks,
  restoreRefDefTitles,
  restoreSvRefDefTitles,
} from '../../src/lute-block-repair'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ZWSP = '​'

// ---------------------------------------------------------------------------
// Pure string layer.
// ---------------------------------------------------------------------------

describe('fenceFor', () => {
  it('uses three backticks when the content has none', () => {
    expect(fenceFor('plain code')).toBe('```')
  })

  it('outgrows the longest run in the content so it cannot be closed early', () => {
    expect(fenceFor('```\nx\n```')).toBe('````')
    expect(fenceFor('a ````` b')).toBe('``````')
  })

  it('never goes below three, however short the runs', () => {
    expect(fenceFor('a `b` c')).toBe('```')
  })
})

const markerless = (code: string) =>
  '<div data-block="0" data-type="code-block" class="vditor-ir__node">' +
  `<pre class="vditor-ir__marker--pre vditor-ir__marker"><code>${code}</code></pre>` +
  `<pre class="vditor-ir__preview" data-render="2"><code>${code}</code></pre></div>`

describe('fenceIndentedCode', () => {
  it('gives a markerless code-block div the open/info/close spans of a fence', () => {
    const out = fenceIndentedCode(markerless('x\n'))
    expect(out).toContain('<span data-type="code-block-open-marker">```</span>')
    expect(out).toContain(`data-type="code-block-info">${ZWSP}</span>`)
    expect(out).toContain(
      '<span data-type="code-block-close-marker">```</span>',
    )
  })

  it('sizes the fence to the content so an embedded fence cannot close it', () => {
    const out = fenceIndentedCode(markerless('```\nx\n```\n'))
    expect(out).toContain(
      '<span data-type="code-block-open-marker">````</span>',
    )
    expect(out).toContain(
      '<span data-type="code-block-close-marker">````</span>',
    )
  })

  it('leaves a div that already carries an open marker untouched', () => {
    const fenced =
      '<div data-block="0" data-type="code-block" class="vditor-ir__node">' +
      '<span data-type="code-block-open-marker">```</span>' +
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code>x\n</code></pre></div>'
    expect(fenceIndentedCode(fenced)).toBe(fenced)
  })

  it('repairs several blocks in one document, each with its own fence length', () => {
    const out = fenceIndentedCode(
      `${markerless('a\n')}<p>t</p>${markerless('```\n')}`,
    )
    expect(out.match(/code-block-open-marker">(`+)</g)).toEqual([
      'code-block-open-marker">```<',
      'code-block-open-marker">````<',
    ])
  })

  it('is a no-op — and does not even scan — without a code block', () => {
    const html = '<p data-block="0">nothing here</p>'
    expect(fenceIndentedCode(html)).toBe(html)
  })
})

const imgNode = (inner: string) =>
  `<p data-block="0"><span class="vditor-ir__node" data-type="img">${inner}<img src="p.png" alt="a" /></span></p>`
const TITLE =
  '<span class="vditor-ir__marker vditor-ir__marker--title">"T"</span>'

describe('dropRefImageTitleMarkers', () => {
  it('removes the title marker a REFERENCE image should never have carried', () => {
    const withMarker = imgNode(
      `<span class="vditor-ir__marker vditor-ir__marker--link">[r]</span>${TITLE}`,
    )
    expect(dropRefImageTitleMarkers(withMarker)).toBe(
      imgNode(
        '<span class="vditor-ir__marker vditor-ir__marker--link">[r]</span>',
      ),
    )
  })

  it('keeps the title of an INLINE image — its parens say the title is in the source', () => {
    const inline = imgNode(
      `<span class="vditor-ir__marker vditor-ir__marker--paren">(</span><span class="vditor-ir__marker vditor-ir__marker--link">p.png</span> ${TITLE}<span class="vditor-ir__marker vditor-ir__marker--paren">)</span>`,
    )
    expect(dropRefImageTitleMarkers(inline)).toBe(inline)
  })

  it('leaves a reference image that has no title marker alone', () => {
    const plain = imgNode(
      '<span class="vditor-ir__marker vditor-ir__marker--link">[r]</span>',
    )
    expect(dropRefImageTitleMarkers(plain)).toBe(plain)
  })
})

const defsDiv = (body: string) =>
  `<div data-block="0" data-type="link-ref-defs-block">${body}</div>`

describe('restoreRefDefTitles', () => {
  it('puts back a double-quoted title', () => {
    expect(
      restoreRefDefTitles(
        defsDiv('[r]: https://e.com\n'),
        () => '[a][r]\n\n[r]: https://e.com "T"\n',
      ),
    ).toBe(defsDiv('[r]: https://e.com "T"\n'))
  })

  it.each([
    ["'T'", "[r]: https://e.com 'T'"],
    ['(T)', '[r]: https://e.com (T)'],
  ])('puts back a %s title', (title, expected) => {
    expect(
      restoreRefDefTitles(
        defsDiv('[r]: https://e.com\n'),
        () => `[r]: https://e.com ${title}\n`,
      ),
    ).toBe(defsDiv(`${expected}\n`))
  })

  it('matches the label case-insensitively, as CommonMark does', () => {
    expect(restoreRefDefTitles(defsDiv('[R]: u\n'), () => '[r]: u "T"\n')).toBe(
      defsDiv('[R]: u "T"\n'),
    )
  })

  it('restores each definition of a multi-definition block independently', () => {
    expect(
      restoreRefDefTitles(
        defsDiv('[x]: u1\n[y]: u2\n'),
        () => '[x]: u1 "T1"\n[y]: u2\n',
      ),
    ).toBe(defsDiv('[x]: u1 "T1"\n[y]: u2\n'))
  })

  it('refuses to touch a definition whose destination Lute rewrote on purpose', () => {
    // `<url>` loses its angle brackets — a separate, non-destructive normalization. The repair may
    // only ever ADD a title back, never smuggle a destination change in behind one.
    const html = defsDiv('[r]: https://e.com\n')
    expect(restoreRefDefTitles(html, () => '[r]: <https://e.com> "T"\n')).toBe(
      html,
    )
  })

  it('leaves a title that sits on the following line alone rather than guessing', () => {
    const html = defsDiv('[r]: u\n')
    expect(restoreRefDefTitles(html, () => '[r]: u\n   "T"\n')).toBe(html)
  })

  it('never calls the oracle when the document has no definitions block', () => {
    let calls = 0
    const html = '<p data-block="0">plain</p>'
    expect(
      restoreRefDefTitles(html, () => {
        calls++
        return 'x'
      }),
    ).toBe(html)
    expect(calls).toBe(0)
  })

  it('bails when the oracle cannot produce the source', () => {
    const html = defsDiv('[r]: u\n')
    expect(restoreRefDefTitles(html, () => undefined)).toBe(html)
  })
})

// The sv (split) DOM is a flat span soup, not the div structure IR and WYSIWYG use — these are its
// two shapes, taken verbatim from `Md2VditorSVDOM` output.
const svRefImage = (title: string) =>
  '<span class="vditor-sv__marker">!</span>' +
  '<span class="vditor-sv__marker--bracket">[</span>' +
  '<span class="vditor-sv__marker--bracket">alt</span>' +
  '<span class="vditor-sv__marker--bracket">]</span>' +
  '<span class="vditor-sv__marker--link">[r]</span>' +
  `<span class="vditor-sv__marker--title">${title}</span>` +
  '<span data-type="text"> tail</span>'

const svInlineImage = (title: string) =>
  '<span class="vditor-sv__marker">!</span>' +
  '<span class="vditor-sv__marker--bracket">[</span>' +
  '<span class="vditor-sv__marker--bracket">alt</span>' +
  '<span class="vditor-sv__marker--bracket">]</span>' +
  '<span class="vditor-sv__marker--paren">(</span>' +
  '<span class="vditor-sv__marker--link">p.png</span> ' +
  `<span class="vditor-sv__marker--title">${title}</span>` +
  '<span class="vditor-sv__marker--paren">)</span>'

const svDef = (label: string, dest: string) =>
  '<span class="vditor-sv__marker--bracket">[</span>' +
  `<span class="vditor-sv__marker--link" data-type="link-ref-defs-block">${label}</span>` +
  '<span class="vditor-sv__marker--bracket">]</span>' +
  `<span>: </span>${dest}`

describe('dropSvRefTitleMarkers', () => {
  it('removes the title sv leaks after a reference image', () => {
    expect(dropSvRefTitleMarkers(svRefImage('"T"'))).not.toContain(
      'vditor-sv__marker--title',
    )
  })

  it('keeps an inline title — it is inside the paren form and genuinely the source', () => {
    const html = svInlineImage('"T"')
    expect(dropSvRefTitleMarkers(html)).toBe(html)
  })

  it('handles both in one document without disturbing the inline one', () => {
    const out = dropSvRefTitleMarkers(svRefImage('"A"') + svInlineImage('"B"'))
    expect(out).not.toContain('"A"')
    expect(out).toContain('<span class="vditor-sv__marker--title">"B"</span>')
  })

  it('leaves a document with no title marker untouched', () => {
    const html = svDef('r', 'u')
    expect(dropSvRefTitleMarkers(html)).toBe(html)
  })
})

describe('restoreSvRefDefTitles', () => {
  it.each([
    ['"T"', '[r]: u "T"\n'],
    ["'T'", "[r]: u 'T'\n"],
    ['(T)', '[r]: u (T)\n'],
  ])('puts a %s title back into the definition', (title, md) => {
    expect(restoreSvRefDefTitles(svDef('r', 'u'), () => md)).toContain(
      ` <span class="vditor-sv__marker--title">${title}</span>`,
    )
  })

  it('matches the label case-insensitively but keeps the emitted case', () => {
    const out = restoreSvRefDefTitles(svDef('R', 'u'), () => '[r]: u "T"\n')
    expect(out).toContain('>R</span>')
    expect(out).toContain('"T"')
  })

  it('escapes a title holding markup so it stays text', () => {
    const out = restoreSvRefDefTitles(
      svDef('r', 'u'),
      () => '[r]: u "A & B <x>"\n',
    )
    expect(out).toContain('"A &amp; B &lt;x&gt;"')
  })

  it('refuses when the destination differs — it may only ever ADD a title', () => {
    const html = svDef('r', 'normalized')
    expect(restoreSvRefDefTitles(html, () => '[r]: <original> "T"\n')).toBe(
      html,
    )
  })

  it('leaves an untitled definition alone', () => {
    const html = svDef('r', 'u')
    expect(restoreSvRefDefTitles(html, () => '[r]: u\n')).toBe(html)
  })

  it('does not touch a footnote definition', () => {
    const html =
      '<span class="vditor-sv__marker--bracket">[</span>' +
      '<span class="vditor-sv__marker--link" data-type="footnotes-link">^1</span>' +
      '<span class="vditor-sv__marker--bracket">]</span><span>: </span>note'
    expect(restoreSvRefDefTitles(html, () => '[^1]: note\n')).toBe(html)
  })

  it('skips the oracle entirely when there is no definitions block', () => {
    const html = svInlineImage('"T"')
    expect(
      restoreSvRefDefTitles(html, () => {
        throw new Error('oracle must not be consulted')
      }),
    ).toBe(html)
  })
})

describe('normalizeWysiwygFenceMarker', () => {
  const block = (marker: string, code: string) =>
    `<div class="vditor-wysiwyg__block" data-type="code-block" data-block="0" data-marker="${marker}">` +
    `<pre class="vditor-wysiwyg__pre" style="display: none"><code>${code}</code></pre></div>`

  it('replaces a marker Lute filled with the CONTENT instead of a fence', () => {
    expect(
      normalizeWysiwygFenceMarker(block('```\nx\n```\n', '```\nx\n```\n')),
    ).toBe(block('````', '```\nx\n```\n'))
  })

  it('leaves a correct backtick fence alone', () => {
    const html = block('```', 'plain\n')
    expect(normalizeWysiwygFenceMarker(html)).toBe(html)
  })

  it('leaves a tilde fence alone — its length is not a backtick question', () => {
    const html = block('~~~', '```\nx\n```\n')
    expect(normalizeWysiwygFenceMarker(html)).toBe(html)
  })

  it('reads each block’s own content, not the first block’s', () => {
    const out = normalizeWysiwygFenceMarker(
      block('```', 'plain\n') + block('```', '```\nx\n```\n'),
    )
    expect(out).toBe(block('```', 'plain\n') + block('````', '```\nx\n```\n'))
  })

  it('is a no-op without a wysiwyg code block', () => {
    const html = '<p data-block="0">t</p>'
    expect(normalizeWysiwygFenceMarker(html)).toBe(html)
  })
})

// ---------------------------------------------------------------------------
// Against the REAL vendored Lute — the round-trips the editor actually runs.
// ---------------------------------------------------------------------------

interface RealLute {
  Md2VditorIRDOM(md: string): string
  Md2VditorDOM(md: string): string
  Md2HTML(md: string): string
  VditorIRDOM2Md(html: string): string
  VditorDOM2Md(html: string): string
  SpinVditorIRDOM(html: string): string
  // Both sv entry points take MARKDOWN, unlike the IR/WYSIWYG spins which take HTML.
  Md2VditorSVDOM(md: string): string
  SpinVditorSVDOM(md: string): string
  SetVditorWYSIWYG(v: boolean): void
  SetSpin(v: boolean): void
}

let lute: RealLute
/** IR open → save. */
let irRoundTrip: (md: string) => string
/** IR open → one keystroke (spin) → save: what a user editing anywhere writes back. */
let irSpinRoundTrip: (md: string) => string
/** WYSIWYG open → save. */
let wysiwygRoundTrip: (md: string) => string

beforeAll(() => {
  const src = fs.readFileSync(
    `${ROOT}/media/vditor/dist/js/lute/lute.min.js`,
    'utf8',
  )
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
  vm.runInContext(src, sandbox, { filename: 'lute.min.js' })
  lute = (sandbox as { Lute: { New(): RealLute } }).Lute.New()
  lute.SetVditorWYSIWYG(true)
  lute.SetSpin(true)
  irRoundTrip = (md) =>
    lute.VditorIRDOM2Md(repairIrBlocks(lute.Md2VditorIRDOM(md), () => md))
  irSpinRoundTrip = (md) => {
    const dom = repairIrBlocks(lute.Md2VditorIRDOM(md), () => md)
    const spun = repairIrBlocks(lute.SpinVditorIRDOM(dom), () =>
      lute.VditorIRDOM2Md(dom),
    )
    return lute.VditorIRDOM2Md(spun)
  }
  wysiwygRoundTrip = (md) =>
    lute.VditorDOM2Md(repairWysiwygBlocks(lute.Md2VditorDOM(md), () => md))
})

describe('task 239 — an indented code block survives the IR save path', () => {
  it('is a code block again, not prose (the whole defect)', () => {
    expect(irRoundTrip('para\n\n    code line\n    second\n')).toBe(
      'para\n\n```\ncode line\nsecond\n```\n',
    )
  })

  it('survives the first spin — one keystroke anywhere used to destroy it', () => {
    expect(irSpinRoundTrip('para\n\n    code line\n    second\n')).toBe(
      'para\n\n```\ncode line\nsecond\n```\n',
    )
  })

  it('keeps its list indentation when the block sits inside a list item', () => {
    expect(irRoundTrip('- item\n\n      code\n')).toBe(
      '- item\n\n  ```\n  code\n  ```\n',
    )
  })

  it('keeps blank lines inside the block', () => {
    expect(irRoundTrip('p\n\n    a\n\n\n    b\n')).toBe(
      'p\n\n```\na\n\n\nb\n```\n',
    )
  })

  it.each([
    ['ir', () => irRoundTrip],
    ['ir+spin', () => irSpinRoundTrip],
    ['wysiwyg', () => wysiwygRoundTrip],
  ])('does not split into three blocks when the code contains a fence (%s)', (_name, get) => {
    const md = 'p\n\n    ```\n    x\n    ```\n'
    expect(lute.Md2HTML(get()(md))).toBe(lute.Md2HTML(md))
  })

  it.each([
    '```js\nx\n```\n',
    '~~~\nx\n~~~\n',
    '$$\nx=1\n$$\n',
  ])('leaves %j byte-identical — only indented blocks are markerless', (md) => {
    expect(irRoundTrip(md)).toBe(md)
  })

  it('changes nothing about YAML front matter', () => {
    // It carries its own open/close markers, so the repair must not see it. Asserted against the
    // UNREPAIRED round-trip rather than the source, because Lute drops the blank line after the
    // closing `---` on its own — a separate quirk this task neither causes nor fixes.
    const md = '---\na: 1\n---\n\np\n'
    expect(irRoundTrip(md)).toBe(lute.VditorIRDOM2Md(lute.Md2VditorIRDOM(md)))
  })
})

describe('task 240 — reference definition titles survive the save path', () => {
  it.each([
    '[a][r]\n\n[r]: https://e.com "T"\n',
    "[a][r]\n\n[r]: https://e.com 'T'\n",
    '[a][r]\n\n[r]: https://e.com (T)\n',
    '[a][x] [b][y]\n\n[x]: u1 "T1"\n[y]: u2 \'T2\'\n',
  ])('round-trips %j byte-identically', (md) => {
    expect(irRoundTrip(md)).toBe(md)
    expect(wysiwygRoundTrip(md)).toBe(md)
  })

  it('stops injecting the definition title into image alt text', () => {
    // Was: '![alt][r]"T"\n\n[r]: pic.png\n' — the title as literal prose.
    expect(irRoundTrip('![alt][r]\n\n[r]: pic.png "T"\n')).toBe(
      '![alt][r]\n\n[r]: pic.png "T"\n',
    )
  })

  it.each([
    '![a][]\n\n[a]: p.png "T"\n',
    '![a]\n\n[a]: p.png "T"\n',
  ])('keeps the collapsed/shortcut image form %j rendering the same', (md) => {
    expect(lute.Md2HTML(irRoundTrip(md))).toBe(lute.Md2HTML(md))
    expect(irRoundTrip(md)).not.toContain('"T"\n\n')
  })

  it('leaves an untitled definition byte-identical', () => {
    expect(irRoundTrip('[a][r]\n\n[r]: https://e.com\n')).toBe(
      '[a][r]\n\n[r]: https://e.com\n',
    )
  })

  it('preserves definition label case and order', () => {
    const md = '[a][Y] [b][X]\n\n[Y]: u1 "T1"\n[X]: u2 "T2"\n'
    expect(irRoundTrip(md)).toBe(md)
  })

  it.each([
    '[a](u "T")\n',
    '![alt](pic.png "T")\n',
  ])('leaves the INLINE title form %j untouched', (md) => {
    expect(irRoundTrip(md)).toBe(md)
  })
})

// sv is a SOURCE view: Vditor's getMarkdown returns `sv.element.textContent` verbatim, so the text
// these spans hold IS the file. Asserting on the HTML rather than on a hand-modelled textContent —
// modelling it means baking this test's idea of `<br>`/hidden-span handling into an expectation.
// `mode-roundtrip.spec.ts` is the round-trip proof, in a real VS Code.
describe('task 240 — the SPLIT (sv) path keeps definition titles too', () => {
  const svDom = (md: string) =>
    repairSvBlocks(lute.Md2VditorSVDOM(md), () => md)

  it.each([
    [
      '"Ref Title"',
      'See [a][ref].\n\n[ref]: https://example.com "Ref Title"\n',
    ],
    ["'Image Title'", "![i][r]\n\n[r]: pic.png 'Image Title'\n"],
    ['(T)', '[a][r]\n\n[r]: u (T)\n'],
  ])('restores the %s title Lute dropped from the definition', (title, md) => {
    expect(lute.Md2VditorSVDOM(md), 'the defect is still there').not.toContain(
      title,
    )
    expect(svDom(md)).toContain(
      `<span class="vditor-sv__marker--title">${title}</span>`,
    )
  })

  it('stops leaking the image title into the body text', () => {
    const md = 'a ![x][r] b\n\n[r]: p.png "T"\n'
    // Unrepaired, the title lands between the reference and the following prose.
    expect(lute.Md2VditorSVDOM(md)).toContain(
      '<span class="vditor-sv__marker--link">[r]</span><span class="vditor-sv__marker--title">"T"</span>',
    )
    expect(svDom(md)).toContain(
      '<span class="vditor-sv__marker--link">[r]</span><span data-type="text"> b</span>',
    )
  })

  it.each([
    '![a][]\n\n[a]: p.png "T"\n',
    '![a]\n\n[a]: p.png "T"\n',
  ])('drops the leak from the collapsed/shortcut form %j as well', (md) => {
    expect(svDom(md)).not.toContain(
      '<span class="vditor-sv__marker--bracket">]</span><span class="vditor-sv__marker--title">',
    )
  })

  it.each([
    '[a](u "T")\n',
    '![alt](p.png "T")\n',
  ])('leaves the INLINE title form %j exactly as Lute built it', (md) => {
    expect(svDom(md)).toBe(lute.Md2VditorSVDOM(md))
  })

  it('leaves an untitled definition exactly as Lute built it', () => {
    const md = '[a][r]\n\n[r]: https://e.com\n'
    expect(svDom(md)).toBe(lute.Md2VditorSVDOM(md))
  })

  it('leaves a footnote definition exactly as Lute built it', () => {
    const md = 'a[^1]\n\n[^1]: note\n'
    expect(svDom(md)).toBe(lute.Md2VditorSVDOM(md))
  })

  it('is the same repair for the spin — sv spins MARKDOWN, not HTML', () => {
    // Probed: SpinVditorSVDOM(md) === Md2VditorSVDOM(md). Vditor calls it with a block's
    // textContent (sv/process.ts) or the whole document (toolbar/EditMode.ts), never with HTML.
    const md = '[a][r]\n\n[r]: u "T"\n'
    expect(lute.SpinVditorSVDOM(md)).toBe(lute.Md2VditorSVDOM(md))
    expect(repairSvBlocks(lute.SpinVditorSVDOM(md), () => md)).toBe(svDom(md))
  })
})

describe('the repairs never change what the document renders to', () => {
  it.each([
    'para\n\n    code line\n    second\n',
    '- item\n\n      code\n',
    'p\n\n    ```\n    x\n    ```\n',
    '[a][r]\n\n[r]: https://e.com "T"\n',
    '![alt][r]\n\n[r]: pic.png "T"\n',
    '```js\nx\n```\n',
    '$$\nx=1\n$$\n',
    '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
  ])('%j', (md) => {
    const rendered = lute.Md2HTML(md)
    expect(lute.Md2HTML(irRoundTrip(md))).toBe(rendered)
    expect(lute.Md2HTML(irSpinRoundTrip(md))).toBe(rendered)
    expect(lute.Md2HTML(wysiwygRoundTrip(md))).toBe(rendered)
  })
})
