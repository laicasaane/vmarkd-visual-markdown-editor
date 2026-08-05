import path from 'node:path'
// Task 494, in the REAL webview: two edges' parallel runs were left ~11 px apart (measured on the
// reported document) and read as one thick line. `spreadCloseRuns` pushes them back to the 24 px lane
// ELK itself reserves — but `toSVG` runs `simplifyRoute` + `straightenEnds` AGAIN at draw time, and
// those only reject a straightening that CROSSES something. So the unit tests prove the pass fires;
// only a measurement on the RENDERED SVG proves the spread survives to the screen.
import { expect, test } from 'vscode-test-playwright'
import { wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'd2-parallel-lane.md')
// The measured value before the fix was 10.9 px and after it 23.8 (a 24 px lane, minus sampling error);
// 20 sits clear of both, so the assertion cannot flip on rounding.
const MIN_GAP = 20

// A straight, axis-aligned stretch of one connection: its constant coordinate plus its extent.
type Run = { path: number; vert: boolean; c: number; lo: number; hi: number }
const MINRUN = 60 // only stretches long enough to READ as parallel
// Identity of the straight run a sampled step belongs to; null on a corner arc, which ends the run.
const runKey = (a: number[], b: number[]) =>
  Math.abs(a[0] - b[0]) < 0.4
    ? `v${a[0].toFixed(1)}`
    : Math.abs(a[1] - b[1]) < 0.4
      ? `h${a[1].toFixed(1)}`
      : null
// Sampled points of one path → its long straight runs. The page hands back raw samples (it has to, only
// the browser can walk an SVG path); the analysis stays here, in ordinary testable code.
function runsOf(pts: number[][], path: number): Run[] {
  const out: Run[] = []
  let key: string | null = null
  let from = 0
  const close = (to: number) => {
    if (!key) return
    const vert = key[0] === 'v'
    const k = vert ? 1 : 0
    const lo = Math.min(pts[from][k], pts[to][k])
    const hi = Math.max(pts[from][k], pts[to][k])
    if (hi - lo > MINRUN)
      out.push({ path, vert, c: pts[from][vert ? 0 : 1], lo, hi })
    key = null
  }
  for (let i = 1; i < pts.length; i++) {
    const k = runKey(pts[i - 1], pts[i])
    if (k === key) continue
    close(i - 1)
    key = k
    from = i - 1
  }
  close(pts.length - 1)
  return out
}
const overlap = (a: Run, b: Run) => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo)
// The closest pair of parallel runs belonging to DIFFERENT connections.
function closestPair(runs: Run[]): { gap: number; a: Run; b: Run } | null {
  let worst: { gap: number; a: Run; b: Run } | null = null
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i]
      const b = runs[j]
      if (a.path === b.path || a.vert !== b.vert) continue
      if (overlap(a, b) < MINRUN) continue
      const gap = Math.abs(a.c - b.c)
      if (!worst || gap < worst.gap) worst = { gap, a, b }
    }
  return worst
}

test('two D2 edges never end up running parallel inside a lane', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)
  // Pin the DEFAULT engine — the setting is Global and persists in the test profile, so a sibling spec
  // that pinned dagre would otherwise decide which engine this one measures.
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
  // IR is dual-node: the editable SOURCE <code class="language-d2"> carries the class too and comes
  // first — scan for the wrapper that actually holds the render.
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

  // The page can only hand back GEOMETRY: sample every connection path (2px steps) rather than parsing
  // its `d` — the routes carry rounded (Q) corners, so a command-level parse silently misses the straight
  // run that FOLLOWS a corner (that mistake hid this very pair while the geometry was being diagnosed).
  const sampled: number[][][] = await frame.locator('body').evaluate(() => {
    const wrap = [...document.querySelectorAll('.language-d2')].find((n) =>
      n.querySelector('svg'),
    )!
    const svg = wrap.querySelector('svg')!
    return [...svg.querySelectorAll('path')].map((p) => {
      const len = p.getTotalLength()
      const pts: number[][] = []
      for (let l = 0; l <= len; l += 2) {
        const q = p.getPointAtLength(l)
        pts.push([Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10])
      }
      return pts
    })
  })

  const runs = sampled.flatMap((pts, i) =>
    pts.length < 10 ? [] : runsOf(pts, i),
  )
  const worst = closestPair(runs)
  const shot = {
    runs: runs.length,
    worstGap: worst ? Math.round(worst.gap * 10) / 10 : null,
    worstPair: worst
      ? `${worst.a.vert ? 'x' : 'y'}=${worst.a.c.toFixed(1)} / ${worst.b.c.toFixed(1)}`
      : null,
  }

  // A vacuous pass would be the real risk here, so pin that the diagram HAS long parallel runs to compare.
  expect(
    shot.runs,
    'the diagram has long axis-aligned runs to measure',
  ).toBeGreaterThan(10)
  expect(
    shot.worstGap,
    `closest parallel pair (${shot.worstPair}) must keep a lane`,
  ).toBeGreaterThanOrEqual(MIN_GAP)
})
