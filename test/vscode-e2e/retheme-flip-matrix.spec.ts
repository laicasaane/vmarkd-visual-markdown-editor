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

  await setTheme('Default Dark Modern')
  const dark = await census()
  await setTheme('Default Light Modern')
  const light = await census()
  // eslint-disable-next-line no-console
  console.log(
    `[retheme] darkColourLen=${dark.colourLen} lightColourLen=${light.colourLen} digestsDiffer=${dark.colourDigest !== light.colourDigest}`,
  )

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
