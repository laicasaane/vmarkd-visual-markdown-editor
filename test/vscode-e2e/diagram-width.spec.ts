// Diagram render width. echarts/mindmap/markmap fill the content column; abc OVERFLOWED it (fixed).
// main.css sizes flowchart/plantuml/smiles at NATURAL size, only SHRINKING to fit the column
// (max-width:100%, no height cap — a tall flowchart is legitimately tall; commit dfbd952 changed them
// from the old width:100% fill), the same approach as graphviz/abc/mermaid → none are forced to fill.
// So each must FIT the column (not overflow) and stay responsive; mermaid must NOT be blown up to full
// width. Real-VS-Code-only (the harness doesn't render the real diagrams) → run headless via
// `xvfb-run -a npx playwright test diagram-width.spec`.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')
function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('SVG diagrams fit the column (natural size, shrink-only); abc no longer overflows', async ({
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
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))
  await frame.locator('body').evaluate(() => {
    const v = (
      window as unknown as {
        vditor: {
          vditor: { toolbar: { elements: Record<string, HTMLElement> } }
        }
      }
    ).vditor.vditor
    v.toolbar.elements['edit-mode']?.children[0]?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    document
      .querySelector('button[data-mode="wysiwyg"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 4500)))

  const m = await frame.locator('body').evaluate(() => {
    const gfx = (lang: string) => {
      const host = document.querySelector(
        `.vditor-wysiwyg__preview > .language-${lang}, .vditor-wysiwyg__preview > code.language-${lang}`,
      ) as HTMLElement | null
      const b = host?.querySelector('svg, canvas')?.getBoundingClientRect()
      return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null
    }
    const col = Math.round(
      (
        document.querySelector('.vditor-wysiwyg__preview') as HTMLElement
      ).getBoundingClientRect().width,
    )
    return {
      col,
      flowchart: gfx('flowchart'),
      abc: gfx('abc'),
      mermaid: gfx('mermaid'),
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[diagram-width] ${JSON.stringify(m)}`)

  // flowchart renders at NATURAL size and only shrinks to fit — it must FIT the column, not fill it
  // (dfbd952: max-width:100%, no height cap — a tall-narrow flowchart is legitimately tall, like
  // graphviz/abc). So: actually rendered, and no wider than the column.
  expect(m.flowchart).not.toBeNull()
  expect(m.flowchart?.w ?? 0).toBeGreaterThan(50)
  expect(m.flowchart?.w ?? 9999).toBeLessThanOrEqual(m.col + 1)
  // abc used to be 755px (overflowed the ~545 column); now it fits.
  expect(m.abc).not.toBeNull()
  expect(m.abc?.w ?? 9999).toBeLessThanOrEqual(m.col + 1)
  // mermaid + graphviz are deliberately left at intrinsic size (user found full-width too big) —
  // mermaid must NOT be forced to fill the column.
  expect(m.mermaid?.w ?? 0).toBeLessThan(m.col * 0.9)

  // …but they (and all diagrams) must still SHRINK with a narrowing window (responsive). graphviz
  // had no max-width and stayed 464px (clipped) when narrow — regress that.
  await workbox.setViewportSize({ width: 700, height: 900 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1200)))
  const narrow = await frame.locator('body').evaluate(() => {
    const w = (sel: string) => {
      const g = document
        .querySelector(
          `.vditor-wysiwyg__preview > .language-${sel}, .vditor-wysiwyg__preview > code.language-${sel}`,
        )
        ?.querySelector('svg, canvas')
      return g ? Math.round(g.getBoundingClientRect().width) : null
    }
    return {
      col: Math.round(
        (
          document.querySelector('.vditor-wysiwyg__preview') as HTMLElement
        ).getBoundingClientRect().width,
      ),
      graphviz: w('graphviz'),
      echarts: w('echarts'),
      abc: w('abc'),
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[diagram-width narrow] ${JSON.stringify(narrow)}`)
  // every diagram fits the (now narrow) column — none overflow/clip.
  expect(narrow.graphviz ?? 9999).toBeLessThanOrEqual(narrow.col + 1)
  expect(narrow.echarts ?? 9999).toBeLessThanOrEqual(narrow.col + 1)
  expect(narrow.abc ?? 9999).toBeLessThanOrEqual(narrow.col + 1)
})
