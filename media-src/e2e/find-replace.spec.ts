import { expect, test } from './coverage-fixture'

test.beforeEach(async ({ page }) => {
  await page.goto('/structural-selection.html')
  await page.waitForFunction(
    () => (window as unknown as { __ready?: boolean }).__ready,
  )
  await page.waitForTimeout(250)
})

const value = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__getValue() as string)

test('source-accurate widget replaces an inline match without corrupting markers', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).__openFindReplace())
  const widget = page.locator('.vmde-find-replace')
  await expect(widget).toBeVisible()
  await widget.locator('[data-find]').fill('bold scope')
  await expect(widget.locator('[data-status]')).toHaveText('1/1')
  expect(await page.locator('.vmde-find-overlay').count()).toBe(1)
  await widget.locator('[data-replace]').fill('new scope')
  await widget.locator('[data-action="replace"]').click()
  await expect.poll(() => value(page)).toContain('alpha **new scope** omega')
  expect(await value(page)).not.toContain('VMDE_FIND_CARET')
  expect(await page.locator('.vditor-ir [data-action]').count()).toBe(0)
})

test('Replace All covers prose, fenced source, and table in one undo step', async ({
  page,
}) => {
  const markdown = [
    'alpha prose',
    '',
    '```txt',
    'alpha fence',
    '```',
    '',
    '| A | B |',
    '| --- | --- |',
    '| alpha | alpha |',
  ].join('\n')
  await page.evaluate((source) => (window as any).__setValue(source), markdown)
  await page.waitForTimeout(150)
  await page.evaluate(() => (window as any).__openFindReplace())
  const widget = page.locator('.vmde-find-replace')
  await widget.locator('[data-find]').fill('alpha')
  await expect(widget.locator('[data-status]')).toHaveText('1/4')
  await widget.locator('[data-replace]').fill('omega')
  await widget.locator('[data-action="replace-all"]').click()
  await expect.poll(() => value(page)).not.toContain('alpha')
  expect(await value(page)).toContain('omega fence')
  expect(await value(page)).toContain('| omega | omega |')

  await page.evaluate(() => (window as any).__undoFindReplace())
  await expect.poll(() => value(page)).toContain('alpha prose')
  expect(await value(page)).toContain('alpha fence')
})

test('case/whole-word toggles update counts and Escape closes', async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).__setValue('Alpha alpha alphabet\n'),
  )
  await page.waitForTimeout(100)
  await page.evaluate(() => (window as any).__openFindReplace())
  const widget = page.locator('.vmde-find-replace')
  await widget.locator('[data-find]').fill('alpha')
  await expect(widget.locator('[data-status]')).toHaveText('1/3')
  await widget.locator('[data-action="word"]').click()
  await expect(widget.locator('[data-status]')).toHaveText('1/2')
  await widget.locator('[data-action="case"]').click()
  await expect(widget.locator('[data-status]')).toHaveText('1/1')
  await widget.locator('[data-find]').press('Escape')
  await expect(widget).toBeHidden()
})

for (const mode of ['wysiwyg', 'sv'] as const) {
  test(`${mode} uses the same source replacement transaction`, async ({
    page,
  }) => {
    await page.evaluate(
      ([next, markdown]) => {
        ;(window as any).__setValue(markdown)
        ;(window as any).__switchMode(next)
      },
      [mode, 'before shared-target after\n'] as const,
    )
    await expect
      .poll(() => page.evaluate(() => (window as any).__mode()))
      .toBe(mode)
    await page.evaluate(() => (window as any).__openFindReplace())
    const widget = page.locator('.vmde-find-replace')
    await widget.locator('[data-find]').fill('shared-target')
    await widget.locator('[data-replace]').fill('changed')
    await widget.locator('[data-action="replace"]').click()
    await expect.poll(() => value(page)).toContain('before changed after')
  })
}
