import path from 'node:path'
import { test } from 'vscode-test-playwright'

// PROBE (not a guard): measure where VS Code's BUILT-IN markdown preview actually puts the text,
// so vMarkd's gutter can be matched to the measured value rather than to the 26px read off
// markdown.css (which may sit inside further wrappers). Prints; asserts nothing.
const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')

test('measure the native markdown preview gutter', async ({
  workbox,
  evaluateInVSCode,
}) => {
  await evaluateInVSCode(
    async (vscode, args) => {
      const [uri] = args as [string]
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(uri))
      await vscode.window.showTextDocument(doc)
      await vscode.commands.executeCommand('markdown.showPreview')
    },
    [FIXTURE] as [string],
  )

  const frame = workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title*="Preview"], #active-frame')
  await frame.locator('body').waitFor({ timeout: 45_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 2500)))

  const m = await frame.locator('body').evaluate(() => {
    const b = document.body
    const bs = getComputedStyle(b)
    const p = document.querySelector('p') as HTMLElement | null
    const h = document.querySelector('h1, h2') as HTMLElement | null
    const wrapper = document.querySelector(
      '.markdown-body',
    ) as HTMLElement | null
    return {
      bodyPadding: `${bs.paddingLeft} / ${bs.paddingRight}`,
      bodyWidth: b.clientWidth,
      innerWidth: window.innerWidth,
      wrapperPadding: wrapper
        ? `${getComputedStyle(wrapper).paddingLeft} / ${getComputedStyle(wrapper).marginLeft}`
        : 'NO .markdown-body',
      paraLeft: p ? p.getBoundingClientRect().left : -1,
      paraRight: p ? window.innerWidth - p.getBoundingClientRect().right : -1,
      headingLeft: h ? h.getBoundingClientRect().left : -1,
    }
  })
  // eslint-disable-next-line no-console
  console.log('[native-preview]', JSON.stringify(m, null, 2))
})
