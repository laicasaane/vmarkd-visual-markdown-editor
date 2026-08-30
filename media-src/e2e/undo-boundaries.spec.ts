import { expect, test } from './coverage-fixture'

test.beforeEach(async ({ page }) => {
  await page.goto('/undo-boundaries.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.waitForTimeout(900)
  await page.evaluate(() => (window as any).__focusEnd())
})

const value = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__value() as string)
const undo = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__undo())

test('ordinary quick typing remains one undo group', async ({ page }) => {
  await page.keyboard.type('alpha')
  await page.waitForTimeout(100)
  await page.keyboard.type(' beta')
  await page.waitForTimeout(900)
  expect(await value(page)).toContain('alpha beta')
  await undo(page)
  expect((await value(page)).trim()).toBe('')
})

test('Enter is isolated from typing on both sides', async ({ page }) => {
  await page.keyboard.type('before')
  await page.keyboard.press('Enter')
  await page.keyboard.type('after')
  await page.waitForTimeout(900)
  expect(await value(page)).toContain('before\n\nafter')

  await undo(page)
  expect(await value(page)).not.toContain('after')
  await undo(page)
  expect((await value(page)).trim()).toBe('before')
  await undo(page)
  expect((await value(page)).trim()).toBe('')
})

test('paste is isolated from typing on both sides', async ({ page }) => {
  await page.keyboard.type('before')
  await page.waitForTimeout(100)
  await page.evaluate(() => (window as any).__paste(' PASTED '))
  await page.keyboard.type('after')
  await page.waitForTimeout(900)

  await undo(page)
  expect(await value(page)).toContain('before')
  expect(await value(page)).toContain('PASTED')
  expect(await value(page)).not.toContain('after')
  await undo(page)
  expect(await value(page)).toContain('before')
  expect(await value(page)).not.toContain('PASTED')
  await undo(page)
  expect((await value(page)).trim()).toBe('')
})

test('one undo after heading promotion returns to the literal marker', async ({
  page,
}) => {
  await page.keyboard.type('# ')
  await page.waitForTimeout(100)
  expect(await page.locator('.vditor-ir h1').count()).toBe(1)
  await undo(page)
  expect((await value(page)).trim()).toBe('#')
  expect(await page.locator('.vditor-ir h1').count()).toBe(0)
  expect(
    await page.locator('.vditor-ir [data-block]').first().textContent(),
  ).toBe('# ')
})

test('a toolbar format command is isolated from surrounding typing', async ({
  page,
}) => {
  await page.keyboard.type('word')
  expect(await page.evaluate(() => (window as any).__selectText('word'))).toBe(
    true,
  )
  await page.locator('.vditor-toolbar button[data-type="bold"]').click()
  await page.evaluate(() => (window as any).__focusEnd())
  await page.keyboard.type('tail')
  await page.waitForTimeout(900)

  await undo(page)
  expect((await value(page)).trim()).toBe('**word**')
  await undo(page)
  expect((await value(page)).trim()).toBe('word')
  await undo(page)
  expect((await value(page)).trim()).toBe('')
})
