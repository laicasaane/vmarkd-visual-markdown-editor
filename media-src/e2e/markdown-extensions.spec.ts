import { expect, test } from './coverage-fixture'

for (const mode of ['ir', 'wysiwyg', 'sv'] as const) {
  test(`${mode}: bundled Markdown extensions stay literal when disabled`, async ({
    page,
  }) => {
    await page.goto(`/markdown-extensions.html?mode=${mode}`)
    await page.waitForFunction(() => (window as any).__ready)
    const current = await page.evaluate(
      () => (window as any).__extensions.editor.getValue() as string,
    )
    const expected = await page.evaluate(
      () => (window as any).__extensions.markdown,
    )
    expect(current.replace(/[\r\n]+$/u, '')).toBe(
      expected.replace(/[\r\n]+$/u, ''),
    )
    const root = page.locator(
      mode === 'sv' ? '.vditor-preview' : `.vditor-${mode}`,
    )
    await expect(root.locator('.vditor-toc')).toHaveCount(0)
    await expect(root.locator('mark, sup, sub')).toHaveCount(0)
    await expect(root.locator('s, del')).toHaveCount(2)
  })

  test(`${mode}: toc, mark, sup, and sub render and round-trip when enabled`, async ({
    page,
  }) => {
    await page.goto(`/markdown-extensions.html?mode=${mode}&enabled=1`)
    await page.waitForFunction(() => (window as any).__ready)
    const root = page.locator(
      mode === 'sv' ? '.vditor-preview' : `.vditor-${mode}`,
    )
    await expect(root.locator('.vditor-toc')).toHaveCount(1)
    await expect(root.locator('mark')).toHaveText('marked')
    await expect(root.locator('sup')).toHaveText('2')
    await expect(root.locator('sub')).toHaveText('2')
    await expect(root.locator('s, del')).toHaveCount(1)
    const current = await page.evaluate(
      () => (window as any).__extensions.editor.getValue() as string,
    )
    const expected = await page.evaluate(
      () => (window as any).__extensions.markdown,
    )
    expect(current.replace(/[\r\n]+$/u, '')).toBe(
      expected.replace(/[\r\n]+$/u, ''),
    )
    if (mode === 'ir') {
      await page
        .locator('.vditor')
        .evaluate((element) => element.classList.add('vditor--dark'))
      const colors = await root.locator('mark').evaluate((element) => {
        const style = getComputedStyle(element)
        return { background: style.backgroundColor, color: style.color }
      })
      expect(colors.background).not.toBe('rgb(255, 255, 0)')
      expect(colors.background).not.toBe('rgba(0, 0, 0, 0)')
      expect(colors.color).not.toBe('rgb(0, 0, 0)')
    }
  })
}

test('enabled toc entries navigate to their heading', async ({ page }) => {
  await page.goto('/markdown-extensions.html?mode=ir&enabled=1')
  await page.waitForFunction(() => (window as any).__ready)
  const target = page
    .locator('.vditor-toc [data-target-id]')
    .filter({ hasText: 'Two' })
    .first()
  await expect(target).toHaveText('Two')
  const headingId = await target.getAttribute('data-target-id')
  const heading = page.locator(`[id="${headingId}"]`)
  const before = await heading.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    viewportHeight: window.innerHeight,
    pageScroll: document.scrollingElement?.scrollTop ?? 0,
    editorScroll: element.closest('.vditor-reset')?.scrollTop ?? 0,
  }))
  expect(before.top).toBeGreaterThan(before.viewportHeight)
  await target.click()
  await expect
    .poll(() =>
      heading.evaluate(
        (element, initial) =>
          (document.scrollingElement?.scrollTop ?? 0) > initial.pageScroll ||
          (element.closest('.vditor-reset')?.scrollTop ?? 0) >
            initial.editorScroll,
        before,
      ),
    )
    .toBe(true)
  const after = await heading.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    pageScroll: document.scrollingElement?.scrollTop ?? 0,
    editorScroll: element.closest('.vditor-reset')?.scrollTop ?? 0,
  }))
  expect(
    after.pageScroll > before.pageScroll ||
      after.editorScroll > before.editorScroll,
  ).toBe(true)
})

test('IR caret editing expands each inline marker and preserves toc-adjacent source', async ({
  page,
}) => {
  await page.goto('/markdown-extensions.html?mode=ir&enabled=1')
  await page.waitForFunction(() => (window as any).__ready)

  const editInline = async (
    type: 'mark' | 'sup' | 'sub',
    rendered: 'mark' | 'sup' | 'sub',
    suffix: string,
  ) => {
    const node = page.locator(`.vditor-ir [data-type="${type}"]`).first()
    await expect(node).not.toHaveClass(/vditor-ir__node--expand/)
    await node.locator(rendered).click()
    await expect(node).toHaveClass(/vditor-ir__node--expand/)
    await node.locator(rendered).evaluate((element) => {
      const text = element.firstChild!
      const range = document.createRange()
      range.setStart(text, text.textContent!.length)
      range.collapse(true)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await page.keyboard.type(suffix)
    await page.locator('.vditor-ir h1').click()
    await expect(node).not.toHaveClass(/vditor-ir__node--expand/)
  }

  await editInline('mark', 'mark', '!')
  await editInline('sup', 'sup', '3')
  await editInline('sub', 'sub', '0')

  const heading = page.locator('.vditor-ir h2').last()
  await heading.evaluate((element) => {
    const text = element.lastChild!
    const range = document.createRange()
    range.setStart(text, text.textContent!.length)
    range.collapse(true)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.keyboard.type(' edited')

  const current = await page.evaluate(
    () => (window as any).__extensions.editor.getValue() as string,
  )
  expect(current).toContain('[toc]')
  expect(current).toContain('==marked!== x^23^ H~20~O ~~strike~~')
  expect(current).toContain('## Two edited')
})
