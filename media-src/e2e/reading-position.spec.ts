import { expect, test } from './coverage-fixture'

test('reboots onto the anchored block and caret after content is inserted above', async ({
  page,
}) => {
  await page.goto('/reading-position.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  expect(
    await page.evaluate(() => (window as any).__captureAt('Paragraph 46:')),
  ).toBe(true)
  const before = await page.evaluate(() => (window as any).__positionView())
  expect(before.savedHash).not.toBe('')
  expect(before.visibleText).toContain('Paragraph 45:')
  expect(before.scrollTop).toBeGreaterThan(0)

  await page.evaluate(() => (window as any).__rebootAfterInsert())
  await expect
    .poll(() => page.evaluate(() => (window as any).__positionView()))
    .toMatchObject({
      visibleText: before.visibleText,
      caretText: expect.stringContaining('Paragraph 46:'),
    })
})
