import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// PROBE (diagnostic) — why does undoing back to the open state leave the tab dirty? Distinguishes:
//   Layer 1: content didn't return to disk (reflow) → finalDirty=true & textMatchesDisk=false
//   Layer 2: VS Code dirty is version-based → finalDirty=true & textMatchesDisk=true
//   no-bug : finalDirty=false
const FIXTURE = path.join(__dirname, 'fixtures', 'undo-dirty.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('undo-to-start dirty probe', async ({ workbox, evaluateInVSCode }) => {
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [FIXTURE] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))

  const docState = () =>
    evaluateInVSCode(
      async (vscode: typeof import('vscode'), args: string[]) => {
        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.fsPath === args[0],
        )
        return { isDirty: !!doc?.isDirty, text: doc?.getText() ?? '' }
      },
      [FIXTURE] as [string],
    ) as Promise<{ isDirty: boolean; text: string }>

  const initial = await docState() // == disk bytes (VS Code just loaded the file)

  // caret at the end of the "Edit here" last line, type a few chars
  await frame.locator('body').evaluate(() => {
    const p = Array.from(
      document.querySelectorAll('.vditor-ir p, .vditor-ir li, .vditor-ir h1'),
    ).find((x) => x.textContent?.includes('Edit here')) as
      | HTMLElement
      | undefined
    const t = p?.lastChild as Text | null
    if (!t) return
    const r = document.createRange()
    r.setStart(t, (t.textContent ?? '').length)
    r.collapse(true)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    p?.focus()
  })
  await workbox.keyboard.type('abcdef', { delay: 50 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 2500)))
  const afterEdit = await docState()

  // undo it all (webview captures Ctrl+Z → Vditor undo → forward WorkspaceEdit)
  for (let i = 0; i < 12; i++) {
    await workbox.keyboard.press('Control+z')
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 200)))
  }
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 2000)))
  const final = await docState()

  const textMatchesDisk = final.text === initial.text
  // eslint-disable-next-line no-console
  console.log(
    `[undo-dirty] initialDirty=${initial.isDirty} afterEditDirty=${afterEdit.isDirty} ` +
      `finalDirty=${final.isDirty} textMatchesDisk=${textMatchesDisk}\n` +
      `  layer=${final.isDirty ? (textMatchesDisk ? 'L2 (version-based dirty; content matches disk)' : 'L1 (content != disk after undo)') : 'NO BUG (clean after undo)'}\n` +
      `  initial tail=${JSON.stringify(initial.text.slice(-50))}\n` +
      `  final   tail=${JSON.stringify(final.text.slice(-50))}`,
  )
  expect(afterEdit.isDirty, 'editing should mark dirty').toBe(true)
})
