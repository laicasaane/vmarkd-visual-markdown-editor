import { expect, test } from './coverage-fixture'

const helperStats = () =>
  (window as any).__vmdeMutationImpactStats as {
    rawCallbacks: number
    rawRecords: number
    helpers: Record<
      string,
      {
        callbacks: number
        records: number
        full: number
        local: number
        skipped: number
        blocks: number
      }
    >
  }

async function resetStats(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const stats = (window as any).__vmdeMutationImpactStats
    stats.rawCallbacks = 0
    stats.rawRecords = 0
    stats.helpers = {}
  })
}

async function flushHelperFrames(page: import('@playwright/test').Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/mutation-local.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.waitForSelector('.language-mermaid svg', { timeout: 30_000 })
  await page.waitForSelector('.language-d2 svg', { timeout: 30_000 })
  await flushHelperFrames(page)
})

test('ordinary edits stay local while heading and mode changes widen', async ({
  page,
}) => {
  const baseline = await page.evaluate(
    () => (window as any).__mutationLocal.editor.getValue() as string,
  )
  await resetStats(page)
  await page.locator('.vditor-ir').click({ position: { x: 8, y: 8 } })
  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('.vditor-ir p')).find(
      (paragraph) => paragraph.textContent?.includes('TARGET mutation local'),
    )!
    const text = target.lastChild!
    const range = document.createRange()
    range.setStart(text, text.textContent!.length)
    range.collapse(true)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    ;(target as HTMLElement).focus()
  })
  await page.keyboard.type('ABCDEFGH')
  for (let index = 0; index < 8; index++) await page.keyboard.press('Backspace')
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__mutationLocal.editor.getValue() as string,
      ),
    )
    .toBe(baseline)
  await flushHelperFrames(page)

  const ordinary = await page.evaluate(helperStats)
  expect(ordinary.rawCallbacks).toBeGreaterThan(0)
  expect(ordinary.rawRecords).toBeGreaterThan(0)
  expect(ordinary.rawRecords).toBeLessThan(1_044)
  const helperNames = [
    'section-fold-surface',
    'section-fold-app',
    'responsive-tables',
    'diagram-zoom',
    'diagram-controls',
    'custom-diagrams',
    'render-cache',
  ]
  for (const name of helperNames) {
    const stats = ordinary.helpers[name]
    expect(stats, `${name} stats`).toBeDefined()
    expect(stats.callbacks, `${name} callbacks`).toBeGreaterThan(0)
    expect(stats.records, `${name} records`).toBeGreaterThan(0)
    expect(stats.full, `${name} full passes`).toBe(0)
  }
  for (const name of [
    'diagram-zoom',
    'diagram-controls',
    'custom-diagrams',
    'render-cache',
  ])
    expect(
      ordinary.helpers[name].local,
      `${name} local passes`,
    ).toBeGreaterThan(0)

  for (const target of [
    page.locator('.vditor-ir li').filter({ hasText: 'peer' }).last(),
    page.locator('.vditor-ir td').filter({ hasText: 'two' }).first(),
  ]) {
    await resetStats(page)
    await target.click()
    await target.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let text: Text | null = null
      let next = walker.nextNode() as Text | null
      while (next) {
        text = next
        next = walker.nextNode() as Text | null
      }
      if (!text) throw new Error('local edit target has no text')
      const range = document.createRange()
      range.setStart(text, text.data.length)
      range.collapse(true)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await page.keyboard.type('X')
    await page.keyboard.press('Backspace')
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__mutationLocal.editor.getValue() as string,
        ),
      )
      .toBe(baseline)
    await flushHelperFrames(page)
    const local = await page.evaluate(helperStats)
    expect(local.rawRecords).toBeGreaterThan(0)
    for (const name of helperNames) {
      expect(local.helpers[name], `${name} stats`).toBeDefined()
      expect(local.helpers[name].full, `${name} full passes`).toBe(0)
    }
  }

  await resetStats(page)
  const target = page
    .locator('.vditor-ir li')
    .filter({ hasText: 'peer' })
    .last()
  const itemCount = await page.locator('.vditor-ir li').count()
  await target.evaluate((element) => {
    const inserted = element.cloneNode(false) as HTMLElement
    inserted.dataset.vmdeTestSplit = '1'
    inserted.textContent = 'structural split item'
    element.insertAdjacentElement('afterend', inserted)
  })
  await expect(page.locator('.vditor-ir li')).toHaveCount(itemCount + 1)
  await flushHelperFrames(page)
  const split = await page.evaluate(helperStats)
  expect(split.rawRecords).toBeGreaterThan(0)
  expect(split.helpers['section-fold-surface']).toBeDefined()
  expect(split.helpers['section-fold-surface'].local).toBeGreaterThan(0)
  expect(split.helpers['responsive-tables']).toBeDefined()
  expect(split.helpers['responsive-tables'].full).toBe(0)
  expect(split.helpers['responsive-tables'].skipped).toBeGreaterThan(0)
  for (const name of [
    'diagram-zoom',
    'diagram-controls',
    'custom-diagrams',
    'render-cache',
  ]) {
    expect(split.helpers[name], `${name} split stats`).toBeDefined()
    expect(split.helpers[name].full, `${name} split full passes`).toBe(0)
    expect(
      split.helpers[name].local,
      `${name} split local passes`,
    ).toBeGreaterThan(0)
  }
  await resetStats(page)
  await target.evaluate((element) => element.remove())
  await expect(page.locator('.vditor-ir li')).toHaveCount(itemCount)
  await flushHelperFrames(page)
  const merge = await page.evaluate(helperStats)
  expect(merge.rawRecords).toBeGreaterThan(0)
  expect(merge.helpers['section-fold-surface']).toBeDefined()
  expect(merge.helpers['section-fold-surface'].full).toBe(0)
  expect(merge.helpers['section-fold-surface'].local).toBeGreaterThan(0)
  expect(merge.helpers['responsive-tables']).toBeDefined()
  expect(merge.helpers['responsive-tables'].full).toBe(0)
  for (const name of [
    'diagram-zoom',
    'diagram-controls',
    'custom-diagrams',
    'render-cache',
  ]) {
    const helper = merge.helpers[name]
    expect(helper, `${name} merge stats`).toBeDefined()
    expect(helper.callbacks, `${name} merge callbacks`).toBeGreaterThan(0)
    expect(helper.records, `${name} merge records`).toBeGreaterThan(0)
    expect(
      helper.full + helper.local,
      `${name} merge routed passes`,
    ).toBeGreaterThan(0)
  }
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

  await resetStats(page)
  await page.locator('.vditor-ir h2').click()
  await page.keyboard.type('!')
  await flushHelperFrames(page)
  const heading = await page.evaluate(helperStats)
  expect(heading.helpers['section-fold-surface']?.full ?? 0).toBeGreaterThan(0)
  expect(heading.helpers['section-fold-app']?.full ?? 0).toBe(0)

  await resetStats(page)
  await page.locator('.vditor-toolbar [data-type="edit-mode"]').click()
  await page.locator('button[data-mode="wysiwyg"]').click()
  await expect(page.locator('.vditor-wysiwyg')).toBeVisible()
  await flushHelperFrames(page)
  const mode = await page.evaluate(helperStats)
  expect(mode.helpers['section-fold-app']).toBeDefined()
  expect(mode.helpers['section-fold-app'].full).toBeGreaterThan(0)
  expect(mode.helpers['responsive-tables']).toBeDefined()
  expect(mode.helpers['responsive-tables'].full).toBeGreaterThan(0)
  for (const name of [
    'diagram-zoom',
    'diagram-controls',
    'custom-diagrams',
    'render-cache',
  ]) {
    expect(mode.helpers[name], `${name} mode stats`).toBeDefined()
    expect(mode.helpers[name].full, `${name} mode full passes`).toBeGreaterThan(
      0,
    )
  }
  await resetStats(page)
  await page.evaluate((value) => {
    ;(window as any).__mutationLocal.editor.setValue(
      `${value}\n\nExternal replacement paragraph.`,
    )
  }, baseline)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__mutationLocal.editor.getValue() as string,
      ),
    )
    .toContain('External replacement paragraph.')
  await flushHelperFrames(page)
  const external = await page.evaluate(helperStats)
  expect(external.rawRecords).toBeGreaterThan(0)
  expect(external.helpers['section-fold-surface']).toBeDefined()
  expect(external.helpers['section-fold-surface'].full).toBeGreaterThan(0)
  expect(external.helpers['responsive-tables']).toBeDefined()
  expect(external.helpers['responsive-tables'].full).toBeGreaterThan(0)
  for (const name of [
    'diagram-zoom',
    'diagram-controls',
    'custom-diagrams',
    'render-cache',
  ]) {
    expect(external.helpers[name], `${name} external stats`).toBeDefined()
    expect(
      external.helpers[name].full,
      `${name} external full passes`,
    ).toBeGreaterThan(0)
  }
})
