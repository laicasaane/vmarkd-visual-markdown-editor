// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reconstructCharts, reRenderEcharts } from './echarts-retheme'

// Task 454 — echarts alone, of every native diagram engine, never redrew on a theme flip inside
// `.vditor-preview` (sv split / full Preview): `reRenderEcharts` used to resolve each chart's JSON
// source by searching for a sibling editable `<code class="language-echarts">` OUTSIDE the preview
// pane — a lookup that only ever finds anything in IR/WYSIWYG (which pair 1:1 with an editable
// block); `.vditor-preview` has no such pairing, so `source` was always `undefined` there and the
// redraw silently `continue`d. The fix stamps `data-code` on the live node as chartRender.ts first
// renders it (esbuild patch `patchEchartsDataCode`, covered in vditor-source-patches.test.ts) and
// has `reRenderEcharts`/`reconstructCharts` prefer that, read directly off each `live` node.

/** Minimal fake `echarts` global: records what `setOption` was called with, per `init`'d element,
 *  so a test can tell WHICH chart's spec a given container actually received. */
function fakeEcharts() {
  const setOptionCalls: Array<{ el: HTMLElement; option: unknown }> = []
  const ec = {
    init: vi.fn((el: HTMLElement) => ({
      setOption: vi.fn((option: unknown) => {
        setOptionCalls.push({ el, option })
      }),
    })),
    getInstanceByDom: vi.fn(() => undefined),
  }
  return { ec, setOptionCalls }
}

// looseJsonParse (vditor's) evaluates the source via `Function(...)`, which returns synchronously,
// but reRenderEcharts/reconstructCharts always wrap it in `Promise.resolve(...).then(...)` (task 90's
// "re-init synchronously but still guard the parse" design) — so the `setOption` call lands on a
// microtask, one tick after the function under test returns.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('reRenderEcharts — data-code source resolution (task 454)', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  // THE TRAP: `.vditor-preview` is a SINGLE pane holding every chart in the document. Using
  // `nativeSourceForPane`-style "first `.language-echarts` in the pane" would resolve BOTH charts
  // to chart A's spec. reRenderEcharts must read `data-code` off each `live` node itself.
  it('resolves each chart in a shared .vditor-preview pane to ITS OWN data-code, not the first one found', async () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-preview">
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"Chart A"}}'><canvas></canvas></div>
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"Chart B"}}'><canvas></canvas></div>
      </div>`
    document.body.replaceChildren(app)
    const nodes = Array.from(
      app.querySelectorAll<HTMLElement>('.language-echarts'),
    )

    const { ec, setOptionCalls } = fakeEcharts()
    reRenderEcharts({ echarts: ec }, app, 'dark')
    await flush()

    expect(setOptionCalls).toHaveLength(2)
    const byEl = new Map(setOptionCalls.map((c) => [c.el, c.option]))
    expect(byEl.get(nodes[0])).toEqual({
      title: { text: 'Chart A' },
      animation: false,
    })
    expect(byEl.get(nodes[1])).toEqual({
      title: { text: 'Chart B' },
      animation: false,
    })
  })

  // Encoding contract (esbuild-shared.mjs's patchEchartsDataCode + this file's own comment): RAW
  // text, no decodeURIComponent — unlike mindmap's data-code, which IS URI-encoded. A '%' not
  // followed by two hex digits makes decodeURIComponent throw, so if a future edit wrongly added a
  // decode step here, this spec (which parses fine as JSON but is NOT valid decodeURIComponent
  // input) would start failing instead of silently drifting.
  it('reads data-code RAW — a value that is valid JSON but invalid percent-encoding still resolves', async () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-preview">
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"100% done"}}'><canvas></canvas></div>
      </div>`
    document.body.replaceChildren(app)
    // Sanity: this fixture IS a decodeURIComponent trap (it must throw), so the "still resolves"
    // assertion below is proof the code path never calls it.
    expect(() => decodeURIComponent('100% done')).toThrow()

    const { ec, setOptionCalls } = fakeEcharts()
    reRenderEcharts({ echarts: ec }, app, 'dark')
    await flush()

    expect(setOptionCalls).toHaveLength(1)
    expect(setOptionCalls[0].option).toEqual({
      title: { text: '100% done' },
      animation: false,
    })
  })

  // Backward compatibility: IR/WYSIWYG still has a genuine sibling editable <code> outside the
  // preview pane, and a document rendered before this fix shipped has no data-code stamp yet — the
  // original sibling-search fallback must keep working there.
  it('falls back to the sibling editable <code> when no data-code is stamped (pre-fix documents, IR/WYSIWYG)', async () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-ir__node">
        <span class="vditor-ir__marker--pre"><code class="language-echarts">{"title":{"text":"Legacy"}}</code></span>
        <div class="vditor-ir__preview">
          <div class="language-echarts" data-processed="true"><canvas></canvas></div>
        </div>
      </div>`
    document.body.replaceChildren(app)
    const live = app.querySelector(
      '.vditor-ir__preview .language-echarts',
    ) as HTMLElement

    const { ec, setOptionCalls } = fakeEcharts()
    reRenderEcharts({ echarts: ec }, app, 'light')
    await flush()

    expect(setOptionCalls).toHaveLength(1)
    expect(setOptionCalls[0].el).toBe(live)
    expect(setOptionCalls[0].option).toEqual({
      title: { text: 'Legacy' },
      animation: false,
    })
  })

  it('skips a chart with neither a data-code stamp nor a recoverable sibling source, without throwing', async () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-preview">
        <div class="language-echarts" data-processed="true"><canvas></canvas></div>
      </div>`
    document.body.replaceChildren(app)

    const { ec, setOptionCalls } = fakeEcharts()
    expect(() => reRenderEcharts({ echarts: ec }, app, 'dark')).not.toThrow()
    await flush()
    expect(setOptionCalls).toHaveLength(0)
  })
})

describe('reconstructCharts — data-code resolution + .vditor-preview coverage (task 454)', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  // Set a non-zero clientWidth/Height (jsdom's default layout is 0×0) so the hidden-container skip
  // doesn't swallow the fixture, and no <canvas> so the "already fits" dedupe never fires.
  function sized(el: HTMLElement, width: number, height = 300): void {
    Object.defineProperty(el, 'clientWidth', {
      value: width,
      configurable: true,
    })
    Object.defineProperty(el, 'clientHeight', {
      value: height,
      configurable: true,
    })
  }

  // This surface was PREVIOUSLY UNSCANNED by reconstructCharts at all (its pane list was
  // `.vditor-ir__preview, .vditor-wysiwyg__preview` — `.vditor-preview` was simply absent), so a
  // chart in sv split / full Preview never resized on a window/pane resize. Proves it now does.
  it('reaches a chart inside .vditor-preview, previously unscanned entirely', async () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-preview">
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"Resized"}}'></div>
      </div>`
    document.body.replaceChildren(app)
    const live = app.querySelector('.language-echarts') as HTMLElement
    sized(live, 480)

    const { ec, setOptionCalls } = fakeEcharts()
    reconstructCharts({ echarts: ec }, app)
    await flush()

    expect(setOptionCalls).toHaveLength(1)
    expect(setOptionCalls[0].el).toBe(live)
  })

  // The same first-match-in-pane trap as reRenderEcharts, for the resize twin.
  it('resolves two charts sharing one .vditor-preview pane to their own data-code', async () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-preview">
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"A"}}'></div>
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"B"}}'></div>
      </div>`
    document.body.replaceChildren(app)
    const nodes = Array.from(
      app.querySelectorAll<HTMLElement>('.language-echarts'),
    )
    for (const n of nodes) sized(n, 400)

    const { ec, setOptionCalls } = fakeEcharts()
    reconstructCharts({ echarts: ec }, app)
    await flush()

    expect(setOptionCalls).toHaveLength(2)
    const byEl = new Map(setOptionCalls.map((c) => [c.el, c.option]))
    expect(byEl.get(nodes[0])).toEqual({
      title: { text: 'A' },
      animation: false,
    })
    expect(byEl.get(nodes[1])).toEqual({
      title: { text: 'B' },
      animation: false,
    })
  })

  it('skips a hidden (0-width) container without throwing', async () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-preview">
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"Hidden"}}'></div>
      </div>`
    document.body.replaceChildren(app)
    // Deliberately NOT calling sized() — jsdom's default clientWidth is 0.

    const { ec, setOptionCalls } = fakeEcharts()
    expect(() => reconstructCharts({ echarts: ec }, app)).not.toThrow()
    await flush()
    expect(setOptionCalls).toHaveLength(0)
  })

  // Same fallback contract as reRenderEcharts, for the resize twin: a pre-fix IR/WYSIWYG document
  // with no data-code stamp still resolves via the sibling editable <code>.
  it('falls back to the sibling editable <code> when no data-code is stamped (IR)', async () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-ir__node">
        <span class="vditor-ir__marker--pre"><code class="language-echarts">{"title":{"text":"Legacy"}}</code></span>
        <div class="vditor-ir__preview">
          <div class="language-echarts" data-processed="true"></div>
        </div>
      </div>`
    document.body.replaceChildren(app)
    const live = app.querySelector(
      '.vditor-ir__preview .language-echarts',
    ) as HTMLElement
    sized(live, 480)

    const { ec, setOptionCalls } = fakeEcharts()
    reconstructCharts({ echarts: ec }, app)
    await flush()

    expect(setOptionCalls).toHaveLength(1)
    expect(setOptionCalls[0].el).toBe(live)
    expect(setOptionCalls[0].option).toEqual({
      title: { text: 'Legacy' },
      animation: false,
    })
  })
})
