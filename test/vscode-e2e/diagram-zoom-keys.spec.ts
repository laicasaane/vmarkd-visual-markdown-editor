// Task 459 — keyboard `+`/`-`/`0` zoom parity, real VS Code only (the Ctrl-to-interact gate this
// builds on — diagram-zoom-gate.ts — only reproduces in the real webview's native event path, see
// diagram-zoom.spec.ts). Covers all THREE code paths task 459 shipped:
//   - static SVG (mermaid, …): diagram-zoom.ts's OWN transform (`zoomBy`/`reset`), reached via
//     Ctrl+mousedown focus then a plain keydown.
//   - markmap (a "gated" engine with a retained instance): diagram-zoom-keys-gated.ts calls the
//     Markmap instance's own `rescale()`/`fit()` — never a parallel CSS transform.
//   - geojson (Leaflet, also "gated"): diagram-zoom-keys-gated.ts calls the stashed Leaflet map's
//     own `zoomIn()`/`zoomOut()`/`setView()`.
// (Mindmap/ECharts — the fourth gated engine — has NO retained instance; task 459 documents that
// gap rather than shipping an unverified fix. Not covered by this spec; see the task file.)
//
// Fixture note: the geojson block in the fixture is a ~10°-square Polygon, not a lone Point. A lone
// Point has a zero-area bounding box, and Leaflet's fitBounds() on a zero-area box with no maxZoom
// configured computes an unbounded (Infinity) zoom level — a real, separate latent bug (see task 459)
// that would otherwise mask the keyboard-zoom assertions below under a degenerate map state, not the
// behaviour this spec exists to check.
//
// Also asserts `getValue()` is unchanged across every key press — the wrapper sits INSIDE the
// contenteditable editor even though its content isn't editable itself, so a keydown that isn't
// correctly intercepted would type the character into the document instead of zooming.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'diagram-zoom-keys.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('+/-/0 zoom the focused diagram wrapper (static SVG, markmap, geojson) — getValue() unchanged', async ({
  workbox,
  evaluateInVSCode,
}) => {
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

  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('.language-mermaid svg')
    .first()
    .waitFor({ timeout: 60_000 })
  await frame
    .locator('.language-markmap svg')
    .first()
    .waitFor({ timeout: 30_000 })
  await frame
    .locator('.language-geojson .leaflet-container')
    .first()
    .waitFor({ timeout: 30_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 2500)))

  const before = await frame
    .locator('body')
    .evaluate(() =>
      (
        window as unknown as { vditor: { getValue: () => string } }
      ).vditor.getValue(),
    )

  const result = await frame.locator('body').evaluate(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const key = (target: Element, k: string) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: k,
          bubbles: true,
          cancelable: true,
        }),
      )
    const ctrlMousedown = (target: Element) =>
      target.dispatchEvent(
        new MouseEvent('mousedown', {
          button: 0,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )

    // ── static SVG (mermaid) — diagram-zoom.ts's own transform ────────────────────────────
    const merWrap = document.querySelector(
      '.language-mermaid[data-vmarkd-zoom="1"]',
    ) as HTMLElement
    const merSvg = merWrap?.querySelector('svg') as SVGElement
    // Ctrl+mousedown focuses the wrapper (diagram-zoom.ts's pointerdown handler) — use the REAL
    // pointerdown event, not a bare .focus(), so this proves the actual entry gesture works.
    merWrap?.dispatchEvent(
      new PointerEvent('pointerdown', {
        button: 0,
        ctrlKey: true,
        bubbles: true,
      }),
    )
    const merFocusedAfterCtrlMousedown = document.activeElement === merWrap
    key(merWrap, '+')
    const merScaleAfterPlus = merSvg?.style.transform || ''
    key(merWrap, '-')
    key(merWrap, '-')
    const merScaleAfterMinus = merSvg?.style.transform || ''
    key(merWrap, '0')
    const merScaleAfterReset = merSvg?.style.transform || ''

    // ── markmap — diagram-zoom-keys-gated.ts calls the retained instance's rescale()/fit() ─
    const mmSvg = document.querySelector('.language-markmap svg') as SVGElement
    const mmWrap = mmSvg?.closest('.language-markmap') as HTMLElement
    const mmG = mmSvg?.querySelector('g')
    ctrlMousedown(mmSvg)
    const mmFocused = document.activeElement === mmWrap
    const mmTransformBefore = mmG?.getAttribute('transform') || ''
    key(mmWrap, '+')
    await wait(400) // rescale() is a d3 transition; short but real
    const mmTransformAfterPlus = mmG?.getAttribute('transform') || ''
    key(mmWrap, '0')
    await wait(400)
    const mmTransformAfterReset = mmG?.getAttribute('transform') || ''

    // ── geojson (Leaflet) — diagram-zoom-keys-gated.ts calls the stashed map's own API ─────
    const geoContainer = document.querySelector(
      '.language-geojson .leaflet-container',
    ) as HTMLElement
    const geoWrap = geoContainer?.closest(
      '.language-geojson',
    ) as HTMLElement & {
      __vmarkdMap?: { getZoom: () => number }
    }
    const geoDiag = {
      hasContainer: !!geoContainer,
      hasWrap: !!geoWrap,
      dataProcessed: geoWrap?.getAttribute('data-processed'),
      hasStash: geoWrap ? '__vmarkdMap' in geoWrap : null,
      inPreviewPane: !!geoWrap?.closest(
        '.vditor-ir__preview, .vditor-wysiwyg__preview, .vditor-preview',
      ),
    }
    ctrlMousedown(geoContainer)
    const geoFocused = document.activeElement === geoWrap
    // Leaflet's zoomIn()/zoomOut() schedule the actual `_zoom` update via requestAnimationFrame
    // (Leaflet's own `_tryAnimatedZoom` → rAF → `_animateZoom` → `_move`, which is where `this._zoom`
    // is actually reassigned) rather than synchronously — the 250ms that follows is only the CSS
    // transition's VISUAL catch-up, not a precondition for getZoom() to report the new value. Reading
    // getZoom() in the same tick as the keypress races that rAF and reads the stale value (measured:
    // "AfterPlus" came back identical to "Before" without this wait). Poll instead of a fixed sleep —
    // bounded, and settles the moment the rAF has actually run rather than guessing a duration.
    const settleZoom = async (prev: number | undefined) => {
      const deadline = Date.now() + 1000
      let z = geoWrap?.__vmarkdMap?.getZoom()
      while (Date.now() < deadline && z === prev) {
        await wait(20)
        z = geoWrap?.__vmarkdMap?.getZoom()
      }
      return z
    }
    const geoZoomBefore = geoWrap?.__vmarkdMap?.getZoom()
    key(geoWrap, '+')
    const geoZoomAfterPlus = await settleZoom(geoZoomBefore)
    key(geoWrap, '-')
    const geoZoomAfterFirstMinus = await settleZoom(geoZoomAfterPlus)
    key(geoWrap, '-')
    const geoZoomAfterMinus = await settleZoom(geoZoomAfterFirstMinus)
    key(geoWrap, '0')
    const geoZoomAfterReset = await settleZoom(geoZoomAfterMinus)

    return {
      merFocusedAfterCtrlMousedown,
      merScaleAfterPlus,
      merScaleAfterMinus,
      merScaleAfterReset,
      mmFocused,
      mmTransformBefore,
      mmTransformAfterPlus,
      mmTransformAfterReset,
      geoDiag,
      geoFocused,
      geoZoomBefore,
      geoZoomAfterPlus,
      geoZoomAfterMinus,
      geoZoomAfterReset,
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[diagram-zoom-keys] ${JSON.stringify(result, null, 2)}`)

  const after = await frame
    .locator('body')
    .evaluate(() =>
      (
        window as unknown as { vditor: { getValue: () => string } }
      ).vditor.getValue(),
    )

  // static SVG. The browser canonicalizes the inline style's numeric formatting on readback (e.g.
  // "scale(1.1200)" as WRITTEN comes back as "scale(1.12)"), so match on the number, not the string.
  expect(result.merFocusedAfterCtrlMousedown).toBe(true)
  expect(result.merScaleAfterPlus).toMatch(/scale\(1\.12\)/)
  expect(result.merScaleAfterMinus).not.toMatch(/scale\(1\.12\)/)
  expect(result.merScaleAfterReset).toMatch(/scale\(1\)/)

  // markmap
  expect(result.mmFocused).toBe(true)
  expect(result.mmTransformAfterPlus).not.toBe(result.mmTransformBefore) // rescale() moved it
  expect(result.mmTransformAfterReset).not.toBe(result.mmTransformAfterPlus) // fit() moved it again

  // geojson
  expect(result.geoFocused).toBe(true)
  expect(result.geoZoomAfterPlus).toBeGreaterThan(
    result.geoZoomBefore as number,
  )
  expect(result.geoZoomAfterMinus).toBeLessThan(
    result.geoZoomAfterPlus as number,
  )
  expect(result.geoZoomAfterReset).toBe(result.geoZoomBefore) // setView() restored the stashed view

  // No keypress typed a stray character into the document.
  expect(after).toBe(before)
})
