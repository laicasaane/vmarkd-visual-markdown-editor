import type { Page } from '@playwright/test'

export async function openRewrapHarness(
  page: Page,
  mode: 'ir' | 'wysiwyg' | 'sv',
  auto = false,
  wholeDocument = false,
  column = 12,
  headingShift = false,
) {
  await page.goto(
    `/rewrap.html?mode=${mode}&column=${column}${auto ? '&auto=1' : ''}${wholeDocument ? '&whole=1' : ''}${headingShift ? '&heading=1' : ''}`,
  )
  await page.waitForFunction(() => (window as any).__ready === true)
  if (auto || headingShift) {
    await page.waitForFunction(() => {
      const inner = (window as any).__rewrap.editor.vditor
      return inner.undo[inner.currentMode].undoStack.length >= 1
    })
  }
}

export async function placeRewrapCaret(
  page: Page,
  needle: string,
  offset: number,
) {
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
