import { expect, test } from './coverage-fixture'

test.beforeEach(async ({ page }) => {
  await page.goto('/section-fold.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.waitForTimeout(200)
})

const view = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__foldView())
const value = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__getValue() as string)

test('gutter fold hides the heading subtree without changing Markdown', async ({
  page,
}) => {
  const before = await value(page)
  expect(await page.evaluate(() => (window as any).__gutterFold('One'))).toBe(
    true,
  )
  await expect
    .poll(() => view(page))
    .toMatchObject({
      foldedHeadings: [{ text: expect.stringContaining('One'), count: '3' }],
    })
  const folded = await view(page)
  expect(folded.hiddenTexts).toEqual(
    expect.arrayContaining([
      'one body',
      expect.stringContaining('Child'),
      'child body',
    ]),
  )
  expect(await value(page)).toBe(before)
})

test('navigation and a retained selection auto-unfold hidden section content', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).__toggleAt('One'))
  expect(
    await page.evaluate(() => (window as any).__ensureText('child body')),
  ).toBe(true)
  await expect.poll(() => view(page)).toMatchObject({ foldedHeadings: [] })

  await page.evaluate(() => (window as any).__toggleAt('One'))
  await page.evaluate(() => {
    const hidden = document.querySelector<HTMLElement>(
      '[data-vmde-fold-hidden]',
    )!
    const range = document.createRange()
    range.selectNodeContents(hidden)
    range.collapse(true)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await expect.poll(() => view(page)).toMatchObject({ foldedHeadings: [] })
})

test('fold state reapplies across WYSIWYG mode switch and a Vditor respin', async ({
  page,
}) => {
  const before = await value(page)
  await page.evaluate(() => (window as any).__toggleAt('One'))
  await page.evaluate(() => (window as any).__switchMode('wysiwyg'))
  await expect
    .poll(() => view(page))
    .toMatchObject({
      mode: 'wysiwyg',
      foldedHeadings: [expect.objectContaining({ count: '3' })],
    })
  await page.evaluate(() => (window as any).__respin())
  await expect
    .poll(() => view(page))
    .toMatchObject({
      foldedHeadings: [expect.objectContaining({ count: '3' })],
    })
  expect(await value(page)).toBe(before)
})

test('nested list folding persists across list DOM replacement', async ({
  page,
}) => {
  const before = await value(page)
  await page.evaluate(() => (window as any).__toggleAt('parent'))
  await expect.poll(() => view(page)).toMatchObject({ foldedLists: 1 })
  expect((await view(page)).hiddenTexts.join(' ')).toContain('nested a')
  await page.evaluate(() => (window as any).__respin())
  await expect.poll(() => view(page)).toMatchObject({ foldedLists: 1 })
  expect(await value(page)).toBe(before)
})
