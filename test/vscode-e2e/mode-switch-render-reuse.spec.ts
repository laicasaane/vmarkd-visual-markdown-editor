// NET (task 365) — a diagram must look the SAME in IR and in the full Preview pane.
//
// It did not. The render cache's reserve+request is a ONE-SHOT at open, and the full Preview pane
// does not exist yet at that point, so every cacheable block it later builds bypassed the cache
// entirely (measured: `data-vmarkd-cache-reserve` and `-hit` both null on all 12 Preview d2 blocks)
// and was laid out a SECOND time by the engine. Two independent text measurements disagreed on 3 of
// the 12 — widths 375→342, 247→197, 863→851 — which the user saw as "diagrams shift left, labels
// have no background so the line underneath shows through, boxes get a horizontal scrollbar".
//
// The assertion that actually pins this is NOT "a cache-hit attribute is present" (a hit that
// painted a re-sized SVG would still be the bug). It is pane-to-pane output IDENTITY: the same
// block's innerHTML, byte for byte — modulo the per-paint id namespace, which task 373 made
// DELIBERATELY different between panes (duplicate ids sent url(#…) into the hidden pane and killed
// mermaid/flowchart arrowheads). Everything else must still match exactly.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

// The reusable-SVG CUSTOM engines (CACHEABLE_LANGS in render-cache-client) present in the fixture,
// plus the Vditor-NATIVE ones the reuse map also covers in the full Preview pane. The natives
// diverged the same way d2 did — abc came out 451.99x98.83 in IR and 420.02x87.83 in Preview.
// NOT graphviz: reserving it would make Viz.js double-invoke and hang the webview (task 184), so it
// still renders fresh per pane. NOT markmap/echarts/mindmap either — a live d3 instance and two
// canvases, none of them a reusable static SVG.
const LANGS = [
  'd2',
  'wavedrom',
  'nomnoml',
  'vega-lite',
  'mermaid',
  'abc',
  'flowchart',
  'plantuml',
]

// Per lang, the rendered blocks in each pane: their markup + the width the engine settled on.
const SNAP = `((langs) => {
  const v = window.vditor
  const irEl = v.vditor[v.getCurrentMode()].element
  const pvEl = v.vditor.preview.previewElement
  const grab = (root) => {
    const out = {}
    for (const lang of langs) {
      out[lang] = Array.from(root ? root.querySelectorAll('.language-' + lang) : [])
        .filter((el) => !el.closest('.vditor-ir__marker--pre, .vditor-wysiwyg__pre'))
        .filter((el) => el.querySelector('svg'))
        .map((el) => ({
          html: el.innerHTML,
          w: el.querySelector('svg').getAttribute('width'),
          hit: el.getAttribute('data-vmarkd-cache-hit'),
        }))
    }
    return out
  }
  return { ir: grab(irEl), pv: grab(pvEl) }
})(${JSON.stringify(LANGS)})`

const TO_PREVIEW = () => {
  const inst = (window as any).vditor
  const v = inst.vditor
  v.preview.element.style.display = 'block'
  v[inst.getCurrentMode()].element.parentElement.style.display = 'none'
  v.preview.render(v)
}

const TO_EDIT = () => {
  const inst = (window as any).vditor
  const v = inst.vditor
  v.preview.element.style.display = 'none'
  v[inst.getCurrentMode()].element.parentElement.style.display = 'block'
}

async function open(
  workbox: import('@playwright/test').Page,
  evaluateInVSCode: (fn: unknown, args?: unknown) => Promise<unknown>,
) {
  // Pin the content theme BEFORE opening: a sibling spec's leftover would change the theme key (and
  // a flip racing the first render blanks slow engines — task 363).
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
  // The engines must FINISH in IR — their output is the reference the Preview pane reuses.
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 12_000)))
  return frame
}

type Snap = Record<string, { html: string; w: string; hit: string | null }[]>

// Ids MUST differ between panes since task 373: a verbatim copy duplicated every id, and url(#…)
// resolves to the first match in document order — the hidden pane's copy — so mermaid/flowchart lost
// their arrowheads. Each paint namespaces its ids with `-vmN`; strip that before comparing, so this
// still asserts byte-identity of everything that is supposed to be identical.
const stripIdNs = (html: string) => html.replace(/-vm\d+(?=["')])/g, '')
function compare(ir: Snap, pv: Snap): { compared: number; diffs: string[] } {
  const diffs: string[] = []
  let compared = 0
  for (const lang of LANGS) {
    const a = ir[lang] ?? []
    const b = pv[lang] ?? []
    if (a.length !== b.length) {
      diffs.push(
        `${lang}: rendered ${a.length} in IR but ${b.length} in Preview`,
      )
      continue
    }
    a.forEach((blk, i) => {
      compared++
      if (stripIdNs(blk.html) !== stripIdNs(b[i].html)) {
        let at = 0
        while (at < blk.html.length && blk.html[at] === b[i].html[at]) at++
        diffs.push(
          `${lang}#${i}: markup differs (width ${blk.w} → ${b[i].w}, preview cache-hit=${b[i].hit}) at ${at}: ` +
            `IR …${blk.html.slice(Math.max(0, at - 60), at + 60)}… vs PV …${b[i].html.slice(Math.max(0, at - 60), at + 60)}…`,
        )
      }
    })
  }
  return { compared, diffs }
}

test('every cacheable diagram is byte-identical in IR and in Preview', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(240_000)
  const frame = await open(workbox, evaluateInVSCode)
  await frame.locator('body').evaluate(TO_PREVIEW)
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 15_000)))

  const { ir, pv } = (await frame.locator('body').evaluate(SNAP)) as {
    ir: Snap
    pv: Snap
  }
  const { compared, diffs } = compare(ir, pv)
  // Never let an empty fixture (or a pane that rendered nothing) pass as "everything matched" —
  // the vacuous-assertion trap that hid task 361 for a whole round.
  expect(
    compared,
    'no rendered diagram pairs were compared at all',
  ).toBeGreaterThan(10)
  expect(diffs, 'a diagram was laid out differently in the two panes').toEqual(
    [],
  )
})

test('the Preview pane REUSES the IR render instead of re-running the engine', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(240_000)
  const frame = await open(workbox, evaluateInVSCode)
  await frame.locator('body').evaluate(TO_PREVIEW)
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 15_000)))

  const { pv } = (await frame.locator('body').evaluate(SNAP)) as {
    ir: Snap
    pv: Snap
  }
  // Identity alone could in principle be reached by two engine runs agreeing; this pins the
  // MECHANISM, so a future change that silently drops back to re-rendering is caught even on a doc
  // where both runs happen to agree.
  const d2 = pv.d2 ?? []
  expect(
    d2.length,
    'no d2 blocks rendered in the Preview pane',
  ).toBeGreaterThan(5)
  expect(
    d2.filter((b) => b.hit !== '1').length,
    'a Preview d2 block was rendered by the engine rather than reused',
  ).toBe(0)
})

test('a round trip IR → Preview → IR → Preview stays identical', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(240_000)
  const frame = await open(workbox, evaluateInVSCode)
  for (let i = 0; i < 2; i++) {
    await frame.locator('body').evaluate(TO_PREVIEW)
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 10_000)))
    await frame.locator('body').evaluate(TO_EDIT)
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 2_000)))
  }
  await frame.locator('body').evaluate(TO_PREVIEW)
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 10_000)))

  const { ir, pv } = (await frame.locator('body').evaluate(SNAP)) as {
    ir: Snap
    pv: Snap
  }
  const { compared, diffs } = compare(ir, pv)
  expect(compared).toBeGreaterThan(10)
  expect(diffs, 'the panes drifted apart across repeated switching').toEqual([])
})

// Task 366 — graphviz is NOT reused (Viz.js would double-invoke and hang), so it renders fresh in
// each pane and its markup has to be compared rather than guaranteed. It differed: graphviz carries
// the DOT source's own comments into its SVG output (`<!-- A -->` per node), and the Preview pane's
// comment-reveal pass rewrote those into `<div class="vmarkd-comment">` — invalid inside an <svg>,
// and absent from the IR pane where that pass never runs.
test('a rendered diagram keeps its own SVG comments in Preview', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(240_000)
  const frame = await open(workbox, evaluateInVSCode)
  await frame.locator('body').evaluate(TO_PREVIEW)
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 15_000)))

  const got = await frame.locator('body').evaluate(`(() => {
    const pv = window.vditor.vditor.preview.previewElement
    const g = pv.querySelector('.language-graphviz svg')
    return {
      drawn: !!g,
      injected: g ? g.querySelectorAll('.vmarkd-comment').length : -1,
      // The authored comment OUTSIDE any diagram must still be shown — this fix is a skip, not a
      // disable. (It reads false until task 367 lands the masking that gets comments into this pane
      // at all; both now hold together.)
      authored: pv.innerHTML.includes('should be visible as muted text'),
    }
  })()`)
  expect(got).toEqual({ drawn: true, injected: 0, authored: true })
})

// The engines the reuse map does NOT cover — a live d3 instance (markmap), two canvases (echarts,
// mindmap), a Leaflet map (geojson) and a WebGL scene (stl), plus graphviz and smiles, which render
// fresh in each pane. Byte-identity is impossible for them, so assert the two things a reader would
// notice: it DREW in both panes, at the same intrinsic size, in the same colour.
//
// Colour is the reason this test exists. smiles paints from currentColor and came out
// rgb(215,186,125) in the full Preview against rgb(209,213,218) in IR — VS Code's injected default
// CSS colours a bare <code> with --vscode-textPreformat-foreground (#d7ba7d on dark), which IR
// escapes only because its <code> sits under a class we colour ourselves. Nothing in the harness
// injects that stylesheet, so this is only observable here.
const FRESH_LANGS = [
  'graphviz',
  'smiles',
  'markmap',
  'echarts',
  'mindmap',
  'geojson',
  'stl',
]

// Two separate reads: the IR pane is display:none once Preview is up, so its metrics must be taken
// BEFORE the switch (a rect read afterwards is all zeroes).
const READ = (paneExpr: string) => `((langs) => {
  const v = window.vditor
  const root = ${paneExpr}
  const out = {}
  for (const lang of langs) {
    out[lang] = Array.from(root ? root.querySelectorAll('.language-' + lang) : [])
      .filter((el) => !el.closest('.vditor-ir__marker--pre, .vditor-wysiwyg__pre'))
      .map((el) => {
        const svg = el.querySelector('svg')
        const cv = el.querySelector('canvas')
        const leaflet = el.querySelector('.leaflet-container')
        return {
          drawn: !!(svg || cv || leaflet),
          size: svg
            ? svg.getAttribute('width') + 'x' + svg.getAttribute('height')
            : cv
              ? cv.width + 'x' + cv.height
              : leaflet
                ? Math.round(leaflet.clientWidth) + 'x' + Math.round(leaflet.clientHeight)
                : null,
          color: getComputedStyle(el).color,
        }
      })
  }
  return out
})(${JSON.stringify(FRESH_LANGS)})`

test('engines that are NOT reused still draw the same in both panes', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(240_000)
  const frame = await open(workbox, evaluateInVSCode)
  const ir = (await frame
    .locator('body')
    .evaluate(READ('v.vditor[v.getCurrentMode()].element'))) as Record<
    string,
    { drawn: boolean; size: string; color: string }[]
  >

  await frame.locator('body').evaluate(TO_PREVIEW)
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 15_000)))
  const pv = (await frame
    .locator('body')
    .evaluate(READ('v.vditor.preview.previewElement'))) as typeof ir

  const problems: string[] = []
  let compared = 0
  for (const lang of FRESH_LANGS) {
    const a = (ir[lang] ?? []).filter((b) => b.drawn)
    const b = (pv[lang] ?? []).filter((b) => b.drawn)
    // An engine that drew in IR must draw in Preview too — "nothing equals nothing" must never pass.
    if (a.length !== b.length) {
      problems.push(
        `${lang}: drew ${a.length} in IR but ${b.length} in Preview`,
      )
      continue
    }
    a.forEach((blk, i) => {
      compared++
      if (blk.size !== b[i].size)
        problems.push(`${lang}#${i}: size ${blk.size} -> ${b[i].size}`)
      if (blk.color !== b[i].color)
        problems.push(`${lang}#${i}: colour ${blk.color} -> ${b[i].color}`)
    })
  }
  // stl needs WebGL and may legitimately draw nothing headless, so do not demand all 7 — but do
  // demand that most of them were actually measured, or this test proves nothing.
  expect(
    compared,
    'too few non-reused engines drew to compare',
  ).toBeGreaterThan(4)
  expect(problems, 'a non-reused engine differs between the panes').toEqual([])
})

// Task 367 — authored HTML comments must EXIST in the Preview pane. They did not: the preview render
// runs Lute with sanitize:true and Lute's sanitiser drops comments outright, so the text was absent
// from the DOM entirely (not merely invisible) while IR showed it — a whole block present in one pane
// and missing from the other. Fixed by rewriting block comments into a sanitiser-proof element BEFORE
// Lute sees them, rather than by switching sanitising off.
test('authored HTML comments appear in Preview, and only outside code fences', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(240_000)
  const frame = await open(workbox, evaluateInVSCode)
  await frame.locator('body').evaluate(TO_PREVIEW)
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 15_000)))

  const got = await frame.locator('body').evaluate(`(() => {
    const pv = window.vditor.vditor.preview.previewElement
    const marks = Array.from(pv.querySelectorAll('.vmarkd-comment'))
    return {
      count: marks.length,
      shown: pv.innerHTML.indexOf('should be visible as muted text') >= 0,
      // The masking runs on the markdown SOURCE, so the one thing that could go wrong silently is
      // eating a comment that lives inside a fence, where it is literal text the reader wants.
      insideFence: marks.filter((m) => m.closest('pre, code')).length,
      // It must not have leaked into the editable document either.
      inSource: window.vditor.getValue().indexOf('vmarkd-comment') >= 0,
    }
  })()`)
  expect(got).toEqual({
    count: 3,
    shown: true,
    insideFence: 0,
    inSource: false,
  })
})
