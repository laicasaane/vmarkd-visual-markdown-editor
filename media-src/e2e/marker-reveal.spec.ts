import type { Page } from '@playwright/test'
import { expect, test } from './coverage-fixture'

test.beforeEach(async ({ page }) => {
  await page.goto('/marker-reveal.html')
  await page.waitForFunction(
    () => (window as unknown as { __ready?: boolean }).__ready,
  )
})

const focusInline = (page: Page, needle: string) =>
  page.evaluate(
    ([text, offset]) =>
      (
        window as unknown as {
          __focusInline(needle: string, offset: number): boolean
        }
      ).__focusInline(text, offset),
    [needle, Math.floor(needle.length / 2)] as [string, number],
  )

const state = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __markerState(): {
          parentClass: string
          parentText: string
          expanded: string[]
          classMutations: number
        } | null
      }
    ).__markerState(),
  )

const markdown = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { vditor: { getValue(): string } }).vditor.getValue(),
  )

for (const sample of [
  { type: 'strong', needle: 'home-bold', expected: 'X**home-bold** tail' },
  {
    type: 'a',
    needle: 'home-link',
    expected: 'X[home-link](https://example.com) tail',
  },
  { type: 'code', needle: 'home-code', expected: 'X`home-code` tail' },
]) {
  test(`Home reveals a leading ${sample.type} marker before typing`, async ({
    page,
  }) => {
    expect(await focusInline(page, sample.needle)).toBe(true)
    await page.keyboard.press('Home')
    await page.waitForTimeout(150)
    const afterHome = await state(page)
    expect(afterHome?.parentClass).not.toContain('vditor-ir__marker')
    expect(afterHome?.expanded).toContain(sample.type)

    await page.keyboard.type('X')
    await expect.poll(() => markdown(page)).toContain(sample.expected)
  })
}

for (const sample of [
  { type: 'strong', needle: 'end-bold', expected: 'tail **end-bold**X' },
  {
    type: 'a',
    needle: 'end-link',
    expected: 'tail [end-link](https://example.com)X',
  },
  { type: 'code', needle: 'end-code', expected: 'tail `end-code`X' },
]) {
  test(`End reveals a trailing ${sample.type} marker before typing`, async ({
    page,
  }) => {
    expect(await focusInline(page, sample.needle)).toBe(true)
    await page.keyboard.press('End')
    await page.waitForTimeout(150)
    const afterEnd = await state(page)
    expect(afterEnd?.parentClass).not.toContain('vditor-ir__marker')
    expect(afterEnd?.expanded).toContain(sample.type)

    await page.keyboard.type('X')
    await expect.poll(() => markdown(page)).toContain(sample.expected)
  })
}

test('PageUp reveals the formatted node reached by viewport navigation', async ({
  page,
}) => {
  expect(await focusInline(page, 'end-code')).toBe(true)
  await page.keyboard.press('PageUp')
  await page.waitForTimeout(150)
  const afterPageUp = await state(page)
  expect(afterPageUp?.parentClass).not.toContain('vditor-ir__marker')
  expect(afterPageUp?.expanded).toContain('strong')
  await page.keyboard.type('X')
  await expect
    .poll(
      async () =>
        (await markdown(page)).match(/\*\*page-bold-\d+\*\*/g)?.length,
    )
    .toBe(18)
})

test('selection-driven reveal defers previous collapse for a 100 ms dwell', async ({
  page,
}) => {
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __placeInsideMarker(type: string): boolean }
      ).__placeInsideMarker('strong'),
    ),
  ).toBe(true)
  await page.waitForTimeout(25)
  expect((await state(page))?.expanded).toEqual(['strong'])
  await page.evaluate(() =>
    (
      window as unknown as { __resetMarkerMutations(): void }
    ).__resetMarkerMutations(),
  )

  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __placeInsideMarker(type: string): boolean }
      ).__placeInsideMarker('a'),
    ),
  ).toBe(true)
  await page.waitForTimeout(25)
  expect((await state(page))?.expanded.sort()).toEqual(['a', 'strong'])
  await page.waitForTimeout(110)
  const settled = await state(page)
  expect(settled?.expanded).toEqual(['a'])
  // One stock reveal (old collapse + new expand + hidden removal), one same-frame restoration,
  // and one dwell collapse. A surviving Arrow-key keyup expansion would add another cycle.
  expect(settled?.classMutations).toBe(5)
})

test('a pointer click may edit a marker that is already visibly expanded', async ({
  page,
}) => {
  expect(await focusInline(page, 'home-bold')).toBe(true)
  await expect
    .poll(async () => (await state(page))?.expanded)
    .toContain('strong')
  await page
    .locator('.vditor-ir__node[data-type="strong"] > .vditor-ir__marker')
    .first()
    .click()
  await page.waitForTimeout(50)
  expect((await state(page))?.parentClass).toContain('vditor-ir__marker')
})

test('composition holds selection-driven marker writes until compositionend', async ({
  page,
}) => {
  await page.evaluate(() =>
    (
      window as unknown as { __composition(active: boolean): void }
    ).__composition(true),
  )
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __placeInsideMarker(type: string): boolean }
      ).__placeInsideMarker('code'),
    ),
  ).toBe(true)
  await page.waitForTimeout(50)
  expect((await state(page))?.expanded).toEqual([])

  await page.evaluate(() =>
    (
      window as unknown as { __composition(active: boolean): void }
    ).__composition(false),
  )
  await page.waitForTimeout(50)
  expect((await state(page))?.expanded).toEqual(['code'])
})
