import { expect, test } from './coverage-fixture'
import type { Page } from '@playwright/test'

async function open(page: Page, mode: 'ir' | 'wysiwyg' | 'sv') {
  await page.goto(`/rewrap.html?mode=${mode}`)
  await page.waitForFunction(() => (window as any).__ready === true)
}

async function placeCaret(page: Page, needle: string, offset: number) {
  await page.evaluate(
    ({ needle, offset }) => {
      const inner = (window as any).vditor.vditor
      const editor = inner[inner.currentMode].element as HTMLElement
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      let node: Text | null = null
      for (
        let current = walker.nextNode();
        current;
        current = walker.nextNode()
      ) {
        if ((current.textContent ?? '').includes(needle)) {
          node = current as Text
          break
        }
      }
      if (!node) throw new Error(`text not found: ${needle}`)
      const range = document.createRange()
      range.setStart(node, node.data.indexOf(needle) + offset)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
    },
    { needle, offset },
  )
}

for (const mode of ['ir', 'wysiwyg', 'sv'] as const) {
  test(`manual rewrap changes only the caret paragraph in ${mode}`, async ({
    page,
  }) => {
    await open(page, mode)
    await placeCaret(page, 'gamma', 2)

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
        markerLeft: document.body.textContent?.includes('VMARKD_REWRAP'),
      }
    })
    expect(state).toMatchObject({ syncs: 1, error: '', markerLeft: false })
    expect(state.sourceCaretOffset).toBe(13)
  })
}

test('Alt+Q uses the capture-phase command path once', async ({ page }) => {
  await open(page, 'sv')
  await placeCaret(page, 'gamma', 2)

  await page.keyboard.press('Alt+q')

  await expect
    .poll(() => page.evaluate(() => (window as any).__rewrap.state().syncs))
    .toBe(1)
  await expect
    .poll(() => page.evaluate(() => (window as any).__rewrap.editor.getValue()))
    .toContain('alpha beta\ngamma delta')
})
