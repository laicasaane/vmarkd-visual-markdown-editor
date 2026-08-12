import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'd2-code-highlight.md')

type CodeShapeState = { tokens: number; fill: string }

async function codeShapeState(
  frame: ReturnType<typeof wf>,
): Promise<CodeShapeState> {
  return frame
    .locator('.language-d2 svg')
    .first()
    .evaluate((svg) => {
      const tokens = [
        ...svg.querySelectorAll<SVGTSpanElement>('tspan[class*="hljs-"]'),
      ]
      const first = tokens[0]
      return {
        tokens: tokens.length,
        fill: first ? getComputedStyle(first).fill : '',
      }
    })
}

test('D2 code shape uses hljs tokens and follows a content-theme flip', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(180_000)
  try {
    await evaluateInVSCode(
      async (vscode: typeof import('vscode'), args: string[]) => {
        const [uri] = args
        const cfg = vscode.workspace.getConfiguration('vmarkd')
        await cfg.update('diagram.d2.theme', 'auto', true)
        await cfg.update('theme.content', 'github-dark', true)
        await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(uri),
          'vmarkd.editor',
        )
      },
      [FIXTURE] as [string],
    )

    const frame = wf(workbox)
    await frame.locator('.language-d2 svg').first().waitFor({ timeout: 60_000 })
    await expect
      .poll(async () => (await codeShapeState(frame)).tokens, {
        timeout: 30_000,
      })
      .toBeGreaterThan(1)
    const before = await codeShapeState(frame)
    expect(before.tokens).toBeGreaterThan(1)
    expect(before.fill).not.toBe('')

    await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
      await vscode.workspace
        .getConfiguration('vmarkd')
        .update('theme.content', 'material-dark', true)
    })
    await expect
      .poll(async () => (await codeShapeState(frame)).fill, { timeout: 45_000 })
      .not.toBe(before.fill)
  } finally {
    await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
      const cfg = vscode.workspace.getConfiguration('vmarkd')
      await cfg.update('diagram.d2.theme', undefined, true)
      await cfg.update('theme.content', undefined, true)
    })
  }
})
