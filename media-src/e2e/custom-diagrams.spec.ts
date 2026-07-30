import { test, expect } from './coverage-fixture'

// Task 101 — WaveDrom timing diagrams
// Task 103 — nomnoml UML diagrams
// Task 99  — GeoJSON / TopoJSON maps (Leaflet)

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/custom-diagrams.html')
  try {
    await page.waitForFunction(
      () => (window as any).__ready === true,
      undefined,
      { timeout: 30000 },
    )
  } catch {
    const html = await page.evaluate(() =>
      document.body.innerHTML.substring(0, 500),
    )
    throw new Error(
      `__ready never set. Errors: ${errors.join('; ')}. Body: ${html}`,
    )
  }
})

test('runtime re-init replaces lifecycle hooks and renders updated custom source', async ({
  page,
}) => {
  await page.waitForSelector('.language-wavedrom svg', { timeout: 30000 })

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      'div.language-wavedrom[data-code]',
    )
    if (!target) throw new Error('missing wavedrom runtime target')
    target.dataset.code = JSON.stringify({
      signal: [{ name: 'runtime404', wave: 'p....' }],
    })
    target.removeAttribute('data-processed')
    target.replaceChildren()
    ;(window as any).__runtimeReinit()
  })

  await page.waitForFunction(
    () =>
      document
        .querySelector('.language-wavedrom svg')
        ?.textContent?.includes('runtime404') === true,
    undefined,
    { timeout: 30000 },
  )
  expect(
    await page.evaluate(() => (window as any).__runtimeResizeBalance()),
  ).toBe(2)
})

// Render gate (task 150 item 1a): these were ALL `test.fixme` on a stale assumption that the
// WYSIWYG harness doesn't expose `.language-*` for unknown langs. Empirically it DOES — the observer
// renders into the block and the selectors resolve — so they're now real CI assertions that catch a
// renderer silently emitting no SVG/canvas (the gap this task exists to close). STL/D2 run too:
// Playwright's chromium has a (swiftshader) WebGL context + boots the D2 WASM, unlike the VS Code
// Electron host under xvfb — so the headless harness actually covers MORE than the real-VS-Code suite.
test('wavedrom renders an SVG from a timing diagram JSON', async ({ page }) => {
  await page.waitForSelector('.language-wavedrom svg', { timeout: 30000 })
  const info = await page.evaluate(() => {
    const svg = document.querySelector('.language-wavedrom svg')
    return {
      hasSignal: !!svg,
      width: svg?.getBoundingClientRect().width ?? 0,
      height: svg?.getBoundingClientRect().height ?? 0,
    }
  })
  expect(info.hasSignal).toBe(true)
  expect(info.width).toBeGreaterThan(50)
  expect(info.height).toBeGreaterThan(20)
})

test('nomnoml renders an SVG from a UML source', async ({ page }) => {
  await page.waitForSelector('.language-nomnoml svg', { timeout: 30000 })
  const info = await page.evaluate(() => {
    const svg = document.querySelector('.language-nomnoml svg')
    return {
      hasSvg: !!svg,
      width: svg?.getBoundingClientRect().width ?? 0,
      height: svg?.getBoundingClientRect().height ?? 0,
      hasText: !!svg?.querySelector('text'),
    }
  })
  expect(info.hasSvg).toBe(true)
  expect(info.width).toBeGreaterThan(50)
  expect(info.height).toBeGreaterThan(30)
  expect(info.hasText).toBe(true)
})

test('nomnoml SVG is themed via currentColor (no baked palette colors)', async ({
  page,
}) => {
  // nomnoml paints text by inheriting `fill` from a parent <g>, not on the <text> itself, so the old
  // `text.fill === 'currentColor'` check read "" and was wrong. Assert the real contract instead:
  // themeNomnomlSvg replaced EVERY baked palette colour with currentColor (follows the theme fg).
  await page.waitForSelector('.language-nomnoml svg text', { timeout: 30000 })
  const info = await page.evaluate(() => {
    const svg = document.querySelector('.language-nomnoml svg')!
    const baked = ['#33322e', '#eee8d5', '#fdf6e3']
    const els = [...svg.querySelectorAll('*')]
    const norm = (v: string | null) => (v ?? '').trim().toLowerCase()
    return {
      hasBaked: els.some(
        (el) =>
          baked.includes(norm(el.getAttribute('fill'))) ||
          baked.includes(norm(el.getAttribute('stroke'))),
      ),
      hasCurrentColor: els.some(
        (el) =>
          el.getAttribute('fill') === 'currentColor' ||
          el.getAttribute('stroke') === 'currentColor',
      ),
      textCount: svg.querySelectorAll('text').length,
    }
  })
  expect(info.hasBaked).toBe(false) // every baked nomnoml palette colour recoloured
  expect(info.hasCurrentColor).toBe(true) // → currentColor, so it follows the theme foreground
  expect(info.textCount).toBeGreaterThan(0)
})

// --- GeoJSON (Leaflet) ---

test('geojson renders an interactive Leaflet map', async ({ page }) => {
  await page.waitForSelector('.language-geojson .leaflet-container', {
    timeout: 30000,
  })
  const info = await page.evaluate(() => {
    const container = document.querySelector(
      '.language-geojson .leaflet-container',
    )
    return {
      hasMap: !!container,
      width: container?.getBoundingClientRect().width ?? 0,
      height: container?.getBoundingClientRect().height ?? 0,
      pathCount: container?.querySelectorAll('path').length ?? 0,
    }
  })
  expect(info.hasMap).toBe(true)
  expect(info.width).toBeGreaterThan(100)
  expect(info.height).toBeGreaterThanOrEqual(280)
  expect(info.pathCount).toBeGreaterThan(0)
})

test('geojson map makes no remote tile requests (offline)', async ({
  page,
}) => {
  const remoteRequests: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.startsWith('http') && url.includes('tile')) {
      remoteRequests.push(url)
    }
  })

  await page.waitForFunction(
    () =>
      !!(window as any)
        .__el()
        ?.querySelector('.language-geojson[data-processed="true"]'),
    undefined,
    { timeout: 20000 },
  )

  expect(remoteRequests).toHaveLength(0)
})

// --- TopoJSON ---

test('topojson converts and renders a Leaflet map', async ({ page }) => {
  await page.waitForSelector('.language-topojson .leaflet-container', {
    timeout: 30000,
  })
  const info = await page.evaluate(() => {
    const container = document.querySelector(
      '.language-topojson .leaflet-container',
    )
    return {
      hasMap: !!container,
      pathCount: container?.querySelectorAll('path').length ?? 0,
    }
  })
  expect(info.hasMap).toBe(true)
  expect(info.pathCount).toBeGreaterThan(0)
})

// --- STL 3D (three.js) ---

test('stl renders a WebGL canvas from ASCII STL', async ({ page }) => {
  await page.waitForSelector('.language-stl canvas', { timeout: 30000 })
  const info = await page.evaluate(() => {
    const canvas = document.querySelector(
      '.language-stl canvas',
    ) as HTMLCanvasElement | null
    return {
      hasCanvas: !!canvas,
      width: canvas?.getBoundingClientRect().width ?? 0,
      height: canvas?.getBoundingClientRect().height ?? 0,
      hasWebGL: !!canvas?.getContext('webgl2') || !!canvas?.getContext('webgl'),
    }
  })
  expect(info.hasCanvas).toBe(true)
  expect(info.width).toBeGreaterThan(100)
  expect(info.height).toBeGreaterThanOrEqual(280)
})

test('stl canvas makes no remote requests (offline)', async ({ page }) => {
  const remoteRequests: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.startsWith('http') && !url.startsWith('http://localhost'))
      remoteRequests.push(url)
  })

  await page.waitForSelector('.language-stl[data-processed="true"]', {
    timeout: 30000,
  })
  expect(remoteRequests).toHaveLength(0)
})

// Task 104 — D2 (compile-only WASM + dagre + currentColor SVG). The D2 WASM boots in Playwright's
// chromium, so this now asserts the real render here (in addition to the WASM contract / renderer unit
// tests d2-wasm.test.ts + d2-render.test.ts, and the real-VS-Code suite custom-diagrams-render.spec.ts).
test('d2 renders a themed SVG from a compile-only WASM graph', async ({
  page,
}) => {
  await page.waitForSelector('.language-d2 svg', { timeout: 30000 })
  const info = await page.evaluate(() => {
    const svg = document.querySelector('.language-d2 svg')
    return {
      hasSvg: !!svg,
      rects: svg?.querySelectorAll('rect').length ?? 0,
      stroke: svg?.querySelector('rect')?.getAttribute('stroke') ?? '',
    }
  })
  expect(info.hasSvg).toBe(true)
  expect(info.rects).toBeGreaterThan(0)
  expect(info.stroke).toBe('currentColor')
})

// Task 102 — Vega / Vega-Lite layout. Unlike the other custom languages above, the harness WYSIWYG
// DOM DOES expose `.language-vega-lite` + its rendered SVG, so the layout (centring + shrink-to-fit)
// is asserted LIVE here — vega was originally omitted from the diagram-centring CSS, so this guards
// the regression. The SVG must carry a viewBox for `max-width:100%` to scale it WITHOUT distorting.
test('vega-lite chart renders centered with a scalable (viewBox) SVG', async ({
  page,
}) => {
  await page.waitForSelector('.language-vega-lite[data-processed] svg', {
    timeout: 30000,
  })
  const info = await page.evaluate(() => {
    const svg = document.querySelector(
      '.language-vega-lite[data-processed] svg',
    )
    const block = svg?.closest('.language-vega-lite')
    const embed = svg?.closest('.vega-embed')
    return {
      hasSvg: !!svg,
      hasViewBox: !!svg?.getAttribute('viewBox'),
      blockTextAlign: block ? getComputedStyle(block).textAlign : '',
      embedDisplay: embed ? getComputedStyle(embed).display : '',
      svgMaxWidth: svg ? getComputedStyle(svg).maxWidth : '',
    }
  })
  expect(info.hasSvg).toBe(true)
  expect(info.hasViewBox).toBe(true) // required so max-width scaling keeps aspect (no distortion)
  expect(info.blockTextAlign).toBe('center') // centring rule applied
  expect(info.embedDisplay).toBe('inline-block') // so text-align actually centres .vega-embed
  expect(info.svgMaxWidth).not.toBe('none') // shrink-to-fit rule applied (default would be 'none')
})

// Task 397 — "smiles zrob ogolnie mniejsze tak 4/3 ztego co teraz": the molecule dwarfed the
// surrounding prose. Measured directly (real VS Code, task 397 investigation): smiles-drawer's
// constructor `width`/`height` option has NO effect on the rendered size in how this codebase
// calls it — we hand `.draw()` an EXISTING `<svg id>` via a selector string, so the library's
// own auto-create-a-new-svg branch (the only place it sets a `width`/`height` ATTRIBUTE) never
// runs; an SVG with a viewBox and no width/height attribute stretches to 100% of its CSS box,
// clamped by `max-width` — CSS is the ONLY lever on the on-screen footprint. `bondLength` was
// tested too: it changes the internal viewBox (drawing detail/padding ratio) but NOT the
// rendered box size, for the same reason. The actual, verified fix is CSS: the prior
// "smiles mniejszy ~70%" request already shrank it to `max-width: 56%` of the column; 3/4 of
// that is 42%. This test constructs a MINIMAL synthetic DOM (no smiles-drawer engine involved)
// because the ratio is pure CSS — the engine's own behaviour is irrelevant to this assertion.
test('smiles molecules render at 3/4 of the prior column-fit size (task 397)', async ({
  page,
}) => {
  await page.goto('/')
  const ratio = await page.evaluate(() => {
    const pane = document.createElement('div')
    pane.className = 'vditor-ir__preview'
    pane.style.cssText = 'position:absolute;width:600px'
    pane.innerHTML =
      '<code class="language-smiles"><svg viewBox="0 0 100 100"></svg></code>'
    document.body.appendChild(pane)
    const svg = pane.querySelector('svg') as SVGSVGElement
    const r =
      svg.getBoundingClientRect().width / pane.getBoundingClientRect().width
    pane.remove()
    return r
  })
  // 56% (the prior "smiles mniejszy ~70%" cap) * 0.75 = 42%.
  expect(ratio).toBeCloseTo(0.42, 2)
})
