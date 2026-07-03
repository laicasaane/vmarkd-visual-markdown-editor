// Offline PlantUML stdlib includes (task 136) — real-VS-Code only. Our vendored TeaVM engine ships no
// stdlib and exposes no include hook, so `!include <C4/…>` / `<awslib/…>` / `<azure/…>` produce a
// "Fatal parsing error" SVG. We fix it by lazy-loading a per-lib .puml file-map (window global via
// loadScript — CSP allows script-src, not fetch) and INLINING the referenced files into the source
// before render() (plantuml-stdlib.ts, wired in plantuml-render.ts). This proves in REAL VS Code (the
// resource-URI/CSP pipeline + the TeaVM lazy-load don't reproduce in the Playwright harness) that all
// three libraries render a real diagram offline — no Fatal parsing error, the expected labels present,
// and only the referenced lib maps are fetched.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'plantuml-stdlib.md')
const FIXTURE_ALL = path.join(__dirname, 'fixtures', 'plantuml-stdlib-all.md')

function webviewFrame(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('C4 / AWS / Azure stdlib includes render offline (no Fatal parsing error)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(150_000)
  await evaluateInVSCode(
    async (vscode, args) => {
      const [uri] = args as [string]
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(uri),
        'vmarkd.editor',
      )
    },
    [FIXTURE] as [string],
  )
  const frame = webviewFrame(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  // Wait until all three plantuml blocks have rendered an <svg>, then settle (async TeaVM render).
  await expect
    .poll(
      () => frame.locator('.vditor-ir__preview .language-plantuml svg').count(),
      { timeout: 90_000 },
    )
    .toBeGreaterThanOrEqual(3)
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 4000)))

  const report = await frame.locator('body').evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll('.vditor-ir__preview .language-plantuml'),
    )
    const perBlock = blocks.map((b) => {
      const svg = b.querySelector('svg')
      if (!svg) return { rendered: false }
      const text = Array.from(svg.querySelectorAll('text'))
        .map((t) => t.textContent ?? '')
        .join(' · ')
      return {
        rendered: true,
        // Any PlantUML error render: a failed include → "Fatal parsing error"; a wrong macro call →
        // "Syntax Error? (Assumed diagram type: …)". Catch both so a broken block can't pass by echoing
        // its own source text into the error SVG.
        fatal: /Fatal parsing error|Syntax Error|Assumed diagram type/i.test(
          text,
        ),
        text,
      }
    })
    return {
      perBlock,
      // only the referenced libs were fetched (all three here); the loader tags each script by id
      loaded: {
        c4: !!document.getElementById('vditorPumlStdlib_c4'),
        awslib: !!document.getElementById('vditorPumlStdlib_awslib'),
        azure: !!document.getElementById('vditorPumlStdlib_azure'),
      },
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[puml-stdlib] ${JSON.stringify(report)}`)

  const [c4, aws, azure] = report.perBlock
  // Every block rendered a real diagram — not the Fatal-parsing-error SVG.
  for (const b of report.perBlock) {
    expect(b.rendered).toBe(true)
    expect(b.fatal).toBe(false)
  }
  // …and the diagram-specific labels are present (proof the macros actually ran, not just "no error").
  // PlantUML splits multi-word labels across separate <text> nodes, so normalise the joiner first.
  const norm = (s: string | undefined) =>
    (s ?? '').replace(/·/g, '').replace(/\s+/g, ' ').trim()
  expect(norm(c4.text)).toMatch(/Web App/) // C4 Container label
  expect(norm(c4.text)).toMatch(/Uses \[HTTPS\]/) // C4 Rel
  expect(norm(aws.text)).toMatch(/Web Server/) // awslib EC2 sprite label
  expect(norm(azure.text)).toMatch(/My VM/) // azure AzureVirtualMachine label
  // The lazy-load fetched each referenced lib map.
  expect(report.loaded.c4).toBe(true)
  expect(report.loaded.awslib).toBe(true)
  expect(report.loaded.azure).toBe(true)
})

// A per-category `<awslib/Compute/all>` aggregator is NOT vendored — the expander SYNTHESIZES it by
// concatenating the ~38 individual `<awslib/Compute/*>` icons we do ship (option C: no redundant 3.4 MB
// of aggregators). Its own single-block fixture keeps this isolated from the multi-diagram engine
// type-stickiness flakiness. If EC2 + Lambda (icons from the synthesized aggregator) render, synthesis
// pulled the whole category correctly.
test('a synthesized <awslib/…/all> aggregator renders offline (built from the individual icons)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)
  await evaluateInVSCode(
    async (vscode, args) => {
      const [uri] = args as [string]
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(uri),
        'vmarkd.editor',
      )
    },
    [FIXTURE_ALL] as [string],
  )
  const frame = webviewFrame(workbox)
  await frame
    .locator('.vditor-ir__preview .language-plantuml svg')
    .first()
    .waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 4000)))

  const info = await frame.locator('body').evaluate(() => {
    const svg = document.querySelector(
      '.vditor-ir__preview .language-plantuml svg',
    )
    const text = svg
      ? Array.from(svg.querySelectorAll('text'))
          .map((t) => t.textContent ?? '')
          .join(' · ')
      : ''
    return {
      rendered: !!svg,
      fatal: /Fatal parsing error|Syntax Error|Assumed diagram type/i.test(
        text,
      ),
      text,
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[puml-stdlib-all] ${JSON.stringify(info)}`)
  const norm = (s: string) => s.replace(/·/g, '').replace(/\s+/g, ' ').trim()
  expect(info.rendered).toBe(true)
  expect(info.fatal).toBe(false) // synthesized Compute/all defined every icon → EC2/Lambda parse
  expect(norm(info.text)).toMatch(/Web Server/) // EC2, from the synthesized aggregator
  expect(norm(info.text)).toMatch(/Worker/) // Lambda, from the synthesized aggregator
})
