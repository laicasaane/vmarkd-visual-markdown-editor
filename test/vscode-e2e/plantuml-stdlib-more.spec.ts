// Offline PlantUML stdlib icon libs (task 354) — real-VS-Code only. Seven MIT/Apache libraries vendored
// from the plantuml-stdlib aggregator (k8s, eip, edgy, DomainStory, cloudogu, cloudinsight, kubernetes).
// Same mechanism as task 136 (lazy-load a per-lib .puml file-map via loadScript, inline the referenced
// files before the TeaVM render) — this proves in REAL VS Code (the resource-URI/CSP pipeline + TeaVM
// lazy-load don't reproduce in the Playwright harness) that each lib renders offline with no Fatal
// parsing error, AND that k8s pulls its transitive <C4/C4> dependency (STDLIB_DEPS) though the source
// never names C4.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'plantuml-stdlib-more.md')

function webviewFrame(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('7 stdlib icon libs render offline (+ k8s pulls its C4 dependency)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(180_000)
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
  // Wait until all seven plantuml blocks have rendered an <svg>, then settle (async TeaVM render).
  await expect
    .poll(
      () => frame.locator('.vditor-ir__preview .language-plantuml svg').count(),
      { timeout: 120_000 },
    )
    .toBeGreaterThanOrEqual(7)
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 5000)))

  const report = await frame.locator('body').evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll('.vditor-ir__preview .language-plantuml'),
    )
    const perBlock = blocks.map((b) => {
      const svg = b.querySelector('svg')
      if (!svg) return { rendered: false, fatal: false, text: '', w: 0, h: 0 }
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
        // intrinsic size — an EMPTY diagram (macros silently produced nothing) is PlantUML's 10×10 canvas.
        w: Number(svg.getAttribute('width') ?? 0),
        h: Number(svg.getAttribute('height') ?? 0),
      }
    })
    return {
      perBlock,
      // each lib's map is fetched once via loadScript (tagged by id); c4 is loaded as k8s's dependency.
      loaded: {
        k8s: !!document.getElementById('vditorPumlStdlib_k8s'),
        c4: !!document.getElementById('vditorPumlStdlib_c4'),
        eip: !!document.getElementById('vditorPumlStdlib_eip'),
        edgy: !!document.getElementById('vditorPumlStdlib_edgy'),
        domainstory: !!document.getElementById('vditorPumlStdlib_domainstory'),
        cloudogu: !!document.getElementById('vditorPumlStdlib_cloudogu'),
        cloudinsight: !!document.getElementById(
          'vditorPumlStdlib_cloudinsight',
        ),
        kubernetes: !!document.getElementById('vditorPumlStdlib_kubernetes'),
      },
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[puml-stdlib-more] ${JSON.stringify(report)}`)

  // Every one of the seven blocks rendered a real diagram — not the Fatal-parsing-error SVG.
  expect(report.perBlock.length).toBeGreaterThanOrEqual(7)
  for (const b of report.perBlock) {
    expect(b.rendered).toBe(true)
    expect(b.fatal).toBe(false)
    // NOT the empty 10×10 canvas — catches a lib whose macros silently render nothing (the EIP block-comment
    // bug: a dropped `'/` left a /' block open, swallowing the whole diagram → 10×10 blank, non-fatal).
    expect(b.w, `block rendered non-empty (w=${b.w})`).toBeGreaterThan(40)
    expect(b.h, `block rendered non-empty (h=${b.h})`).toBeGreaterThan(40)
  }

  // Diagram-specific labels present (proof the macros actually ran, not just "no error"). PlantUML splits
  // multi-word labels across <text> nodes, so normalise the joiner first.
  const all = report.perBlock.map((b) => b.text).join(' || ')
  const norm = all.replace(/·/g, '').replace(/\s+/g, ' ')
  expect(norm).toMatch(/service/) // k8s KubernetesSvc label
  expect(norm).toMatch(/Order/) // eip Message label
  expect(norm).toMatch(/Brand/) // edgy $brandFacet label
  expect(norm).toMatch(/Alice/) // DomainStory Person
  expect(norm).toMatch(/Jenkins/) // cloudogu DOGU_JENKINS
  expect(norm).toMatch(/webapp/) // cloudinsight sprite label
  expect(norm).toMatch(/control/) // kubernetes sprite label

  // Every referenced lib map was fetched — plus c4 (k8s's transitive dependency, never named in source).
  for (const [lib, was] of Object.entries(report.loaded)) {
    expect(was, `stdlib map loaded: ${lib}`).toBe(true)
  }
})
