import { expect, test } from './coverage-fixture'
import { getValue, gotoMouseops, selectWord, setDoc } from './mouseops-helpers'

// NET (task 191 P1-2) — clicking a formatting toolbar button applies to the current
// selection (the primary mouse-editing UI). Drives the REAL Vditor toolbar commands in the
// mouseops harness (mounted with ?toolbar=1) on a selected word / line and asserts the
// serialized markdown. getValue reflects the DOM the toolbar command produced.

async function clickTool(
  page: import('@playwright/test').Page,
  dataType: string,
) {
  await page
    .locator(`.vditor-toolbar [data-type="${dataType}"]`)
    .first()
    .click()
}

test.describe('P1-2 toolbar formatting on a selection (ir)', () => {
  test('bold wraps the selected word', async ({ page }) => {
    await gotoMouseops(page, 'ir', { toolbar: true })
    await setDoc(page, 'make word bold here\n')
    await selectWord(page, 'word')
    await clickTool(page, 'bold')
    await expect
      .poll(() => getValue(page), { timeout: 5_000, intervals: [50, 100, 200] })
      .toContain('**word**')
    // NOTE: the un-wrap toggle (a second bold click) is a Vditor toggle nuance that depends
    // on the exact post-wrap selection state and did not drive deterministically from a
    // re-selected range in the harness — left out; the wrap is the net this spec protects.
  })

  test('italic wraps the selected word', async ({ page }) => {
    await gotoMouseops(page, 'ir', { toolbar: true })
    await setDoc(page, 'make word italic here\n')
    await selectWord(page, 'word')
    await clickTool(page, 'italic')
    await expect
      .poll(() => getValue(page), { timeout: 5_000, intervals: [50, 100, 200] })
      .toMatch(/(\*|_)word(\*|_)/)
  })

  test('the list button turns the line into a bullet item', async ({
    page,
  }) => {
    await gotoMouseops(page, 'ir', { toolbar: true })
    await setDoc(page, 'plain line to bullet\n')
    await selectWord(page, 'plain')
    await clickTool(page, 'list')
    // Lute serializes a bullet with `*` (or `-`); either is a valid list marker.
    await expect
      .poll(() => getValue(page), { timeout: 5_000, intervals: [50, 100, 200] })
      .toMatch(/[*-]\s+plain line to bullet/)
  })
})

test.describe('P1-2 toolbar formatting on a selection (sv)', () => {
  test('bold wraps the selected word in the sv source', async ({ page }) => {
    await gotoMouseops(page, 'sv', { toolbar: true })
    await setDoc(page, 'make word bold here\n')
    await selectWord(page, 'word')
    await clickTool(page, 'bold')
    await expect
      .poll(() => getValue(page), { timeout: 5_000, intervals: [50, 100, 200] })
      .toContain('**word**')
  })
})
