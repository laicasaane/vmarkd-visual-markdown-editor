// NET — a d2 connection label must not be cut in half by its own line.
//
// Reported: "w preview na d2 labelki na diagramach są przecinane linią jakby tło miało
// przezroczyste". d2's own renderer draws a background rect behind edge labels; ours emitted a bare
// <text>, so any route passing under a label ran straight through the glyphs.
//
// The panes were NOT the problem — they are byte-identical since the render reuse (measured: all 12
// d2 blocks cache-hit, zero markup diffs), so the label was cut in IR too; Preview is just where it
// gets read. The fix is in the SVG we emit.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

// Edge labels are the italic ones (d2 draws connection labels in N2 italic); node labels are upright
// and sit inside a filled shape, so they need no halo and must not be required to have one.
const READ = `(() => {
  const root = window.vditor.vditor.ir.element
  const texts = Array.from(root.querySelectorAll('.language-d2 svg text'))
    .filter((t) => !t.closest('.vditor-ir__marker--pre'))
  const edge = texts.filter((t) => (t.getAttribute('font-style') || '') === 'italic')
  return {
    total: texts.length,
    edge: edge.length,
    haloed: edge.filter((t) => t.getAttribute('paint-order') === 'stroke').length,
    stroke: edge[0] ? edge[0].getAttribute('stroke') : null,
    // The halo must sit UNDER the glyph fill, or it would smear the text.
    keepsFill: edge.every((t) => !!t.getAttribute('fill')),
  }
})()`

test('d2 connection labels carry a background halo so the line cannot cross them', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(180_000)
  await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
    await vscode.workspace
      .getConfiguration('vmarkd')
      .update('theme.content', 'auto', vscode.ConfigurationTarget.Global)
  })
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
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 90_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 12_000)))

  const r = (await frame.locator('body').evaluate(READ)) as {
    total: number
    edge: number
    haloed: number
    stroke: string | null
    keepsFill: boolean
  }
  // Never let an unrendered fixture pass as "all labels fine".
  expect(r.edge, 'no d2 connection labels rendered at all').toBeGreaterThan(5)
  expect(
    r.haloed,
    'a connection label had no halo — the line can cut through it',
  ).toBe(r.edge)
  expect(
    r.keepsFill,
    'the halo replaced the label fill instead of sitting under it',
  ).toBe(true)
  // Transparent-canvas themes have no bg colour of their own, so the halo must follow the editor.
  expect(r.stroke).toContain('var(--vscode-editor-background')
})
