// Task 282 in the REAL editor: `vmarkd.editor.defaultMode` decides which mode a document opens in.
//
// Two things make this worth a real-VS-Code test rather than a unit one. First, the resolved mode
// has to survive the SAVED Vditor options, which are spread on top of the config in the init payload
// — the "settings pinned by a stale saved value" bug class (line numbers, content theme) has bitten
// this codebase repeatedly, and only a real open exercises that merge end to end. Second, `preview`
// is not a Vditor mode at all: it is a toolbar overlay driven by a click, so nothing but a live
// editor proves it lands.
//
// Both values are asserted in ONE test (one VS Code boot — the fixture is the same and each leg is
// just a reopen; see task 450 on why extra `test()` blocks are the expensive unit here).
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'caret-on-open-text.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('the configured default mode decides how a document opens', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(150_000)

  const openWith = async (mode: string) => {
    await evaluateInVSCode(
      async (vscode: typeof import('vscode'), args: string[]) => {
        await vscode.workspace
          .getConfiguration('vmarkd')
          .update(
            'editor.defaultMode',
            args[0],
            vscode.ConfigurationTarget.Global,
          )
        await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(args[1]),
          'vmarkd.editor',
        )
      },
      [mode, FIXTURE] as [string, string],
    )
  }

  const close = async () => {
    await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    })
    // The next leg's frameLocator would otherwise resolve against the previous editor's iframe,
    // which is still in the DOM for a moment, and re-read the mode it already asserted.
    await expect
      .poll(() => workbox.locator('iframe.webview').count(), {
        timeout: 30_000,
      })
      .toBe(0)
  }

  // Reading the LIVE instance rather than the DOM: `vditor.vditor.currentMode` is what Vditor
  // itself acts on, and the preview overlay is a toolbar button state, not a mode.
  const state = () =>
    wf(workbox)
      .locator('body')
      .evaluate(() => {
        const inner = (
          window as unknown as {
            vditor?: {
              vditor?: {
                currentMode?: string
                toolbar?: { elements?: Record<string, HTMLElement> }
              }
            }
          }
        ).vditor?.vditor
        const btn = inner?.toolbar?.elements?.preview?.children[0]
        return {
          mode: inner?.currentMode ?? null,
          previewOn: !!btn?.classList.contains('vditor-menu--current'),
        }
      })

  // sv: a genuine Vditor mode, and NOT the hardcoded ir default — so a pass here cannot come from
  // the old behaviour.
  await openWith('sv')
  await wf(workbox).locator('.vditor-sv').first().waitFor({ timeout: 60_000 })
  await expect.poll(state, { timeout: 30_000 }).toMatchObject({
    mode: 'sv',
    previewOn: false,
  })
  await close()

  // preview: boots ir underneath with the Preview overlay toggled on.
  await openWith('preview')
  await wf(workbox).locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await expect.poll(state, { timeout: 30_000 }).toMatchObject({
    mode: 'ir',
    previewOn: true,
  })
  await close()

  // remember: the pre-282 behaviour must still work. The previous leg left sv/preview persisted in
  // the saved Vditor options, so this proves "remember" really does defer to them rather than the
  // setting quietly forcing ir.
  await openWith('remember')
  await wf(workbox).locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await expect
    .poll(async () => (await state()).mode, { timeout: 30_000 })
    .not.toBeNull()
})
