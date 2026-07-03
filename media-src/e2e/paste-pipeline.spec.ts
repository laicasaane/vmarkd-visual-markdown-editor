import { expect, test } from './coverage-fixture'
import {
  caretToEnd,
  getValue,
  gotoMouseops,
  type Mode,
  placeCaret,
  selectWord,
  setDoc,
  syntheticPaste,
} from './mouseops-helpers'

// NET (task 191 P0-5,7,8,9,16) — the PASTE pipeline (fixBrowserBehavior.ts paste()).
// Paste is a corruption path: plain markdown must render into real blocks, HTML must
// convert to markdown with NO style/onclick/tag leak, a URL over a selection must
// autolink, and a paste inside a fence must stay LITERAL. Drives Vditor's real paste
// handler via a synthetic ClipboardEvent whose DataTransfer we populate; paste() is
// async, so we poll getValue() rather than read it synchronously.

const MODES: Mode[] = ['ir', 'wysiwyg', 'sv']

// Poll until the async paste() has landed a marker in the serialized document.
async function pasteThenExpect(
  page: import('@playwright/test').Page,
  needle: string,
) {
  await expect
    .poll(() => getValue(page), {
      timeout: 5_000,
      intervals: [50, 100, 200, 400],
    })
    .toContain(needle)
}

test.describe('P0-5 plain-markdown paste renders into real blocks', () => {
  for (const mode of MODES) {
    test(`multi-block markdown pastes in order (${mode})`, async ({ page }) => {
      await gotoMouseops(page, mode)
      await setDoc(page, 'Intro paragraph.\n\nTail paragraph.\n')
      // Caret at the end of the document (append point) — works for all three modes.
      await caretToEnd(page)
      await syntheticPaste(page, {
        plain: '# Pasted H\n\npara **bee**\n\n- item one',
      })
      await pasteThenExpect(page, 'Pasted H')

      const value = await getValue(page)
      // All three blocks arrived, in their pasted order…
      expect(value).toContain('# Pasted H')
      expect(value).toContain('**bee**')
      expect(value).toContain('- item one')
      expect(value.indexOf('Pasted H')).toBeLessThan(value.indexOf('bee'))
      expect(value.indexOf('bee')).toBeLessThan(value.indexOf('item one'))
      // …and the untouched blocks survive.
      expect(value).toContain('Intro paragraph.')
      expect(value).toContain('Tail paragraph.')
    })
  }

  test('ir renders the pasted heading (not literal `#` text)', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'Anchor paragraph.\n')
    await placeCaret(page, 'p')
    await syntheticPaste(page, { plain: '# Rendered Heading\n\nbody' })
    await pasteThenExpect(page, 'Rendered Heading')
    // The heading became a real H1 node in the IR surface.
    const hasH1 = await page.evaluate(() => {
      const el = (window as any).__modeEl() as HTMLElement
      return Array.from(el.querySelectorAll('h1')).some((h) =>
        h.textContent?.includes('Rendered Heading'),
      )
    })
    expect(hasH1).toBe(true)
  })
})

test.describe('P0-7 HTML → markdown paste (no style/onclick/tag leak)', () => {
  const WORD_HTML =
    '<meta charset="utf-8"><h1 style="color:red" onclick="alert(1)">Word Title</h1>' +
    '<p><b>bold word</b> and normal.</p>' +
    '<table><tbody><tr><td>c1</td><td>c2</td></tr></tbody></table>'

  for (const mode of MODES) {
    test(`Word-ish HTML converts to markdown, strips style/onclick/raw tags (${mode})`, async ({
      page,
    }) => {
      await gotoMouseops(page, mode)
      await setDoc(page, 'Before.\n')
      await caretToEnd(page)
      await syntheticPaste(page, { plain: 'Word Title', html: WORD_HTML })
      await pasteThenExpect(page, 'Word Title')

      const value = await getValue(page)
      // Heading + bold survived as markdown (heading may render as `# ` or ATX text;
      // assert the bold marker + the words, and the table pipes).
      expect(value).toContain('Word Title')
      expect(value).toContain('**bold word**')
      expect(value).toMatch(/\|\s*c1\s*\|/)
      // Nothing raw leaked through Lute.Sanitize + the style/copy strips.
      expect(value).not.toContain('onclick')
      expect(value).not.toContain('style=')
      expect(value).not.toContain('<h1')
      expect(value).not.toContain('<table')
      expect(value).not.toContain('<b>')
    })
  }

  test('address-bar copy (<a href=X>X</a> + matching text/plain) → bare autolink, not [url](url)', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'Link here.\n')
    await placeCaret(page, 'p')
    const url = 'https://example.com/page'
    await syntheticPaste(page, {
      plain: url,
      html: `<a href="${url}">${url}</a>`,
    })
    await pasteThenExpect(page, url)
    const value = await getValue(page)
    // The address-bar special-case clears textHTML → the URL renders as an autolink,
    // NOT a labelled link.
    expect(value).toContain(url)
    expect(value).not.toContain(`](${url})`)
  })
})

test.describe('P0-8 paste over a selection / URL autolink', () => {
  test('a URL pasted over a selected word becomes [word](url)', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'Replace target now.\n')
    await selectWord(page, 'target')
    await syntheticPaste(page, { plain: 'https://example.com' })
    await pasteThenExpect(page, '[target](https://example.com)')
    expect(await getValue(page)).toContain('[target](https://example.com)')
  })

  test('plain text pasted over a selection replaces it exactly once', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'alpha REPLACEME omega.\n')
    await selectWord(page, 'REPLACEME')
    await syntheticPaste(page, { plain: 'INSERTED' })
    await pasteThenExpect(page, 'INSERTED')
    const value = await getValue(page)
    expect(value).toContain('INSERTED')
    expect(value).not.toContain('REPLACEME')
    // Exactly once — the surrounding words are intact and not duplicated.
    expect(value.match(/INSERTED/g)?.length).toBe(1)
    expect(value).toContain('alpha')
    expect(value).toContain('omega')
  })

  test('a URL pasted WITH html markup does NOT autolink the selection', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'Wrap target word.\n')
    await selectWord(page, 'target')
    const url = 'https://example.com'
    // text/html present → the HTML branch wins; the autolink-over-selection path
    // (textPlain branch only) is not taken.
    await syntheticPaste(page, { plain: url, html: `<span>${url}</span>` })
    await pasteThenExpect(page, url)
    expect(await getValue(page)).not.toContain(`[target](${url})`)
  })
})

test.describe('P0-9 paste inside a fence stays literal', () => {
  // ir/wysiwyg: the paste must be dispatched on the <code> element so paste()'s
  // `hasClosestByMatchTag(event.target, "CODE")` takes the literal branch (otherwise the
  // `#` would render as a heading). This is the non-trivial render-vs-literal decision.
  for (const mode of ['ir', 'wysiwyg'] as Mode[]) {
    test(`markdown pasted into a code block is inserted verbatim (${mode})`, async ({
      page,
    }) => {
      await gotoMouseops(page, mode)
      await setDoc(page, '```js\nconst kept = 1\n```\n')
      await placeCaret(page, 'code')
      await syntheticPaste(page, { plain: '# not a heading', target: 'code' })
      await pasteThenExpect(page, '# not a heading')

      const value = await getValue(page)
      // The pasted markdown stayed LITERAL inside the fence — the original code and the
      // fence markers both survive, and the `#` did not become a real heading.
      expect(value).toContain('# not a heading')
      expect(value).toContain('const kept = 1')
      expect((value.match(/```/g) ?? []).length).toBeGreaterThanOrEqual(2)
    })
  }

  // sv is a pure source view: it renders a fence as marker spans (code-block-open-marker
  // / text / code-block-close-marker), NOT a `data-type="code-block"` element — so paste()'s
  // sv codeElement branch (`hasClosestByAttribute(..., "code-block")`, EXACT match) is
  // unreachable and the paste flows through processPaste. FINDING: the plan's premise
  // that sv P0-9 hits the escaping branch (fixBrowserBehavior.ts:1383-1384) is off; sv
  // stays literal because the whole surface is literal, not because of that branch.
  test('markdown pasted into a sv code region stays literal source (via processPaste)', async ({
    page,
  }) => {
    await gotoMouseops(page, 'sv')
    await setDoc(page, '```js\nconst kept = 1\n```\n')
    await placeCaret(page, '[data-type="text"]') // the code-content span
    await syntheticPaste(page, {
      plain: '# not a heading',
      target: '[data-type="text"]',
    })
    await pasteThenExpect(page, '# not a heading')

    const value = await getValue(page)
    expect(value).toContain('# not a heading')
    expect(value).toContain('const kept = 1')
    expect((value.match(/```/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

// P0-16 (one paste = one undo step) is proven at L3 in P0-6 (paste-real.spec.ts): a
// synthetic ClipboardEvent's insertHTML mutates the DOM but does NOT populate Vditor's
// undo stack (the same input-pipeline gap that scopes the cut edit-post to L3), so a
// faithful "single Ctrl+Z restores the pre-paste doc" test needs a REAL Ctrl+V there.
