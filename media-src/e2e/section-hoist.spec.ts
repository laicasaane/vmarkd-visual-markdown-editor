import { expect, test, type Page } from './coverage-fixture'

async function open(page: Page): Promise<void> {
  await page.goto('/section-hoist.html')
  await page.waitForFunction(() => (window as any).__ready === true)
}

test('outline hoist scopes the view without changing Markdown and exits for hidden reveals', async ({
  page,
}) => {
  await open(page)
  const original = await page.evaluate(
    () => (window as any).__vmdeOriginalMarkdown,
  )
  await page
    .locator('.vditor-outline [data-target-id]')
    .filter({ hasText: 'Child' })
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Hoist section' }).click()

  await expect(
    page.getByRole('navigation', { name: 'Hoisted section' }),
  ).toHaveText('Doc › Chapter › Child')
  await expect(
    page.locator('.vditor-ir > .vditor-reset > [data-block]:visible'),
  ).toHaveCount(2)
  await expect(
    page.locator('.vditor-outline [data-target-id]:visible'),
  ).toHaveCount(1)
  const childOutline = page
    .locator('.vditor-outline [data-target-id]')
    .filter({ hasText: 'Child' })
  await childOutline.focus()
  await page.keyboard.press('ArrowDown')
  await expect(childOutline).toBeFocused()
  await expect(childOutline).toHaveAttribute('tabindex', '0')
  expect(await page.evaluate(() => (window as any).vditorTest.getValue())).toBe(
    original,
  )

  await page.evaluate(() => {
    document
      .querySelector<HTMLElement>('button[data-mode="wysiwyg"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await expect
    .poll(() => page.evaluate(() => (window as any).vditor.vditor.currentMode))
    .toBe('wysiwyg')
  await expect(
    page.locator('.vditor-wysiwyg > .vditor-reset > [data-block]:visible'),
  ).toHaveCount(2)
  const hiddenMermaid = page.locator(
    '.vditor-wysiwyg [data-vmde-hoist-hidden] .vditor-wysiwyg__preview .language-mermaid',
  )
  await expect(hiddenMermaid).toHaveAttribute('data-vmde-hoist-deferred', '1')
  await page.waitForTimeout(300)
  await expect(hiddenMermaid.locator('svg')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).vditorTest.getValue())).toBe(
    original,
  )
  const wysiwygDetail = page
    .locator('.vditor-wysiwyg > .vditor-reset > p:visible')
    .filter({ hasText: 'Editable child detail.' })
  await wysiwygDetail.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' WYS')
  await expect
    .poll(() => page.evaluate(() => (window as any).vditorTest.getValue()))
    .toContain('Editable child detail. WYS')
  await page.waitForTimeout(900)
  await page.keyboard.press('Control+z')
  await expect
    .poll(() => page.evaluate(() => (window as any).vditorTest.getValue()))
    .toBe(original)

  const togglePreview = () =>
    page.evaluate(() => {
      document
        .querySelector<HTMLElement>('button[data-type="preview"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  await togglePreview()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).vditor.vditor.preview.element.style.display,
      ),
    )
    .toBe('block')
  await expect(
    page.getByRole('navigation', { name: 'Hoisted section' }),
  ).toHaveCount(0)
  await expect(page.locator('[data-vmde-hoist-hidden]')).toHaveCount(0)

  await togglePreview()
  await expect(
    page.getByRole('navigation', { name: 'Hoisted section' }),
  ).toHaveText('Doc › Chapter › Child')

  await page.evaluate(() => (window as any).__vmdeRevealHeading(3))
  await expect(
    page.getByRole('navigation', { name: 'Hoisted section' }),
  ).toHaveCount(0)
  await expect(page.locator('[data-vmde-hoist-hidden]')).toHaveCount(0)
})

test('editing and undo stay whole-document-safe, and find exits the hoist first', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => (window as any).__vmdeSectionHoist.hoistHeading(1))
  const detail = page.locator('.vditor-ir > .vditor-reset > p:visible').last()
  await detail.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' changed')
  await expect
    .poll(() => page.evaluate(() => (window as any).vditorTest.getValue()))
    .toContain('Editable child detail. changed')
  // Vditor commits typing to its undo stack after the configured 800 ms quiet period.
  await page.waitForTimeout(900)
  await page.keyboard.press('Control+z')
  await expect
    .poll(() => page.evaluate(() => (window as any).vditorTest.getValue()))
    .not.toContain('Editable child detail. changed')

  await page.keyboard.press('Control+f')
  await expect(page.locator('[data-vmde-hoist-hidden]')).toHaveCount(0)
})
