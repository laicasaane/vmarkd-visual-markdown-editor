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

const CONTENT = '# One\n\n[toc]\n\n==marked== x^2^ H~2~O ~~strike~~\n\n## Two\n'
const EDITED = CONTENT.replace(
  '==marked== x^2^ H~2~O',
  '==marked!== x^23^ H~20~O',
).replace('## Two', '## Two edited')

test('bundled Markdown extensions render, edit, and save in real VS Code', async ({
  workbox,
  evaluateInVSCode,
  baseDir,
}) => {
  const file = path.join(baseDir, 'markdown-extensions.md')
  writeFileSync(file, CONTENT)
  await evaluateInVSCode(
    async (vscode, args: [string, string, string]) => {
      const config = vscode.workspace.getConfiguration(
        'vmde',
        vscode.Uri.file(args[0]),
      )
      for (const key of ['markdown.toc', 'markdown.mark', 'markdown.supSub'])
        await config.update(key, true, vscode.ConfigurationTarget.Workspace)
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
  await frame.locator('.vditor-ir').waitFor({ timeout: 60_000 })
  await waitForE2EReadiness(
    frame,
    (state) =>
      state.routerReady && state.editorEpoch > 0 && state.mode === 'ir',
    { message: 'Markdown extensions readiness' },
  )
  await expect(frame.locator('.vditor-ir .vditor-toc')).toHaveCount(1)
  await expect(frame.locator('.vditor-ir mark')).toHaveText('marked')
  await expect(frame.locator('.vditor-ir sup')).toHaveText('2')
  await expect(frame.locator('.vditor-ir sub')).toHaveText('2')
  await expect(frame.locator('.vditor-ir s')).toHaveCount(1)

  const typeAtInlineEnd = async (
    selector: 'mark' | 'sup' | 'sub',
    text: string,
  ) => {
    const rendered = frame.locator(`.vditor-ir ${selector}`)
    const node = frame.locator(`.vditor-ir [data-type="${selector}"]`)
    await rendered.click()
    await expect(node).toHaveClass(/vditor-ir__node--expand/)
    await rendered.evaluate((element) => {
      const root = (window as any).vditor.vditor.ir.element as HTMLElement
      const text = element.firstChild!
      root.focus({ preventScroll: true })
      const range = document.createRange()
      range.setStart(text, text.textContent!.length)
      range.collapse(true)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await workbox.keyboard.type(text)
  }

  await typeAtInlineEnd('mark', '!')
  await expect
    .poll(() => docText(evaluateInVSCode, file))
    .toContain('==marked!==')
  await typeAtInlineEnd('sup', '3')
  await expect.poll(() => docText(evaluateInVSCode, file)).toContain('x^23^')
  await typeAtInlineEnd('sub', '0')
  await expect.poll(() => docText(evaluateInVSCode, file)).toContain('H~20~O')

  await frame.locator('.vditor-ir h2').evaluate((element) => {
    const root = (window as any).vditor.vditor.ir.element as HTMLElement
    const text = element.lastChild!
    root.focus({ preventScroll: true })
    const range = document.createRange()
    range.setStart(text, text.textContent!.length)
    range.collapse(true)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await workbox.keyboard.type(' edited')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(EDITED)
  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.files.save')
  })
  await expect.poll(() => readFileSync(file, 'utf8')).toBe(EDITED)
})
