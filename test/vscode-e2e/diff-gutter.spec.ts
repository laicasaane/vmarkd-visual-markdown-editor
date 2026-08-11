import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { settle, wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'diff-list.md')

test('editing a list renders one modified gutter bar on the list', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)

  await evaluateInVSCode(
    async (vscode, args) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file((args as string[])[0]),
        'vmarkd.editor',
      )
    },
    [FIXTURE] as [string],
  )

  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await settle(frame, 1_500)

  await frame
    .locator('.vditor-ir')
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(() => {
    const root = document.querySelector('.vditor-ir')
    const walker = document.createTreeWalker(
      root ?? document.body,
      NodeFilter.SHOW_TEXT,
    )
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent !== 'second item') continue
      const range = document.createRange()
      range.setStart(node, node.textContent.length)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      ;(node.parentElement as HTMLElement | null)?.focus()
      return
    }
    throw new Error('second list item not found')
  })
  await workbox.keyboard.type(' edited')
  await settle(frame, 2_000)

  const result = await frame.locator('body').evaluate(() => {
    const editor = document.querySelector('.vditor-ir .vditor-reset')
    const bars = Array.from(
      document.querySelectorAll('.me-diff-marker'),
    ) as HTMLElement[]
    const blocks = Array.from(editor?.children ?? []) as HTMLElement[]
    return {
      bars: bars.map((bar) => ({
        className: bar.className,
        top: bar.offsetTop,
      })),
      blocks: blocks
        .filter((block) => !block.classList.contains('me-diff-marker'))
        .map((block) => ({ text: block.textContent, top: block.offsetTop })),
    }
  })

  expect(result.bars).toHaveLength(1)
  expect(result.bars[0].className).toContain('me-diff-marker--modified')
  const listBlock = result.blocks.find((block) =>
    block.text?.includes('second item edited'),
  )
  expect(listBlock).toBeDefined()
  expect(result.bars[0].top).toBe(listBlock?.top)
})
