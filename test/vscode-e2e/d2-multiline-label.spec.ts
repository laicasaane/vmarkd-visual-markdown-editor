import path from 'node:path'
// Task 493, in the REAL webview: the d2 compiler keeps a real newline inside a label and d2 itself
// draws one row per line, but SVG <text> does not break on \n — so a 2-line label used to be drawn as
// ONE run, wider than the box canvasMeasure had already sized for the widest line, spilling out of
// the shape. The payoff assertion here is geometric and only meaningful in a real renderer: measure
// each label's laid-out bbox and require a shape box to CONTAIN it. A unit test can count <tspan>s;
// only a browser can say the text fits.
import { expect, test } from 'vscode-test-playwright'
import { wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'd2-multiline-label.md')

test('a D2 label carrying \\n renders one row per line, inside its shape', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)
  // Pin the DEFAULT engine explicitly — the setting is Global and persists in the test profile, so a
  // sibling spec that pinned dagre would otherwise decide which engine this one measures.
  await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
    await vscode.workspace
      .getConfiguration('vmarkd')
      .update('diagram.d2.layout', 'vmarkd', vscode.ConfigurationTarget.Global)
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
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  // IR is dual-node: the editable SOURCE <code class="language-d2"> also carries the class and comes
  // first in the document — scan for the wrapper that actually holds the render.
  await expect
    .poll(
      async () =>
        frame.locator('body').evaluate(() => {
          const w = [...document.querySelectorAll('.language-d2')].find(
            (n) => n.querySelector('svg') || n.hasAttribute('data-d2-error'),
          )
          return {
            hasSvg: !!w?.querySelector('svg'),
            err: w?.getAttribute('data-d2-error') ?? null,
          }
        }),
      { timeout: 60_000, intervals: [1000, 2000, 3000] },
    )
    .toMatchObject({ hasSvg: true, err: null })

  const shot = await frame.locator('body').evaluate(() => {
    const wrap = [...document.querySelectorAll('.language-d2')].find((n) =>
      n.querySelector('svg'),
    )!
    const svg = wrap.querySelector('svg')!
    const texts = [...svg.querySelectorAll('text')]
    const rows = (t: SVGTextElement) => [...t.querySelectorAll('tspan')]
    // Laid-out boxes of everything that can BE a shape outline (the label has to sit in one of them).
    const boxes = [...svg.querySelectorAll('rect, ellipse, path, polygon')].map(
      (n) => (n as SVGGraphicsElement).getBBox(),
    )
    // 2px slack: stroke width + sub-pixel text metrics, nothing near a spilling label's overhang.
    const fits = (b: SVGRect) =>
      boxes.some(
        (r) =>
          b.x >= r.x - 2 &&
          b.y >= r.y - 2 &&
          b.x + b.width <= r.x + r.width + 2 &&
          b.y + b.height <= r.y + r.height + 2,
      )
    // Everything the assertions need about the label whose FIRST row reads `first`.
    const label = (first: string) => {
      const t = texts.find((x) => rows(x)[0]?.textContent === first)
      if (!t) return { rows: null, fits: false, gap: 0 }
      const rs = rows(t)
      const y = (i: number) => Number(rs[i]?.getAttribute('y') || 0)
      return {
        rows: rs.map((s) => s.textContent || ''),
        fits: fits(t.getBBox()),
        gap: y(1) - y(0),
      }
    }
    return {
      // The pre-493 signature: the raw \n still sitting in a single text run (SVG renders it as a
      // space, so the label reads as one over-wide line). After the fix each line is its own tspan.
      joined: texts
        .map((t) => t.textContent || '')
        .filter((s) => s.includes('\n')),
      mb: label('Dedicated mailbox'),
      m2: label('Module 2 \u2014 message decomposition'),
      edge: label('needs_info'),
      header: label('Module 1 \u2014 mailbox ingest'),
    }
  })

  expect(shot.joined, 'no label left as a single run').toEqual([])
  expect(shot.mb.rows).toEqual(['Dedicated mailbox', 'Exchange Online'])
  expect(shot.m2.rows).toEqual([
    'Module 2 \u2014 message decomposition',
    'decompose, identify, pseudonymise, segment',
  ])
  expect(shot.edge.rows).toEqual(['needs_info', 'ask_bradbury', 'nothing_new'])
  expect(shot.header.rows).toEqual([
    'Module 1 \u2014 mailbox ingest',
    'fetch, deduplicate, queue',
  ])
  // The real point: each block of rows fits INSIDE a drawn shape (this is what regressed).
  expect(shot.mb.fits, 'cylinder label inside the cylinder').toBe(true)
  expect(shot.m2.fits, 'the widest 2-line label inside its box').toBe(true)
  expect(shot.header.fits, 'container header inside the container').toBe(true)
  // The 3-row edge label is drawn beside the line, not in a box — assert its row spacing instead:
  // the 14px edge font at the 1.25 factor canvasMeasure sizes with.
  expect(shot.edge.gap).toBeCloseTo(17.5, 1)
})
