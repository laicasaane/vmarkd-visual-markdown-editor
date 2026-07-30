// REGRESSION — a live theme flip must re-render PlantUML ONCE, not twice. Real VS Code.
//
// User report: switching the theme on a PlantUML-heavy doc left the diagrams spinning "forever" and
// blank. Measured cause (tmp/all-diagrams-demo.md, 13 blocks): the reThemeMono foreground poll fired
// reRenderPlantuml TWICE per flip — once per intermediate foreground value during the content-theme
// settle (`vditor--dark` class first, then the content `<link>`). Each pass clears + re-renders every
// block, and the second pass clearing blocks MID-render thrashed the TeaVM engine (each stdlib block
// re-preprocesses its ~2000-line library): ~57s of spinner-then-blank, `calls:2 panesReRendered:26`.
// The fix debounces the poll to the SETTLED colour (diagram-retheme.ts reThemeOnForegroundChange) →
// one pass, ~5s, `calls:1 panesReRendered:<blocks>`.
//
// This asserts the contract on a small fixture: after a workbench light→dark flip, every plantuml
// block is re-rendered in the new theme's colour, and reRenderPlantuml fired EXACTLY ONCE.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'plantuml-theme-flip.md')
const LIGHT_FILL = '#3b3b3b' // Default Light Modern themed foreground (baked into the plantuml text)
const DARK_FILL = '#cccccc' // Default Dark Modern themed foreground

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

async function pumlState(frame: ReturnType<typeof wf>) {
  return frame.locator('body').evaluate(() => {
    const els = Array.from(
      document.querySelectorAll('.vditor-ir__preview .language-plantuml'),
    )
    const rendered = els.filter((el) => el.querySelector('svg')).length
    const firstText = els[0]?.querySelector('svg text')
    return {
      total: els.length,
      rendered,
      textFill: (firstText?.getAttribute('fill') ?? 'NONE').toLowerCase(),
      stats:
        (window as unknown as { __vmarkdPumlRethemeStats?: unknown })
          .__vmarkdPumlRethemeStats ?? null,
    }
  })
}

test('a theme flip re-renders every PlantUML block ONCE in the new colour', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(150_000)
  await evaluateInVSCode(
    async (vscode, args) => {
      const [uri] = args as [string]
      await vscode.workspace
        .getConfiguration('vmarkd')
        .update('theme.content', 'auto', true)
      await vscode.workspace
        .getConfiguration('workbench')
        .update('colorTheme', 'Default Light Modern', true)
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
  await frame
    .locator('.vditor-ir__preview .language-plantuml svg')
    .nth(2)
    .waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))
  const before = await pumlState(frame)
  expect(before.total, 'all three plantuml blocks present').toBe(3)
  expect(before.rendered, 'all rendered before the flip').toBe(3)
  expect(before.textFill, 'starts in the light theme colour').toBe(LIGHT_FILL)

  // The workbench colour-theme flip (set-theme → reThemeMono → reRenderPlantuml).
  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('workbench')
      .update('colorTheme', 'Default Dark Modern', true)
  })

  // Poll until the diagrams have re-themed to the dark colour (the re-render is debounced ~250ms then
  // async), with a generous budget — a FAILURE is either "stuck blank" or "never recoloured".
  let after = before
  const start = Date.now()
  while (Date.now() - start < 60_000) {
    after = await pumlState(frame)
    if (after.rendered === after.total && after.textFill === DARK_FILL) break
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 500)))
  }
  // Let any late second settle land, so a double-fire (if it regressed) is counted before we assert.
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 3000)))
  after = await pumlState(frame)
  // eslint-disable-next-line no-console
  console.log(`[puml-flip] ${JSON.stringify(after)} in ${Date.now() - start}ms`)

  expect(after.rendered, 'every block re-rendered (not stuck blank)').toBe(
    after.total,
  )
  expect(after.textFill, 're-rendered in the dark theme colour').toBe(DARK_FILL)
  // The double-fire guard: exactly one re-render pass, one clear+redraw per block.
  const stats = after.stats as { calls: number; panesReRendered: number } | null
  expect(stats, 'plantuml re-theme stats exposed').not.toBeNull()
  expect(
    stats?.calls,
    'reRenderPlantuml fired exactly once (no double-fire)',
  ).toBe(1)
  expect(
    stats?.panesReRendered,
    'each block cleared + redrawn once, not twice',
  ).toBe(after.total)
})
