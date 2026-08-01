import { wf } from './webview-helpers'
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

// Edge labels are the italic ones (d2 draws connection labels in N2 italic); node labels are upright
// and sit inside a filled shape, so they need no halo and must not be required to have one.
const READ = `(() => {
  const root = window.vditor.vditor.ir.element
  const texts = Array.from(root.querySelectorAll('.language-d2 svg text'))
    .filter((t) => !t.closest('.vditor-ir__marker--pre'))
  const edge = texts.filter((t) => (t.getAttribute('font-style') || '') === 'italic')
  // A node label: upright, sits inside a shape (not italic, no paint-order halo) — task 421's
  // reference colour ("same as the box labels" per the user report).
  const node = texts.find((t) => (t.getAttribute('font-style') || '') !== 'italic'
    && t.getAttribute('paint-order') !== 'stroke')
  return {
    total: texts.length,
    edge: edge.length,
    haloed: edge.filter((t) => t.getAttribute('paint-order') === 'stroke').length,
    stroke: edge[0] ? edge[0].getAttribute('stroke') : null,
    // The halo must sit UNDER the glyph fill, or it would smear the text.
    keepsFill: edge.every((t) => !!t.getAttribute('fill')),
    edgeFill: edge[0] ? edge[0].getAttribute('fill') : null,
    nodeFill: node ? node.getAttribute('fill') : null,
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

  type Read = {
    total: number
    edge: number
    haloed: number
    stroke: string | null
    keepsFill: boolean
    edgeFill: string | null
    nodeFill: string | null
  }
  // Poll instead of a fixed delay (task 419's class of flake — this spec recurred with the same
  // fixed-settle symptom during the 2026-07-28 session: failed attempt 1, passed on retry, under
  // both contended and briefly-quiet machine load). The fixture renders a dozen d2 blocks
  // concurrently; there is no fixed delay that is both fast and reliable.
  let r: Read = {
    total: 0,
    edge: 0,
    haloed: 0,
    stroke: null,
    keepsFill: false,
    edgeFill: null,
    nodeFill: null,
  }
  await expect
    .poll(
      async () => {
        r = (await frame.locator('body').evaluate(READ)) as Read
        return r.edge
      },
      { timeout: 90_000, message: 'no d2 connection labels ever rendered' },
    )
    .toBeGreaterThan(5)

  expect(
    r.haloed,
    'a connection label had no halo — the line can cut through it',
  ).toBe(r.edge)
  expect(
    r.keepsFill,
    'the halo replaced the label fill instead of sitting under it',
  ).toBe(true)
  // Transparent-canvas themes have no bg colour of their own, so the halo must follow the SURFACE
  // the page paints — --vmarkd-page-bg, with the editor background as the `auto` fallback. Using
  // the editor colour directly put a dark halo on a light github page (task 394).
  expect(r.stroke).toBe(
    'var(--vmarkd-page-bg, var(--vscode-editor-background, transparent))',
  )
  // Task 421 — "kolor labelek na liniach powinien być taki sam jak kolor labelek w boxach": a
  // connection label must paint in the SAME fill as a node label, not d2's own dimmer N2 token.
  expect(
    r.nodeFill,
    'no upright node label found to compare against',
  ).not.toBeNull()
  expect(r.edgeFill).toBe(r.nodeFill)
})
