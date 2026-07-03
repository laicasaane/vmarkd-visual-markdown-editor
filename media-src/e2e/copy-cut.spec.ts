import { expect, test } from './coverage-fixture'
import {
  collapseCaret,
  getValue,
  gotoMouseops,
  selectAllContent,
  selectWithin,
  setDoc,
  syntheticClipboard,
  tripleClick,
  UNSET,
} from './mouseops-helpers'

// NET (task 191 P0-1..3) — the copy/cut CLIPBOARD PAYLOAD on the real wire. A mouse
// copy/cut is a corruption path: the serialized markdown it puts on the clipboard must
// restore markers (**, `, [[..]]) and leak NO editor DOM (hljs spans, chip markup),
// and a cut must remove exactly the selected block and post exactly one edit. These
// drive Vditor's real copyEvent/cutEvent handlers (ir/index.ts, wysiwyg/index.ts,
// sv/index.ts) via a synthetic ClipboardEvent whose DataTransfer we read back.

test.describe('P0-1 IR copy payload', () => {
  test('cross-block selection serializes to exact markdown, restoring markers + [[wiki]], html empty', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(
      page,
      '# Heading One\n\nProse with **bold text** and a [[Home]] wiki link.\n',
    )
    await selectAllContent(page)
    const { plain, html } = await syntheticClipboard(page, 'copy')

    // Markers + the wiki chip are serialized back to source, NOT the rendered DOM text.
    expect(plain).toContain('# Heading One')
    expect(plain).toContain('**bold text**')
    expect(plain).toContain('[[Home]]')
    // No editor DOM leaked into the clipboard (chip span / data-attrs / tags).
    expect(plain).not.toContain('wiki-link-chip')
    expect(plain).not.toContain('data-type')
    expect(plain).not.toMatch(/<[a-z]/i)
    // The IR copy handler always clears text/html (source markdown only).
    expect(html).toBe('')
  })

  test('triple-click selects the line marker-inclusive (** restored on copy)', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'A paragraph with **bold word** in it.\n')
    // Real triple-click selects the whole rendered line; the hidden ** markers are in
    // the selectable flow, so the serialized copy restores them.
    await tripleClick(page, '.vditor-ir [data-block] , .vditor-ir p')
    const { plain } = await syntheticClipboard(page, 'copy')
    expect(plain).toContain('**bold word**')
  })

  test('empty (collapsed) selection is an early-return: clipboard untouched', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'Some prose here.\n')
    await collapseCaret(page)
    const { plain, html } = await syntheticClipboard(page, 'copy')
    // range.toString() === '' → handler returns before touching the DataTransfer.
    expect(plain).toBe(UNSET)
    expect(html).toBe(UNSET)
  })
})

test.describe('P0-2 WYSIWYG copy branches', () => {
  test('inside inline code → backtick-wrapped code, html empty', async ({
    page,
  }) => {
    await gotoMouseops(page, 'wysiwyg')
    await setDoc(page, 'Text with `inline code` here.\n')
    await selectWithin(page, 'code')
    const { plain, html } = await syntheticClipboard(page, 'copy')
    // Vditor pads inline code with a ZWSP (U+200B) for caret positioning
    // (codeRender.ts:58); it currently rides along in the copied text — tracked as
    // Probe-19. Normalize it out so this NET protects the backtick-wrap branch, not
    // the ZWSP (and stays green if/when Probe-19 strips it).
    expect(plain.replace(/\u200b/g, '')).toBe('`inline code`')
    expect(html).toBe('')
  })

  test('inside a fenced code block → raw code (no fence), html empty', async ({
    page,
  }) => {
    await gotoMouseops(page, 'wysiwyg')
    await setDoc(page, '```js\nconst answer = 42\n```\n')
    await selectWithin(page, 'pre code')
    const { plain, html } = await syntheticClipboard(page, 'copy')
    // PRE>CODE branch copies the visible code text only (range.toString()), no ``` fence.
    expect(plain.trim()).toBe('const answer = 42')
    expect(plain).not.toContain('```')
    expect(html).toBe('')
  })

  test('inside a titled link → [text](href "title"), html empty', async ({
    page,
  }) => {
    await gotoMouseops(page, 'wysiwyg')
    await setDoc(page, 'See [the docs](https://example.com "My Title") now.\n')
    await selectWithin(page, 'a')
    const { plain, html } = await syntheticClipboard(page, 'copy')
    expect(plain).toBe('[the docs](https://example.com "My Title")')
    expect(html).toBe('')
  })

  test('cross-block incl a highlighted code fence → markdown, no hljs/span leak', async ({
    page,
  }) => {
    await gotoMouseops(page, 'wysiwyg')
    await setDoc(
      page,
      '# Title\n\nA paragraph with **bold**.\n\n```js\nconst x = 1\n```\n',
    )
    await selectAllContent(page)
    const { plain, html } = await syntheticClipboard(page, 'copy')
    expect(plain).toContain('# Title')
    expect(plain).toContain('**bold**')
    expect(plain).toContain('const x = 1')
    // The live-highlight spans (wysiwyg code highlighting) must NOT leak into markdown.
    expect(plain).not.toContain('hljs')
    expect(plain).not.toContain('<span')
    expect(plain).not.toContain('class=')
    expect(html).toBe('')
  })
})

test.describe('P0-3 Cut end-to-end (ir)', () => {
  test('cut copies the block to the clipboard AND removes it from the document after the deferred delete', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'Keep this line.\n\nDELETE this paragraph.\n')
    // Select the second paragraph (the one to cut).
    await page.evaluate(() => {
      const el = (window as any).__modeEl() as HTMLElement
      el.focus()
      const p = Array.from(el.querySelectorAll('p')).find((n) =>
        n.textContent?.includes('DELETE this paragraph'),
      ) as HTMLElement
      const r = document.createRange()
      r.selectNodeContents(p)
      const s = getSelection()!
      s.removeAllRanges()
      s.addRange(r)
    })

    const { plain } = await syntheticClipboard(page, 'cut')
    // The cut payload is the same source markdown the copy handler produces.
    expect(plain).toContain('DELETE this paragraph')

    // fixCut defers Vditor's execCommand('delete') by a tick (utils.ts) — so the block
    // survives the synchronous cut handler and disappears only on the next task. Poll
    // (no fixed sleep) until the deferred delete has removed exactly the cut block and
    // left the untouched one intact — the data-loss net.
    await expect
      .poll(() => getValue(page), { timeout: 5_000, intervals: [50, 100, 200] })
      .not.toContain('DELETE this paragraph')
    expect(await getValue(page)).toContain('Keep this line.')
    // NOTE: the cut→save WIRE (a real edit landing on disk after the delete) is proven
    // at L3 in P0-4 (copy-clipboard.spec.ts, real Ctrl+X→Ctrl+S). A synthetic
    // ClipboardEvent's deferred execCommand mutates the DOM but does not drive Vditor's
    // input pipeline here, and the input→debounce→post plumbing is already covered by
    // edit-sync.test.ts + save-flush.spec.ts — so this L2 spec scopes to payload+removal.
  })
})
