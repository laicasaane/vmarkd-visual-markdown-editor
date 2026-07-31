import { test, expect } from './coverage-fixture'

// Task 453 migration of `test/vscode-e2e/diagram-width.spec.ts`. That spec's own header used to
// say "the harness doesn't render the real diagrams" — no longer true for the four Vditor-NATIVE
// renderers it measures (abc/graphviz/flowchart/mermaid, auto-detected by fenced-block language,
// same mechanism mermaid-harness.ts already proved — see diagram-mount-harness.ts) plus echarts
// (also native, `chartRender`). Ported verbatim: same assertions, same shapes (fit-not-overflow,
// mermaid not blown up to fill, shrink under a narrow viewport), against `diagram-mount.html`'s
// WYSIWYG-mode fixture instead of `all-renderers.md`.
const VIEWPORT = { width: 1300, height: 900 }
test.use({ viewport: VIEWPORT })

test('SVG diagrams fit the column (natural size, shrink-only); abc does not overflow', async ({
  page,
}) => {
  await page.goto('/diagram-mount.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.waitForTimeout(4500)

  const measure = (lang: string) =>
    page.evaluate((l) => (window as any).__measure(l), lang)
  const col = () => page.evaluate(() => (window as any).__col())

  const c = await col()
  const flowchart = await measure('flowchart')
  const abc = await measure('abc')
  const mermaid = await measure('mermaid')
  // eslint-disable-next-line no-console
  console.log(
    `[diagram-width] col=${c} flowchart=${JSON.stringify(flowchart)} abc=${JSON.stringify(abc)} mermaid=${JSON.stringify(mermaid)}`,
  )

  // flowchart renders at NATURAL size and only shrinks to fit — actually rendered, no wider than
  // the column.
  expect(flowchart.hasGraphic).toBe(true)
  expect(flowchart.w).toBeGreaterThan(50)
  expect(flowchart.w).toBeLessThanOrEqual(c + 1)
  // abc used to overflow the column; now it fits.
  expect(abc.hasGraphic).toBe(true)
  expect(abc.w).toBeLessThanOrEqual(c + 1)
  // mermaid is deliberately left at intrinsic size — must NOT be forced to fill the column.
  expect(mermaid.w).toBeLessThan(c * 0.9)

  // …but all diagrams must still SHRINK with a narrowing window (responsive).
  await page.setViewportSize({ width: 700, height: 900 })
  await page.waitForTimeout(1200)
  const narrowCol = await col()
  const narrowGraphviz = await measure('graphviz')
  const narrowEcharts = await measure('echarts')
  const narrowAbc = await measure('abc')
  // eslint-disable-next-line no-console
  console.log(
    `[diagram-width narrow] col=${narrowCol} graphviz=${JSON.stringify(narrowGraphviz)} echarts=${JSON.stringify(narrowEcharts)} abc=${JSON.stringify(narrowAbc)}`,
  )
  // every diagram fits the (now narrow) column — none overflow/clip.
  expect(narrowGraphviz.w).toBeLessThanOrEqual(narrowCol + 1)
  expect(narrowEcharts.w).toBeLessThanOrEqual(narrowCol + 1)
  expect(narrowAbc.w).toBeLessThanOrEqual(narrowCol + 1)
})
