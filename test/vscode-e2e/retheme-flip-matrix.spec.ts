import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// NET+PROBE (task 190 P1) — a VS Code theme flip must (a) re-colour the diagram engines and
// (b) NOT duplicate or drop any render (the same "a global re-render event corrupts family Y"
// class task 189 caught for edits, here on the theme-flip trigger, across all 14 families —
// including plantuml/graphviz/abc/markmap/smiles/mindmap whose dark path had no coverage).
// Flipping workbench.colorTheme fires onDidChangeActiveColorTheme → set-theme → rethemeDiagrams.
const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')
const LANGS = [
  'mermaid',
  'echarts',
  'mindmap',
  'markmap',
  'flowchart',
  'graphviz',
  'plantuml',
  'abc',
  'smiles',
  'wavedrom',
  'nomnoml',
  'd2',
  'vega-lite',
  'geojson',
] as const

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

// Per-family census (counts) + a colour digest (every fill/stroke attr under the family's
// elements). Counts guard against dup/lost renders; the digest detects a re-colour.
const CENSUS = `(() => {
  const pv = document.querySelector('.vditor-preview, .vditor-ir') || document.body
  const out = {}
  let colours = ''
  for (const lang of ${JSON.stringify(LANGS)}) {
    const els = [...pv.querySelectorAll('.language-' + lang)]
    out[lang] = {
      els: els.length,
      svgs: pv.querySelectorAll('.language-' + lang + ' svg').length,
      canvases: pv.querySelectorAll('.language-' + lang + ' canvas').length,
    }
    for (const el of els)
      for (const n of el.querySelectorAll('[fill],[stroke]'))
        colours += (n.getAttribute('fill')||'') + (n.getAttribute('stroke')||'') + ';'
  }
  return { out, colourLen: colours.length, colourDigest: colours.slice(0, 4000) }
})()`

test('a theme flip re-colours engines without duplicating or dropping any render', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(180_000)
  // PRECONDITION: the content theme must FOLLOW the editor ('auto') — this spec asserts that a
  // workbench flip re-colours the engines, which only holds when the flip moves the webview
  // foreground. Sibling specs (echarts-theme, d2-theme, …) PIN `theme.content` globally and never
  // restore it, so in a full-suite run this spec would otherwise inherit a pinned theme, the flip
  // would legitimately re-colour nothing, and assertion (b) would fail on the product's correct
  // behaviour. Set it explicitly so the spec does not depend on what ran before it.
  //
  // Set it BEFORE opening the document, not after: a content-theme switch triggers the mono
  // re-theme, and reRenderLang clears a block (innerHTML='') before re-rendering it. Landing that on
  // a block whose FIRST render hasn't finished throws away the only copy of its source, and the
  // block stays empty forever — observed with the two slowest WASM engines (graphviz's Viz.js and
  // plantuml's TeaVM), which then never drew at all, even given 120s.
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
  await frame
    .locator('.vditor-ir .language-d2 svg')
    .first()
    .waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 3000)))

  const census = () =>
    frame
      .locator('body')
      .evaluate(
        (_b, src) => new Function(`return ${src}`)(),
        CENSUS,
      ) as Promise<{
      out: Record<string, { els: number; svgs: number; canvases: number }>
      colourLen: number
      colourDigest: string
    }>

  const setTheme = async (name: string) => {
    await evaluateInVSCode(
      async (vscode: typeof import('vscode'), args: string[]) => {
        await vscode.workspace
          .getConfiguration('workbench')
          .update('colorTheme', args[0], vscode.ConfigurationTarget.Global)
      },
      [name] as [string],
    )
    // rAF + 400ms deferral + foreground polling (~2s) + engine re-render.
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 4000)))
  }

  // Every family must have FINISHED its first render before the baseline census, or a slow engine
  // reads as "never rendered" and the drop check below compares against a bogus zero. graphviz is the
  // straggler (Viz.js WASM cold start, deliberately excluded from the offscreen path) and misses a
  // fixed wait under full-suite load. Poll instead of sleeping longer.
  await expect
    .poll(
      async () => {
        const c = await census()
        return LANGS.filter((l) => c.out[l].svgs + c.out[l].canvases === 0)
      },
      { timeout: 120_000, intervals: [1000, 2000, 3000] },
    )
    .toEqual([])

  await setTheme('Default Dark Modern')
  const dark = await census()
  await setTheme('Default Light Modern')
  const light = await census()
  // eslint-disable-next-line no-console
  console.log(
    `[retheme] darkColourLen=${dark.colourLen} lightColourLen=${light.colourLen} digestsDiffer=${dark.colourDigest !== light.colourDigest}`,
  )
  // eslint-disable-next-line no-console
  console.log(
    `[retheme] per-lang dark→light:\n` +
      LANGS.map(
        (l) =>
          `   ${l}: els ${dark.out[l].els}→${light.out[l].els}` +
          ` svgs ${dark.out[l].svgs}→${light.out[l].svgs}` +
          ` canv ${dark.out[l].canvases}→${light.out[l].canvases}`,
      ).join('\n'),
  )

  // (a0) Every family still HAS a render after the flip. The pre-flip poll above guarantees all 14
  // drew to begin with, so this is a real drop check — and it closes the hole that let the stability
  // assertion below pass VACUOUSLY: for an engine that rendered nothing at all, 0 svgs before == 0
  // svgs after reads as "stable". That hole hid a real bug — the flip destroyed the abc score (its
  // source was lost, so the re-render drew an empty one, task 361) and the spec still went green
  // whenever abc had already been destroyed before the baseline census, which is what made the
  // failure look like order-dependent flake.
  for (const lang of LANGS) {
    const drew = (c: { svgs: number; canvases: number }) => c.svgs + c.canvases
    expect(
      drew(light.out[lang]),
      `${lang} lost its render in the flip`,
    ).toBeGreaterThan(0)
  }

  // (a) Every family rendered, and its render count is IDENTICAL across the flip — no engine
  // grew a duplicate or lost its render when the theme changed (the task-189 corruption class).
  for (const lang of LANGS) {
    expect(dark.out[lang].els, `${lang} present`).toBeGreaterThan(0)
    expect(light.out[lang].els, `${lang} els stable`).toBe(dark.out[lang].els)
    expect(light.out[lang].svgs, `${lang} svgs stable`).toBe(
      dark.out[lang].svgs,
    )
    expect(light.out[lang].canvases, `${lang} canvases stable`).toBe(
      dark.out[lang].canvases,
    )
  }
  // (b) The flip actually re-coloured something (the fill/stroke digest changed).
  expect(
    dark.colourDigest !== light.colourDigest,
    'theme flip must re-colour the diagrams',
  ).toBe(true)
})
