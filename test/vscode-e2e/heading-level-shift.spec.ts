import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import {
  docText,
  ExtensionId,
  MarkdownEditorViewType,
  waitForE2EReadiness,
  wf,
} from './webview-helpers'

const INITIAL = `# Root

intro

## Child

body

### Grandchild

## Sibling

# Next

Setext
------
`

const SECTION_SHIFTED = INITIAL.replace('# Root', '## Root')
  .replace('## Child', '### Child')
  .replace('### Grandchild', '#### Grandchild')
  .replace('## Sibling', '### Sibling')

test('real heading chords shift one heading or its subtree with exact undo and save', async ({
  workbox,
  evaluateInVSCode,
  baseDir,
}) => {
  test.setTimeout(180_000)
  const file = path.join(baseDir, 'heading-level-shift.md')
  writeFileSync(file, INITIAL)
  await evaluateInVSCode(
    async (vscode, args: [string, string, string]) => {
      await vscode.extensions.getExtension(args[1])?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        args[2],
      )
    },
    [file, ExtensionId, MarkdownEditorViewType] as [string, string, string],
  )

  const frame = wf(workbox)
  const currentValue = () =>
    frame
      .locator('body')
      .evaluate(() => (window as any).vditor.getValue() as string)
  await frame.locator('.vditor-ir').waitFor({ timeout: 60_000 })
  await waitForE2EReadiness(
    frame,
    (state) =>
      state.routerReady && state.editorEpoch > 0 && state.mode === 'ir',
    { message: 'heading level shift readiness' },
  )
  await frame.locator('.vditor-ir').click({ position: { x: 20, y: 20 } })

  const place = (needle: string, offset: number) =>
    frame.locator('body').evaluate(
      (_body, args) => {
        const inner = (window as any).vditor.vditor
        const editor = inner.ir.element as HTMLElement
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = (node.textContent ?? '').indexOf(args.needle)
          if (index < 0) continue
          editor.focus({ preventScroll: true })
          const range = document.createRange()
          range.setStart(node, index + args.offset)
          range.collapse(true)
          const selection = getSelection()!
          selection.removeAllRanges()
          selection.addRange(range)
          return
        }
        throw new Error(`${args.needle} not found`)
      },
      { needle, offset },
    )

  await place('Child', 2)
  await workbox.keyboard.press('Control+Shift+]')
  await expect
    .poll(() => docText(evaluateInVSCode, file))
    .toBe(INITIAL.replace('## Child', '### Child'))
  await workbox.keyboard.press('Control+z')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(INITIAL)
  await expect.poll(currentValue).toBe(INITIAL)

  await place('Root', 1)
  await workbox.keyboard.press('Control+Alt+Shift+]')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(SECTION_SHIFTED)
  await workbox.keyboard.press('Control+z')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(INITIAL)
  await expect.poll(currentValue).toBe(INITIAL)

  await frame.locator('body').evaluate(() => {
    const inner = (window as any).vditor.vditor
    const editor = inner.ir.element as HTMLElement
    const headings = Array.from(
      editor.querySelectorAll<HTMLElement>('h1,h2,h3'),
    )
    const text = (needle: string) => {
      const heading = headings.find((candidate) =>
        candidate.textContent?.includes(needle),
      )!
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (
          node.textContent?.trim() &&
          !node.parentElement?.closest('.vditor-ir__marker')
        )
          return node as Text
      }
      throw new Error(`${needle} text not found`)
    }
    const root = text('Root')
    const sibling = text('Sibling')
    editor.focus({ preventScroll: true })
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(sibling, sibling.data.length)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await workbox.keyboard.press('Control+Shift+]')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(SECTION_SHIFTED)

  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.files.save')
  })
  await expect.poll(() => readFileSync(file, 'utf8')).toBe(SECTION_SHIFTED)
})
