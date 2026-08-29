import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { ExtensionId, MarkdownEditorViewType, wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'sample.md')
const ConfigurationRoot = 'vmde'
const FormerRoot = ['v', 'markd'].join('')
const FormerExtensionId = `laicasaane.${['visual', 'markdown', 'editor'].join('')}`

test.afterEach(async ({ evaluateInVSCode }) => {
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), root: string) => {
      await vscode.workspace
        .getConfiguration(root)
        .update(
          'editor.defaultMode',
          undefined,
          vscode.ConfigurationTarget.Global,
        )
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    },
    ConfigurationRoot,
  )
})

test('loads and contributes only the canonical vmde identity', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)

  const identity = (await evaluateInVSCode(
    async (
      vscode: typeof import('vscode'),
      args: [string, string, string, string],
    ) => {
      const [extensionId, formerExtensionId, namespace, formerNamespace] = args
      const extension = vscode.extensions.getExtension(extensionId)
      await extension?.activate()
      const commands = await vscode.commands.getCommands(true)
      const contributions = JSON.stringify(
        extension?.packageJSON?.contributes ?? {},
      )
      return {
        canonicalInstalled: extension?.id === extensionId,
        formerInstalled:
          vscode.extensions.getExtension(formerExtensionId) !== undefined,
        hasCanonicalCommand: commands.includes(`${namespace}.openTextEditor`),
        hasFormerCommand: commands.includes(
          `${formerNamespace}.openTextEditor`,
        ),
        contributionsUseFormerNamespace: contributions
          .toLowerCase()
          .includes(formerNamespace.toLowerCase()),
      }
    },
    [ExtensionId, FormerExtensionId, ConfigurationRoot, FormerRoot] as [
      string,
      string,
      string,
      string,
    ],
  )) as {
    canonicalInstalled: boolean
    formerInstalled: boolean
    hasCanonicalCommand: boolean
    hasFormerCommand: boolean
    contributionsUseFormerNamespace: boolean
  }

  expect(identity).toEqual({
    canonicalInstalled: true,
    formerInstalled: false,
    hasCanonicalCommand: true,
    hasFormerCommand: false,
    contributionsUseFormerNamespace: false,
  })

  await evaluateInVSCode(
    async (
      vscode: typeof import('vscode'),
      args: [string, string, string, string],
    ) => {
      const [root, extensionId, viewType, fixture] = args
      await vscode.workspace
        .getConfiguration(root)
        .update('editor.defaultMode', 'sv', vscode.ConfigurationTarget.Global)
      await vscode.extensions.getExtension(extensionId)?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(fixture),
        viewType,
      )
    },
    [ConfigurationRoot, ExtensionId, MarkdownEditorViewType, FIXTURE] as [
      string,
      string,
      string,
      string,
    ],
  )

  await expect(wf(workbox).locator('.vditor-sv').first()).toBeVisible({
    timeout: 60_000,
  })

  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), fixture: string) => {
      await vscode.commands.executeCommand(
        'vmde.openTextEditor',
        vscode.Uri.file(fixture),
      )
    },
    FIXTURE,
  )
  await expect
    .poll(
      () =>
        evaluateInVSCode(
          async (vscode: typeof import('vscode')) =>
            vscode.window.activeTextEditor?.document.uri.fsPath ?? null,
          [],
        ),
      { timeout: 30_000 },
    )
    .toBe(FIXTURE)
})
