import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// PROBE (task 190 P1) — undo AND redo interop. undo-dirty-probe covers undo-to-start; the REDO
// direction (Ctrl+Y after Ctrl+Z) was never exercised. Type a distinctive marker, undo it away,
// then redo it back — proving the webview→Vditor undo stack round-trips in both directions and
// the document reflects each step.
const SRC = path.join(__dirname, 'fixtures', 'doc-sync.md')
const MARK = 'REDOMARK'

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('type → undo → redo round-trips the document', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)
  const tmp = path.join(tmpdir(), 'vmarkd-undo-redo.md')
  writeFileSync(tmp, readFileSync(SRC, 'utf8'))
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [tmp] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))

  const docText = () =>
    evaluateInVSCode(
      async (vscode: typeof import('vscode'), args: string[]) => {
        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.fsPath === args[0],
        )
        return doc?.getText() ?? ''
      },
      [tmp] as [string],
    ) as Promise<string>

  // Caret at the end of CARET-ANCHOR, type the marker.
  // Give the nested webview iframe PAGE-LEVEL keyboard focus before typing (click the editor's
  // top-left margin). The evaluate below only does a DOM-level p.focus(); keyboard.type() dispatches
  // to the top Electron window, so without this the keystrokes race the focus and drop
  // non-deterministically. Harness focus fix, not product behaviour.
  await frame
    .locator('.vditor-ir')
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(() => {
    const p = [...document.querySelectorAll('.vditor-ir p')].find((x) =>
      x.textContent?.includes('CARET-ANCHOR'),
    ) as HTMLElement | undefined
    const t = p?.lastChild as Text | null
    if (!t) throw new Error('caret anchor not found')
    const r = document.createRange()
    r.setStart(t, (t.textContent ?? '').length)
    r.collapse(true)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    p?.focus()
  })
  await workbox.keyboard.type(MARK, { delay: 50 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 2000)))
  expect((await docText()).includes(MARK), 'typed marker reached doc').toBe(
    true,
  )

  // Undo it away (Vditor's own undo, routed from the captured Ctrl+Z).
  for (let i = 0; i < 15; i++) {
    await workbox.keyboard.press('Control+z')
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 120)))
  }
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))
  expect((await docText()).includes(MARK), 'undo removed the marker').toBe(
    false,
  )

  // Redo it back (Ctrl+Y) — the direction undo-dirty-probe never covered.
  for (let i = 0; i < 15; i++) {
    await workbox.keyboard.press('Control+y')
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 120)))
  }
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))
  const afterRedo = await docText()
  // eslint-disable-next-line no-console
  console.log(`[undo-redo] afterRedo hasMark=${afterRedo.includes(MARK)}`)
  rmSync(tmp, { force: true })
  expect(afterRedo.includes(MARK), 'redo restored the marker').toBe(true)
})
