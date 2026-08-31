import { expect, test } from './coverage-fixture'

test('unified controls route zoom, Pan, and Reset through each viewport authority', async ({
  page,
}) => {
  await page.goto('/diagram-controls.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  const state = () => page.evaluate(() => (window as any).__controlsState())
  await expect.poll(state).toMatchObject({
    bars: { d2: 1, markmap: 1, mindmap: 1, geojson: 1, plantuml: 0 },
    labels: ['Pan diagram', 'Zoom out', 'Zoom in', 'Reset view'],
    controlBg: 'rgb(31, 36, 48)',
    focusOutline: 'solid',
    source: 'unchanged markdown',
  })

  await page.evaluate(() => {
    ;(window as any).__clickControl('d2', 'Zoom in')
    ;(window as any).__drag('d2', false)
  })
  expect((await state()).d2Transform).toMatch(/scale\(1\.12(?:00)?\)/)
  const plainStatic = (await state()).d2Transform
  await page.evaluate(() => {
    ;(window as any).__clickControl('d2', 'Pan diagram')
    ;(window as any).__drag('d2', false)
  })
  expect((await state()).d2Transform).not.toBe(plainStatic)
  await page.evaluate(() => (window as any).__clickControl('d2', 'Reset view'))
  await expect.poll(state).toMatchObject({
    d2Transform: expect.stringMatching(/scale\(1(?:\.0+)?\)/),
    pan: { d2: 'true' },
  })

  for (const lang of ['markmap', 'mindmap', 'geojson']) {
    await page.evaluate(
      ({ engine }) => {
        ;(window as any).__drag(engine, false)
        ;(window as any).__clickControl(engine, 'Pan diagram')
        ;(window as any).__drag(engine, false)
        ;(window as any).__clickControl(engine, 'Zoom in')
        ;(window as any).__clickControl(engine, 'Reset view')
      },
      { engine: lang },
    )
  }
  await expect.poll(state).toMatchObject({
    markPan: 1,
    markFit: 1,
    markScale: 1,
    mindPan: 1,
    mindReset: 1,
    geoPan: 1,
    geoZoom: 3,
    pan: { markmap: 'true', mindmap: 'true', geojson: 'true' },
    source: 'unchanged markdown',
  })
})
