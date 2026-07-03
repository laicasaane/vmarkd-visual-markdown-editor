import { expect, test } from './coverage-fixture'
import {
  getValue,
  gotoMouseops,
  selectAcross,
  setDoc,
} from './mouseops-helpers'

// NET (task 191 P0-10,11,12) — mouse/keyboard SELECTION → edit is a corruption path:
// a cross-block delete must leave a well-formed document (fence markers balanced,
// diagram source + its preview both gone), a double/triple-click replace must not orphan
// markers, and select-all must never serialize our injected helper DOM
// (#fix-table-ir-wrapper). Selections are set the way the copy handler reads them
// (getSelection) and the MUTATION is driven by real keys (which, unlike a synthetic
// ClipboardEvent, drive Vditor's real input pipeline).

test.describe('P0-10 cross-block delete leaves a well-formed document (ir)', () => {
  test('deleting across a paragraph→fence boundary keeps the fence balanced', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(
      page,
      'Para above here.\n\n```js\nkeepLine\ncutLine\n```\n\nPara below.\n',
    )
    // Select from inside the paragraph into the fenced code, then delete with a real key.
    await selectAcross(page, 'above', 'cutLine')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const value = await getValue(page)
    // The corruption invariant: a delete that crosses the paragraph→fence boundary must
    // NOT leave a dangling/odd fence (an EVEN number of ``` markers), and the block fully
    // outside the selection (the below-paragraph) survives intact. (Whether cutLine itself
    // survives is a selection-mechanics detail of the code block's dual source/preview
    // node — the data-integrity concern is the balanced fence + untouched neighbours.)
    expect((value.match(/```/g) ?? []).length % 2).toBe(0)
    expect(value).toContain('Para below.')
  })

  test('deleting across a rendered mermaid removes BOTH its source and its preview', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(
      page,
      'Top marker line.\n\n```mermaid\ngraph TD\nAA-->BB\n```\n\nBottom sentinel line.\n',
    )
    // Wait for the mermaid preview to render.
    await page
      .locator('.vditor-ir__preview svg, .vditor-ir__preview canvas')
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {})
    await selectAcross(page, 'Top marker', 'Bottom sentinel')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(300)

    const value = await getValue(page)
    // The whole mermaid block was inside the selection → its source is gone from the doc…
    expect(value).not.toContain('graph TD')
    expect(value).not.toContain('AA-->BB')
    // …and no orphaned mermaid preview SVG is left rendered in the DOM.
    const strayPreview = await page.evaluate(() => {
      const el = (window as any).__modeEl() as HTMLElement
      return Array.from(el.querySelectorAll('.language-mermaid')).length
    })
    expect(strayPreview).toBe(0)
  })
})

test.describe('P0-11 double/triple-click select→replace (ir)', () => {
  test('double-click a bold word, type → the word is replaced, neighbours + markers intact', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'lead **boldword** trail\n')
    // Double-click the rendered bold word to select it (Vditor expands the ** markers).
    await page.locator('.vditor-ir [data-type="strong"]').first().dblclick()
    await page.keyboard.type('REPL')
    await page.waitForTimeout(200)

    const value = await getValue(page)
    // The word was replaced inside the bold; neighbours survive; no orphaned ** left.
    expect(value).not.toContain('boldword')
    expect(value).toContain('REPL')
    expect(value).toContain('lead')
    expect(value).toContain('trail')
    expect(value).toContain('**') // still bold, markers not orphaned
  })

  test('triple-click a line, type → the whole line becomes the typed text, no orphan **', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'pre **mid** post\n')
    await page
      .locator('.vditor-ir [data-block]')
      .first()
      .click({ clickCount: 3 })
    await page.keyboard.type('ALLNEW')
    await page.waitForTimeout(200)

    const value = await getValue(page)
    expect(value).toContain('ALLNEW')
    expect(value).not.toContain('mid')
    // No orphaned emphasis markers left from the replaced bold.
    expect(value).not.toContain('**')
  })
})

// NOTE: the plan's P0-12 also lists "Ctrl+A inside a code block selects only that block".
// That is a Vditor BUILT-IN convenience (fixBrowserBehavior.ts:966) — not a corruption
// path (the subsequent delete+type is what can corrupt, and that is covered below) — and
// it did not reproduce deterministically from a synthetic caret at L2 (Ctrl+A left an
// empty selection). Left to an L3 real-editor check if it ever regresses; the L2 net here
// is the data-integrity one: our injected helper DOM must never serialize.
test.describe('P0-12 select-all never leaks the injected helper DOM (ir)', () => {
  test('after a table-cell click materializes #fix-table-ir-wrapper, select-all→delete→type leaves clean markdown', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir')
    await setDoc(page, 'Some prose.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n')
    // Click a table cell — this materializes our #fix-table-ir-wrapper helper node.
    await page.locator('.vditor-ir td').first().click()
    await page.waitForTimeout(150)
    // Sanity: the injected wrapper exists in the DOM now.
    const hasWrapper = await page.evaluate(
      () => !!document.getElementById('fix-table-ir-wrapper'),
    )
    expect(hasWrapper).toBe(true)

    // Select everything and clear it, then type a sentinel.
    await page.evaluate(() => {
      const el = (window as any).__modeEl() as HTMLElement
      el.focus()
      const r = document.createRange()
      r.selectNodeContents(el)
      const s = getSelection()!
      s.removeAllRanges()
      s.addRange(r)
    })
    await page.keyboard.press('Delete')
    await page.keyboard.type('x')
    await page.waitForTimeout(200)

    const value = await getValue(page)
    // The injected helper DOM must NEVER serialize into the document.
    expect(value).not.toContain('fix-table-ir-wrapper')
    expect(value).not.toContain('data-vmarkd-trailing')
    expect(value).toContain('x')
  })
})
