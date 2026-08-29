import { expect, test } from './coverage-fixture'
import { openRewrapHarness, placeRewrapCaret } from './rewrap-helpers'

for (const mode of ['ir', 'wysiwyg', 'sv'] as const) {
  test(`manual rewrap changes only the caret paragraph in ${mode}`, async ({
    page,
  }) => {
    await openRewrapHarness(page, mode)
    await placeRewrapCaret(page, 'gamma', 2)

    await page.evaluate(() => (window as any).__rewrap.run())
    const expected = await page.evaluate(() =>
      (window as any).__rewrap.initial.replace(
        'alpha beta gamma delta epsilon',
        'alpha beta\ngamma delta\nepsilon',
      ),
    )
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).__rewrap.editor.getValue()),
      )
      .toBe(expected)

    const state = await page.evaluate(() => {
      const h = (window as any).__rewrap
      return {
        ...h.state(),
        sourceCaretOffset: h.cursorOffset(),
        markerLeft: document.body.textContent?.includes('VMDE_REWRAP'),
      }
    })
    expect(state).toMatchObject({ syncs: 1, error: '', markerLeft: false })
    expect(state.sourceCaretOffset).toBe(13)
  })
}

test('Alt+Q uses the capture-phase command path once', async ({ page }) => {
  await openRewrapHarness(page, 'sv')
  await placeRewrapCaret(page, 'gamma', 2)

  await page.keyboard.press('Alt+q')

  await expect
    .poll(() => page.evaluate(() => (window as any).__rewrap.state().syncs))
    .toBe(1)
  await expect
    .poll(() => page.evaluate(() => (window as any).__rewrap.editor.getValue()))
    .toContain('alpha beta\ngamma delta')
})
