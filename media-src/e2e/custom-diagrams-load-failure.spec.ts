import { expect, test } from './coverage-fixture'

const LANGS = [
  'geojson',
  'topojson',
  'nomnoml',
  'stl',
  'wavedrom',
  'vega',
  'vega-lite',
] as const

const DEPENDENCY_SCRIPT =
  /\/dist\/js\/(?:leaflet\/leaflet\.js|topojson\/topojson-client\.min\.js|nomnoml\/nomnoml\.min\.js|threejs\/three-stl\.min\.js|wavedrom\/wavedrom\.min\.js|vega\/vega-embed\.min\.js)(?:\?|$)/

test('failed renderer script requests show terminal errors for every affected language', async ({
  page,
}) => {
  await page.route(DEPENDENCY_SCRIPT, (route) => route.abort('failed'))
  await page.goto('/custom-diagrams.html')
  await page.waitForFunction(
    () => (window as any).__ready === true,
    undefined,
    {
      timeout: 30_000,
    },
  )

  await expect
    .poll(
      async () =>
        page
          .locator(
            LANGS.map((lang) => `.language-${lang} .vmde-diagram-error`).join(
              ', ',
            ),
          )
          .count(),
      { timeout: 30_000 },
    )
    .toBe(LANGS.length)

  const state = await page.evaluate((langs) => {
    return langs.map((lang) => {
      const wrapper = Array.from(
        document.querySelectorAll<HTMLElement>(`.language-${lang}`),
      ).find((candidate) => candidate.querySelector('.vmde-diagram-error'))
      return {
        lang,
        hasError: !!wrapper?.querySelector('.vmde-diagram-error'),
        empty: !wrapper?.innerHTML.trim(),
        processed: wrapper?.getAttribute('data-processed'),
        title:
          wrapper?.querySelector('.vmde-diagram-error__title')?.textContent ??
          '',
      }
    })
  }, LANGS)

  expect(state.every((item) => item.hasError)).toBe(true)
  expect(state.every((item) => !item.empty)).toBe(true)
  expect(state.every((item) => item.processed === 'true')).toBe(true)
  expect(state.map((item) => item.title)).toEqual([
    'GeoJSON',
    'TopoJSON',
    'nomnoml',
    'STL',
    'WaveDrom',
    'Vega',
    'Vega',
  ])
})
