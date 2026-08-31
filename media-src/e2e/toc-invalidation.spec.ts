import { expect, test } from './coverage-fixture'

type TocStats = {
  requests: number
  invalidations: number
  skippedImpacts: number
  refreshes: number
  failures: number
}

async function resetTocStats(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const stats = (window as any).__vmdeTocInvalidationStats as TocStats
    stats.requests = 0
    stats.invalidations = 0
    stats.skippedImpacts = 0
    stats.refreshes = 0
    stats.failures = 0
    ;(window as any).__tocOutlineRenderCalls = 0
    delete (window as any).__vmdeMutationImpactStats.helpers['toc-invalidation']
  })
}

async function tocStats(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    stats: (window as any).__vmdeTocInvalidationStats as TocStats,
    outlineCalls: (window as any).__tocOutlineRenderCalls as number,
    impact: (window as any).__vmdeMutationImpactStats.helpers[
      'toc-invalidation'
    ],
  }))
}

async function placeCaretAtEnd(
  locator: import('@playwright/test').Locator,
): Promise<void> {
  await locator.click()
  await locator.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let text: Text | null = null
    let next = walker.nextNode() as Text | null
    while (next) {
      text = next
      next = walker.nextNode() as Text | null
    }
    if (!text) throw new Error('caret target has no text')
    const range = document.createRange()
    range.setStart(text, text.data.length)
    range.collapse(true)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/mutation-local.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.waitForFunction(
    () => (window as any).__vmdeTocInvalidationStats !== undefined,
  )
})

test('ordinary IR and WYSIWYG edits skip ToC while heading and top-level changes refresh once', async ({
  page,
}) => {
  const baseline = await page.evaluate(
    () => (window as any).__mutationLocal.editor.getValue() as string,
  )

  for (const target of [
    page.locator('.vditor-ir p').filter({ hasText: 'TARGET mutation' }),
    page.locator('.vditor-ir li').filter({ hasText: 'peer' }),
    page.locator('.vditor-ir td').filter({ hasText: 'two' }),
    page.locator('.vditor-ir code').filter({ hasText: 'code target' }),
  ]) {
    await resetTocStats(page)
    await placeCaretAtEnd(target.first())
    await page.keyboard.type('X')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(300) // negative assertion: no ToC call may appear during settle
    const ordinary = await tocStats(page)
    expect(ordinary.stats.requests).toBeGreaterThan(0)
    expect(ordinary.stats.refreshes).toBe(0)
    expect(ordinary.outlineCalls).toBe(0)
  }

  await resetTocStats(page)
  await placeCaretAtEnd(page.locator('.vditor-ir h2').first())
  await page.keyboard.type('!')
  await expect.poll(async () => (await tocStats(page)).stats.refreshes).toBe(1)
  const heading = await tocStats(page)
  expect(heading.outlineCalls).toBe(1)
  await expect(page.locator('.vditor-outline')).toContainText('Nested content!')

  await page.evaluate((value) => {
    ;(window as any).__mutationLocal.editor.setValue(value)
  }, baseline)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__mutationLocal.editor.getValue() as string,
      ),
    )
    .toBe(baseline)

  await resetTocStats(page)
  await placeCaretAtEnd(
    page.locator('.vditor-ir p').filter({ hasText: 'TARGET mutation' }),
  )
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await tocStats(page)).stats.refreshes).toBe(1)
  expect((await tocStats(page)).outlineCalls).toBe(1)

  await page.evaluate((value) => {
    ;(window as any).__mutationLocal.editor.setValue(value)
  }, baseline)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__mutationLocal.editor.getValue() as string,
      ),
    )
    .toBe(baseline)
  await page.waitForTimeout(300) // isolate setValue's full-surface lifecycle from the mode transition
  await resetTocStats(page)
  await page.locator('.vditor-toolbar [data-type="edit-mode"]').click()
  await page.locator('button[data-mode="wysiwyg"]').click()
  await expect(page.locator('.vditor-wysiwyg')).toBeVisible()
  await page.waitForTimeout(300) // mode-switch lifecycle must finish before isolating the next edit
  const mode = await tocStats(page)
  expect(mode.stats.refreshes).toBe(1)
  expect(mode.outlineCalls).toBe(2) // renderToc plus Vditor Outline.toggle's stock visibility render
  const wysiwygBaseline = await page.evaluate(
    () => (window as any).__mutationLocal.editor.getValue() as string,
  )

  await resetTocStats(page)
  await placeCaretAtEnd(
    page.locator('.vditor-wysiwyg p').filter({ hasText: 'TARGET mutation' }),
  )
  await page.keyboard.type('X')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300) // negative assertion: WYSIWYG ordinary input stays ToC-free
  const wysiwyg = await tocStats(page)
  expect(wysiwyg.stats.requests).toBeGreaterThan(0)
  expect(wysiwyg.stats.refreshes).toBe(0)
  expect(wysiwyg.outlineCalls).toBe(0)
  expect(wysiwyg.impact.full).toBe(0)
  expect(
    await page.evaluate(
      () => (window as any).__mutationLocal.editor.getValue() as string,
    ),
  ).toBe(wysiwygBaseline)
})

test('heading edits schedule no ToC work when both consumers are disabled', async ({
  page,
}) => {
  const baseline = await page.evaluate(() => {
    const editor = (window as any).__mutationLocal.editor
    editor.vditor.options.outline.enable = false
    editor.vditor.outline.toggle(editor.vditor, false, false)
    return editor.getValue() as string
  })
  await resetTocStats(page)
  await placeCaretAtEnd(page.locator('.vditor-ir h2').first())
  await page.keyboard.type('!')
  await page.waitForTimeout(300) // negative assertion: no consumer means no settle callback

  const result = await tocStats(page)
  expect(result.stats.requests).toBeGreaterThan(0)
  expect(result.stats.refreshes).toBe(0)
  expect(result.outlineCalls).toBe(0)
  expect(
    await page.evaluate(
      () => (window as any).__mutationLocal.editor.getValue() as string,
    ),
  ).toBe(baseline.replace('## Nested content', '## Nested content!'))
})
