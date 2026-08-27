import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { waitForE2EReadiness, wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'diff-list.md')
const REPO_ROOT = path.resolve(__dirname, '../..')
test.use({ baseDir: REPO_ROOT })

test('editing a list renders one modified gutter bar on the list', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)

  await evaluateInVSCode(
    async (vscode, args) => {
      await vscode.extensions.getExtension('vscode.git')?.activate()
      await vscode.extensions
        .getExtension('laicasaane.visualmarkdowneditor')
        ?.activate()
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
  await waitForE2EReadiness(
    frame,
    (snapshot) => snapshot.routerReady && snapshot.editorEpoch > 0,
    { message: 'the diff-gutter editor installed its update router' },
  )
  await expect
    .poll(() =>
      evaluateInVSCode(
        async (vscode: typeof import('vscode'), args: string[]) => {
          const git = vscode.extensions.getExtension('vscode.git')
          const repositories = git?.exports?.getAPI?.(1)?.repositories ?? []
          return repositories.some(
            (repository: { rootUri: { fsPath: string } }) =>
              args[0].startsWith(`${repository.rootUri.fsPath}/`),
          )
        },
        [FIXTURE] as [string],
      ),
    )
    .toBe(true)

  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      const document = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.fsPath === args[0],
      )
      if (!document) throw new Error('diff fixture TextDocument not found')
      const line = document.lineAt(3)
      const edit = new vscode.WorkspaceEdit()
      edit.insert(document.uri, line.range.end, ' edited')
      if (!(await vscode.workspace.applyEdit(edit)))
        throw new Error('diff fixture edit was rejected')
    },
    [FIXTURE] as [string],
  )

  const readResult = () =>
    frame.locator('body').evaluate(() => {
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
  await expect
    .poll(async () => {
      const result = await readResult()
      const listBlock = result.blocks.find((block) =>
        block.text?.includes('second item edited'),
      )
      return (
        result.bars.length === 1 &&
        result.bars[0].className.includes('me-diff-marker--modified') &&
        listBlock !== undefined &&
        result.bars[0].top === listBlock.top
      )
    })
    .toBe(true)
  const result = await readResult()

  expect(result.bars).toHaveLength(1)
  expect(result.bars[0].className).toContain('me-diff-marker--modified')
  const listBlock = result.blocks.find((block) =>
    block.text?.includes('second item edited'),
  )
  expect(listBlock).toBeDefined()
  expect(result.bars[0].top).toBe(listBlock?.top)
})
