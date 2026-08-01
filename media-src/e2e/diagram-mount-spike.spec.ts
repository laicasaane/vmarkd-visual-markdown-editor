import { test, expect } from './coverage-fixture'

// SPIKE for task 453's "verify-then-migrate" step (not a claimed migration by itself — see
// tasks/453-e2e-layer-migrations.md). Question: does the chromium harness render Vditor's
// NATIVE fenced-block diagram types (abc, graphviz, flowchart) with real geometry, the way it
// already renders mermaid? If yes, `diagram-width.spec.ts` / `diagram-sizing.spec.ts` (currently
// real-VS-Code-only, header claims "the harness doesn't render the real diagrams") are
// migratable without any custom mount code — these are Vditor built-ins, not our custom
// diagram-runtime types.
test.describe('diagram-mount spike (task 453)', () => {
  test('abc, graphviz, flowchart, mermaid all render real SVG/canvas geometry in WYSIWYG preview', async ({
    page,
  }) => {
    await page.goto('/diagram-mount.html')
    await page.waitForFunction(() => (window as any).__ready === true)
    // Diagram libs (abcjs/viz.js/flowchart.js/mermaid) load async off the vendored cdn — give
    // them room, matching the ~3-4.5s settle the real-VS-Code specs use.
    await page.waitForTimeout(4500)

    const measure = (lang: string) =>
      page.evaluate((l) => (window as any).__measure(l), lang)

    const abc = await measure('abc')
    const graphviz = await measure('graphviz')
    const flowchart = await measure('flowchart')
    const mermaid = await measure('mermaid')

    // eslint-disable-next-line no-console
    console.log(
      `[diagram-mount spike] abc=${JSON.stringify(abc)} graphviz=${JSON.stringify(graphviz)} flowchart=${JSON.stringify(flowchart)} mermaid=${JSON.stringify(mermaid)}`,
    )

    for (const [lang, m] of [
      ['abc', abc],
      ['graphviz', graphviz],
      ['flowchart', flowchart],
      ['mermaid', mermaid],
    ] as const) {
      expect(m.found, `${lang} block found in the preview`).toBe(true)
      expect(m.hasGraphic, `${lang} rendered an svg/canvas`).toBe(true)
      expect(m.w, `${lang} has nonzero rendered width`).toBeGreaterThan(0)
      expect(m.h, `${lang} has nonzero rendered height`).toBeGreaterThan(0)
    }
  })
})
