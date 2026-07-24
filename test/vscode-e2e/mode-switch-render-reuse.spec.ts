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
// block's innerHTML, byte for byte. Genuine reuse produces identical strings including generated
// ids — so if this ever needs id normalisation to pass, the reuse stopped happening.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

// The reusable-SVG custom engines (CACHEABLE_LANGS in render-cache-client) present in the fixture.
const LANGS = ['d2', 'wavedrom', 'nomnoml', 'vega-lite']

// Per lang, the rendered blocks in each pane: their markup + the width the engine settled on.
const SNAP = `((langs) => {
  const v = window.vditor
  const irEl = v.vditor[v.getCurrentMode()].element
  const pvEl = v.vditor.preview.previewElement
  const grab = (root) => {
    const out = {}
    for (const lang of langs) {
      out[lang] = Array.from(root ? root.querySelectorAll('div.language-' + lang + ', code.language-' + lang) : [])
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
      if (blk.html !== b[i].html) {
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
