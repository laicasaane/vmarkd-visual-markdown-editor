// REGRESSION — a live content-theme change must recolour D2 even when the OPEN was served from the
// render cache. Real-VS-Code only.
//
// The user-reported gap: switching `vmarkd.theme.content` github-dark → vscode-dark-2026 left every
// D2 diagram in the old palette. Both themes are DARK, so this arrives as `config-changed` (the
// content theme moved, the editor's light/dark mode did NOT) — a different handler than the workbench
// flip `retheme-flip-matrix.spec.ts` covers.
//
// WHY THE OPEN MUST BE A CACHE HIT, and the mechanism (measured — this spec was flaky 4/6 before the
// fix). The poison is filed during the flip's own re-render, not at open: rethemeCacheFirst reserves
// each drawn D2 block and asks the host; on a MISS it appends a `vmarkd-cache-miss` comment to the
// wrapper to re-fire the observer, then the async engine (WASM, ~365 ms) redraws. In that window
// findBlocks has cleared the render-key stamp (defeating guard condition 1) AND the trigger comment
// changed the wrapper's innerHTML — so an innerHTML-based condition 2 read the STILL-STALE github-dark
// svg as "changed" and filed it under the new vscode key. The deferred lookup then served that poison
// straight back, and `data-processed` on the painted hit stopped any live re-render — the diagram
// froze on the old palette. This only reproduces when the open primed the cache with hits (freshStart
// wipes the store per test, so a first render is always a miss), which is why the spec renders once,
// closes, re-opens the SAME document to force real hits, THEN flips — the shape abc-flip-cache-hit.spec
// uses for the same reason. The fix: the guard compares SVG-only (render-cache-client `svgOnly`), so
// the trigger comment is invisible to it and the stale svg is correctly skipped.
//
// The two palettes are unambiguous in the markup: github-dark strokes grey #3d444d, vscode-dark-2026
// strokes its accent blue #48a0c7 (d2-render's d2Theme('auto', …)). The rendered strokes AND the
// live-compile counter are both asserted — a poisoned run repaints the same colours from cache without
// re-compiling, so the compile count is what a coincidental colour match cannot fake.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')
function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

// Every distinct stroke colour across all D2 SVGs — the palette fingerprint.
async function d2Strokes(frame: ReturnType<typeof wf>): Promise<string[]> {
  return frame.locator('body').evaluate(() => {
    const out = new Set<string>()
    for (const s of document.querySelectorAll('.language-d2 svg')) {
      for (const m of s.outerHTML.matchAll(/stroke="(#[0-9a-fA-F]{3,8})"/g))
        out.add(m[1].toLowerCase())
    }
    return [...out].sort()
  })
}

test('a cached-on-open D2 render still repaints on a live content-theme change', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(180_000)
  const openIt = () =>
    evaluateInVSCode(
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

  // Pin D2→content pairing and a concrete DARK content theme BEFORE opening, so both opens share the
  // SAME cache themeKey (→ the re-open is a genuine HIT) and the flip below moves only the content
  // fragment, not the editor's light/dark mode.
  await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
    const cfg = vscode.workspace.getConfiguration('vmarkd')
    await cfg.update('theme.d2', 'auto', true)
    await cfg.update('theme.content', 'github-dark', true)
  })

  // Pass 1 — a MISS (freshStart store): render live, then let the finished SVGs be PUT to the host.
  await openIt()
  let frame = wf(workbox)
  await frame.locator('.language-d2 svg').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 4000)))

  // Close + re-open the SAME file → the second open finds the render in the cache.
  await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
  })
  await openIt()
  frame = wf(workbox)
  await frame.locator('.language-d2 svg').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 3000)))

  // Confirm the re-open really took the cache-HIT branch — otherwise this degrades into a second MISS
  // (a live, stamped render) and proves nothing about the path the fix is about.
  const hits = await frame
    .locator('.language-d2[data-vmarkd-cache-hit]')
    .count()
  // eslint-disable-next-line no-console
  console.log(`[d2-flip] cache-hit d2 nodes=${hits}`)
  expect(
    hits,
    'the re-open must be served from the render cache',
  ).toBeGreaterThan(0)

  const before = await d2Strokes(frame)
  // eslint-disable-next-line no-console
  console.log(`[d2-flip] github-dark strokes: ${JSON.stringify(before)}`)
  expect(before).toContain('#3d444d') // github-dark's edge/stroke

  // The live content-theme change (config-changed, not a workbench flip).
  await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
    await vscode.workspace
      .getConfiguration('vmarkd')
      .update('theme.content', 'vscode-dark-2026', true)
  })
  // The re-theme is deferred 400 ms, the re-render is an async WASM compile, and the cache-first
  // lookup adds a host round-trip; a FAILURE here is "it never changed", so be generous.
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 8000)))
  const after = await d2Strokes(frame)
  // The live-render counter is the REAL assertion. The flake filed a stale github-dark SVG under the
  // vscode key (a cache poison), so the flip served it back instead of re-compiling: a poisoned run
  // shows compiles≈1, a healthy one re-runs every D2 block (~13 with the fixture's 12 blocks). Asserting
  // the palette alone would let a coincidental colour match pass, so pin the compile count too.
  const compiles = await frame
    .locator('body')
    .evaluate(() => (window as any).__vmarkdD2RenderStats?.compiles ?? -1)
  // eslint-disable-next-line no-console
  console.log(
    `[d2-flip] vscode-dark-2026 strokes: ${JSON.stringify(after)} compiles=${compiles}`,
  )

  expect(after, 'the palette actually moved').not.toEqual(before)
  expect(after, "vscode-dark-2026's accent stroke").toContain('#48a0c7')
  expect(after, "github-dark's stroke is gone").not.toContain('#3d444d')
  expect(
    compiles,
    'the flip re-compiled every D2 block (not served a poisoned cache entry)',
  ).toBeGreaterThan(11)

  await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
    const cfg = vscode.workspace.getConfiguration('vmarkd')
    await cfg.update('theme.d2', undefined, true)
    await cfg.update('theme.content', undefined, true)
  })
})
