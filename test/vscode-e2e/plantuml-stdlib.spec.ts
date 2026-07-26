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

// Task 382 — these stdlib diagrams carry their own skinparam (our inlined libraries emit hundreds of
// them), so the palette `<style>` is deliberately NOT injected and the library's LIGHT-PAGE palette
// survives into the SVG. On a dark theme that shipped light-grey labels on a WHITE card: measured
// here at 1.87:1 (vscode-dark) and 1.18:1 (github-dark) against WCAG's 4.5:1. The unit tests pin the
// colour rules; this pins that they still hold after the real stdlib expansion + the real TeaVM
// render + the real custom-editor pipeline — none of which the unit tests exercise.
//
// Colour assertions, not pixels: the pixel suite (task 375) captures the FIRST plantuml block of ITS
// fixture, a plain sequence diagram that takes the palette-injection path, so it never sees any of
// this and would have stayed green through the whole bug.
for (const theme of [
  { content: 'vscode-dark-2026', vscode: 'Default Dark Modern', dark: true },
  { content: 'github-dark', vscode: 'Default Dark Modern', dark: true },
  { content: 'vscode-light-2026', vscode: 'Default Light Modern', dark: false },
] as const) {
  test(`stdlib diagrams are legible on ${theme.content}`, async ({
    workbox,
    evaluateInVSCode,
  }) => {
    test.setTimeout(180_000)
    await evaluateInVSCode(
      async (vscode, args) => {
        const [content, colorTheme] = args as [string, string]
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')
        await vscode.workspace
          .getConfiguration('workbench')
          .update('colorTheme', colorTheme, vscode.ConfigurationTarget.Global)
        await vscode.workspace
          .getConfiguration('vmarkd')
          .update('theme.content', content, vscode.ConfigurationTarget.Global)
      },
      [theme.content, theme.vscode] as [string, string],
    )
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
    const frame = webviewFrame(workbox)
    await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
    await expect
      .poll(
        () =>
          frame.locator('.vditor-ir__preview .language-plantuml svg').count(),
        { timeout: 90_000 },
      )
      .toBeGreaterThanOrEqual(3)
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 6000)))

    const probe = await frame.locator('body').evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll('.vditor-ir__preview .language-plantuml'),
      )
      const fills = (b: Element, sel: string, attr: string) =>
        Array.from(b.querySelectorAll(sel))
          .map((e) => (e.getAttribute(attr) ?? '').toUpperCase())
          .filter(Boolean)
      return {
        fg: getComputedStyle(document.body).color,
        // Block order follows the fixture: C4, AWS, Azure. The sprite TILE is excluded — it is
        // deliberately white (it is the backing an icon's knocked-out highlights are drawn against),
        // so counting it here would make the "no white cards left" assertion fail on the fix itself.
        cardFills: blocks
          .slice(1)
          .flatMap((b) =>
            fills(b, 'rect:not([data-vmarkd-sprite-tile])', 'fill'),
          ),
        // A sprite is backed either by having its own outline composited into it (the real path,
        // needs a canvas) or, failing that, by the fallback rectangle. Count both: the contract is
        // that no sprite is left unbacked, not which of the two did it.
        spritesBacked: blocks
          .slice(1)
          .reduce(
            (n, b) =>
              n +
              b.querySelectorAll(
                '[data-vmarkd-sprite-filled], [data-vmarkd-sprite-tile]',
              ).length,
            0,
          ),
        c4RectFills: fills(blocks[0], 'rect', 'fill'),
        c4Strokes: fills(blocks[0], 'rect', 'stroke'),
        c4TextFills: fills(blocks[0], 'text', 'fill'),
        spriteCount: blocks
          .slice(1)
          .reduce((n, b) => n + b.querySelectorAll('image').length, 0),
      }
    })

    // The sprites are the whole point of these libraries — a theming pass that dropped them would
    // otherwise pass every colour assertion below.
    expect(probe.spriteCount).toBeGreaterThan(0)
    // C4's IDENTITY colours are never touched: the saturated container blue survives on every theme.
    expect(probe.c4RectFills).toContain('#438DD5')
    expect(probe.c4Strokes).toContain('#3C7FC0')
    // …and so do its white labels — only light FILLS become the surface, never text.
    expect(probe.c4TextFills).toContain('#FFFFFF')
    // A transparent shape is not ink. C4's boundary rect is `#00000000`; painting it (the bug this
    // guards) filled it solid and swallowed the diagram.
    expect(probe.c4RectFills).toContain('#00000000')

    const lum = (c: string) => {
      const [r, g, b] = c.startsWith('#')
        ? [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16))
        : (c.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
      const s = (v: number) =>
        v / 255 <= 0.04045
          ? v / 255 / 12.92
          : ((v / 255 + 0.055) / 1.055) ** 2.4
      return 0.2126 * s(r) + 0.7152 * s(g) + 0.0722 * s(b)
    }
    const contrast = (a: string, b: string) =>
      (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

    if (theme.dark) {
      // Every sprite keeps a white backing tile. Azure's artwork KNOCKS OUT its highlights (the SQL
      // lettering, the cylinder rim, two faces of the VM cube are transparent holes that assumed a
      // white page), so without this the icons lose exactly the details that make them readable.
      expect(probe.spritesBacked).toBe(probe.spriteCount)
      // The white card is gone, and what replaced it carries the label at a readable contrast.
      expect(probe.cardFills).not.toContain('#FFFFFF')
      for (const fill of probe.cardFills) {
        if (fill === '#00000000' || fill === 'NONE') continue
        expect(contrast(fill, probe.fg)).toBeGreaterThanOrEqual(4.5)
      }
    } else {
      // Light themes keep the libraries' own palette — it was already correct there, and the
      // captures are byte-identical before/after the fix. No tile either: nothing to back.
      expect(probe.cardFills).toContain('#FFFFFF')
      expect(probe.spritesBacked).toBe(0)
    }
  })
}
