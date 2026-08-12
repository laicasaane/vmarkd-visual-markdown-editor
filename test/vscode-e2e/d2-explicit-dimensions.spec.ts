import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'd2-explicit-dimensions.md')

test('D2 explicit dimensions reach the real VS Code SVG', async ({
  workbox,
  evaluateInVSCode,
}) => {
  await evaluateInVSCode(
    async (vscode, args) => {
      const [uri] = args as [string]
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
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await frame.locator('.language-d2 svg').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((resolve) => setTimeout(resolve, 4000)))

  const boxes = await frame
    .locator('.language-d2 svg')
    .first()
    .evaluate((svg) =>
      [...svg.querySelectorAll('rect')]
        .map((rect) => ({
          width: Number(rect.getAttribute('width')),
          height: Number(rect.getAttribute('height')),
        }))
        .filter(
          ({ width, height }) =>
            Number.isFinite(width) && Number.isFinite(height),
        ),
    )

  expect(boxes).toContainEqual({ width: 200, height: 80 })
  expect(boxes).toContainEqual({ width: 20, height: 10 })
})
