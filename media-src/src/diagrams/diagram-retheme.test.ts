// @vitest-environment jsdom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'
import { CUSTOM_DIAGRAM_ADAPTERS } from './custom-diagrams'
import { reRenderD2 } from './d2/engines/d2'
import { rethemeCacheFirst } from './render-cache-client'
import { engineLangs } from '../diagram-kit/engine-registry'
// Type-only — erased entirely, so it doesn't trip the VDITOR_VERSION-define ordering issue the
// comment below explains for the runtime dynamic imports. Deriving these from the real functions
// (rather than hand-copying their signatures) is what this task's diagram-retheme.test.ts fix
// actually needed: the hand-copied `rethemeDiagrams` type here had drifted to `Record<string,
// unknown>`, wider than the real object-shaped parameter, undetected until strictFunctionTypes.
import type {
  monoOrGeoRerender as MonoOrGeoRerenderFn,
  rethemeDiagrams as RethemeDiagramsFn,
} from './diagram-retheme'

// diagram-retheme.ts transitively imports plantuml-retheme/mermaid-retheme/echarts-retheme, which
// import vditor source — that reads the esbuild-injected VDITOR_VERSION define at module scope, so
// it must be set before the dynamic import (same pattern as engine-registry.test.ts /
// native-offscreen.test.ts). reRenderPlantuml is imported the SAME dynamic way (not a top-level
// `import`, which would be hoisted above this beforeAll and hit the same undefined-define error).
let monoOrGeoRerender: typeof MonoOrGeoRerenderFn
let rethemeDiagrams: typeof RethemeDiagramsFn
// The shared diagramGate is a MODULE-LEVEL singleton (diagram-retheme.ts) — its internal
// IntersectionObserver instance persists across every test in this file unless explicitly disposed.
// Without disposing between tests that exercise deferred/offscreen behaviour, a LATER test's fresh
// `vi.stubGlobal('IntersectionObserver', ...)` is moot: `ensureObserver()` just returns the observer
// an EARLIER test already constructed (real or a different stub instance), which the later test
// never sees in its own `.instances` list.
let disposeDiagramRethemeGate: () => void
let reRenderPlantuml: (
  editorEl: HTMLElement | null | undefined,
  cdn: string,
) => void
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).VDITOR_VERSION = 'test'
  ;({ monoOrGeoRerender, rethemeDiagrams, disposeDiagramRethemeGate } =
    await import('./diagram-retheme'))
  ;({ reRenderPlantuml } = await import('./plantuml/plantuml-retheme'))
})

// Task 411 — reThemeGeoAndD2 dispatched its deferred work on BOTH requestAnimationFrame AND
// setTimeout(400), unconditionally, so every flip re-rendered each D2/geo block twice (two WASM
// compiles + layouts per diagram, two tile fetches per map). Counted at the ENGINE entry point
// rather than by spying on the timers: what the bug cost was live renders, not scheduled callbacks,
// and an assertion on the timers would keep passing if the two legs were ever merged into one
// callback that still ran the engine twice.
vi.mock('./d2/engines/d2', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reRenderD2: vi.fn(),
}))

// Task 436 — the re-theme path asks the cache before running an engine. Mocked to a plain switch so
// the WIRING is what's under test here (does a take-over really suppress the live render?); whether
// the lookup itself reserves/paints correctly is render-cache-client.test.ts's job.
vi.mock('./render-cache-client', () => ({
  rethemeCacheFirst: vi.fn(() => false),
}))

// Task 412 — same posture as the D2 mock above: count what reThemeMono actually reaches the ENGINE
// for (a re-render is the expensive bit — plantuml's the highest-impact member of this group, tasks
// 349/352), not the polling/timer plumbing around it. graphviz/abc/wavedrom/nomnoml keep their real
// implementations; the gating tests below only build plantuml fixtures, so those never fire.
vi.mock('./plantuml/plantuml-retheme', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reRenderPlantuml: vi.fn(),
}))

// Real DOM positioning shared by every gating test below — a fake `getBoundingClientRect` the
// viewport gate's `isVisibleish` reads.
function setRect(target: HTMLElement, top: number): void {
  target.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 100,
      width: 100,
      height: 100,
      left: 0,
      right: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

// Mounts `<block class="vditor-ir__node"><pane class="vditor-ir__preview"><live class="language-X"
// data-processed></pane></block>` — the SAME nesting Lute actually produces (task 412's original
// pre-check, verified in the real webview) — under `container`. Returns both so a test can assert
// which SCOPE (`block`) a re-render call receives.
// `blockClass: null` mounts WITHOUT a `.vditor-ir__node`/etc. block wrapper — matching realistic
// full/split Preview markup (verified in the real webview, task 412's original pre-check): Preview
// mode has no IR/WYSIWYG block-node ancestor at all, so `blockScopeOf`'s `closest()` correctly falls
// through to `live.parentElement` there. Passing the default (a real IR/WYSIWYG block wrapper) for a
// `.vditor-preview`-mounted fixture would be UNREALISTIC and silently change which scope
// `blockScopeOf` resolves to.
function mountLang(
  container: HTMLElement,
  lang: string,
  top: number,
  paneClass = 'vditor-ir__preview',
  blockClass: string | null = 'vditor-ir__node',
): { block: HTMLElement; live: HTMLElement } {
  const pane = document.createElement('div')
  pane.className = paneClass
  const live = document.createElement('div')
  live.className = `language-${lang}`
  live.dataset.processed = 'true'
  live.dataset.code = `${lang} source`
  setRect(live, top)
  pane.append(live)
  if (blockClass === null) {
    container.append(pane)
    return { block: pane, live }
  }
  const block = document.createElement('div')
  block.className = blockClass
  block.append(pane)
  container.append(block)
  return { block, live }
}

// A minimal, CONTROLLABLE IntersectionObserver — jsdom has none, and the real one can't be driven
// deterministically from a test anyway. `intersect(target)` simulates a scroll-in.
class ControlledIntersectionObserver {
  static instances: ControlledIntersectionObserver[] = []
  readonly observed = new Set<Element>()
  readonly observe = vi.fn((target: Element) => this.observed.add(target))
  readonly unobserve = vi.fn((target: Element) => this.observed.delete(target))
  readonly disconnect = vi.fn(() => this.observed.clear())
  constructor(
    readonly callback: (entries: IntersectionObserverEntry[]) => void,
    readonly options?: IntersectionObserverInit,
  ) {
    ControlledIntersectionObserver.instances.push(this)
  }
  intersect(target: Element): void {
    if (!this.observed.has(target)) return
    this.callback([
      { isIntersecting: true, target } as IntersectionObserverEntry,
    ])
  }
}
function observer(): ControlledIntersectionObserver {
  return ControlledIntersectionObserver.instances.at(-1)!
}

// `as const` so `theme` stays the literal `'dark'`, not widened to `string` — matching
// rethemeDiagrams' real `theme: 'dark' | 'light'` param (surfaced by deriving monoOrGeoRerender's/
// rethemeDiagrams' types above instead of hand-copying them, this task).
const FLAGS = {
  theme: 'dark',
  code: false,
  mermaid: false,
  echarts: false,
  smiles: false,
  flowchart: false,
  vega: false,
  monoGroup: false,
  geo: false,
  d2: false,
} as const

describe('reThemeGeoAndD2 fires ONCE per flip (task 411)', () => {
  // Task 412 — reThemeGeoAndD2 now COLLECTS its own D2 candidate elements (viewport-gating them one
  // by one) instead of unconditionally invoking the engine and letting it find its own targets, so a
  // real editor DOM with an already-rendered D2 block is required for the engine to be reached at
  // all.
  beforeEach(() => {
    document.body.replaceChildren() // don't let a prior test's DOM accumulate/collide (task 412 follow-up: bit us for real via a duplicate #app)
    const editor = document.createElement('div')
    mountLang(editor, 'd2', 0)
    document.body.append(editor)
    ;(window as unknown as { vditor: unknown }).vditor = {
      vditor: { currentMode: 'ir', ir: { element: editor } },
    }
  })
  afterEach(() => {
    vi.useRealTimers()
    // Unstub HERE, not at the end of the test that stubs: a failing assertion would otherwise skip
    // the restore and leak a fake requestAnimationFrame into every later test in this file.
    vi.unstubAllGlobals()
    disposeDiagramRethemeGate() // reset the shared gate's observer — see its own top-of-file comment
    vi.mocked(reRenderD2).mockClear()
    vi.mocked(rethemeCacheFirst).mockClear()
    vi.mocked(rethemeCacheFirst).mockReturnValue(false)
  })

  test('the cache takes D2 over → the live engine is NOT called (task 436)', () => {
    vi.useFakeTimers()
    vi.mocked(rethemeCacheFirst).mockReturnValue(true)
    rethemeDiagrams({ ...FLAGS, d2: true })
    vi.advanceTimersByTime(1000)
    expect(vi.mocked(rethemeCacheFirst)).toHaveBeenCalledWith(
      expect.anything(),
      ['d2'],
    )
    expect(vi.mocked(reRenderD2)).not.toHaveBeenCalled()
  })

  test('one live D2 re-render per rethemeDiagrams call, not two', () => {
    vi.useFakeTimers()
    // rAF is what the removed leg used; drive it so a reintroduced leg would be COUNTED, not
    // silently dropped by an environment that never runs frames.
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })

    rethemeDiagrams({ ...FLAGS, d2: true })
    vi.advanceTimersByTime(1000)
    for (const cb of frames.splice(0)) cb(0)
    vi.advanceTimersByTime(1000)

    expect(vi.mocked(reRenderD2)).toHaveBeenCalledTimes(1)
  })

  test('no D2 re-render at all when the flip does not touch d2/geo', () => {
    vi.useFakeTimers()
    rethemeDiagrams({ ...FLAGS })
    vi.advanceTimersByTime(1000)
    expect(vi.mocked(reRenderD2)).not.toHaveBeenCalled()
  })

  test('the single fire is DEFERRED, not synchronous (the content-theme link lands late)', () => {
    vi.useFakeTimers()
    rethemeDiagrams({ ...FLAGS, d2: true })
    expect(
      vi.mocked(reRenderD2),
      'nothing renders before the deferral elapses',
    ).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(vi.mocked(reRenderD2)).toHaveBeenCalledTimes(1)
  })
})

// Task 412 — reThemeMono now viewport-gates PER DIAGRAM instead of unconditionally re-rendering
// every block of a lang across the whole editor.
describe('reThemeMono viewport gating (task 412)', () => {
  beforeEach(() => {
    document.body.replaceChildren() // don't let a prior test's DOM accumulate/collide
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    disposeDiagramRethemeGate() // reset the shared gate's observer — see its own top-of-file comment
    vi.mocked(reRenderPlantuml).mockClear()
  })

  test('a flip re-renders only the VISIBLE plantuml block immediately, scoped to its own block wrapper', () => {
    vi.useFakeTimers()
    // reThemeOnForegroundChange's poll starts via requestAnimationFrame, then advances on
    // window.setTimeout (fake-timer controlled).
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    // jsdom has no IntersectionObserver — the OFFSCREEN block below takes the gate's defer path,
    // which constructs one.
    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
    ControlledIntersectionObserver.instances = []

    const editor = document.createElement('div')
    const { block: visibleBlock, live: visibleEl } = mountLang(
      editor,
      'plantuml',
      0,
    )
    mountLang(editor, 'plantuml', 5000)
    document.body.append(editor)
    ;(window as unknown as { vditor: unknown }).vditor = {
      vditor: { currentMode: 'ir', ir: { element: editor } },
    }

    // reThemeOnForegroundChange's poll reads getComputedStyle(probe).color — jsdom applies no real
    // CSS cascade, so a class flip alone never changes it; drive the settle directly, the same way
    // a real flip's `vditor--dark` class change eventually would.
    let flipped = false
    const nativeGetComputedStyle = window.getComputedStyle.bind(window)
    vi.stubGlobal('getComputedStyle', (el: Element, ...rest: unknown[]) => {
      if (el === visibleEl) {
        return {
          color: flipped ? 'rgb(200,200,200)' : 'rgb(0,0,0)',
        } as CSSStyleDeclaration
      }
      return nativeGetComputedStyle(el, ...(rest as []))
    })

    rethemeDiagrams({ ...FLAGS, monoGroup: true })
    for (const cb of frames.splice(0)) cb(0) // kick the first tick
    flipped = true // the "flip" — poll now reads a different colour on its next tick
    // 14 poll ticks * 150ms, plus the 250ms settle timer the changed colour arms.
    vi.advanceTimersByTime(150 * 14 + 250)

    // GATING: exactly one call — the offscreen block never reaches the engine on THIS flip.
    expect(vi.mocked(reRenderPlantuml)).toHaveBeenCalledTimes(1)
    // Scoped to the visible block's OWN wrapper, not the whole editor.
    const [scopeArg] = vi.mocked(reRenderPlantuml).mock.calls[0] as [
      HTMLElement,
      string,
    ]
    expect(scopeArg).toBe(visibleBlock)
  })
})

// Task 412 follow-up — CONFIRMED HIGH bug: every retheme path resolved its scan root from
// `activeModeElement(window.vditor)`, which is ONLY the active mode's OWN element
// (`vditor.ir.element`/`vditor.wysiwyg.element`). Vditor appends the full/split Preview surface
// (`.vditor-preview`) as a SIBLING of that element, not a descendant — so an already-rendered
// diagram living there was never even collected as a gate candidate (not "judged offscreen", never
// enumerated) and stayed stale after a flip until reopen. These tests build exactly that shape — a
// `.vditor-preview` sibling of the (empty, diagram-less) "active" editor element under a `#app`
// root — and would FAIL against the pre-fix `activeModeElement`-based root resolution.
describe('theme flip reaches diagrams in the full/split Preview surface (task 412 follow-up)', () => {
  // Every test in this block mounts its own `#app` — `diagramRenderRoot` resolves via
  // `document.getElementById('app')`, which returns the FIRST match in document order. Without
  // clearing `document.body` between tests, an earlier test's `#app` (never removed) would keep
  // winning that lookup and every LATER test's diagram would silently never be found — not a gate
  // bug, a test-hygiene one, but exactly the kind of false negative (or, here, false pass on the
  // wrong element) worth guarding against explicitly.
  beforeEach(() => {
    document.body.replaceChildren()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    disposeDiagramRethemeGate() // reset the shared gate's observer — see its own top-of-file comment
    vi.mocked(reRenderD2).mockClear()
    vi.mocked(reRenderPlantuml).mockClear()
    vi.mocked(rethemeCacheFirst).mockClear()
    vi.mocked(rethemeCacheFirst).mockReturnValue(false)
  })

  // Builds `#app > (emptyEditor, .vditor-preview > pane > live)` and points `vditor.ir.element` at
  // the EMPTY editor — activeModeElement would resolve there and never see the Preview diagram;
  // `#app` (diagramRenderRoot) covers both.
  function mountInPreviewOnly(lang: string): {
    app: HTMLElement
    live: HTMLElement
  } {
    const app = document.createElement('div')
    app.id = 'app'
    const emptyEditor = document.createElement('div')
    emptyEditor.className = 'vditor-ir'
    const preview = document.createElement('div')
    preview.className = 'vditor-preview'
    const { live } = mountLang(preview, lang, 0, 'vditor-preview', null)
    app.append(emptyEditor, preview)
    document.body.append(app)
    ;(window as unknown as { vditor: unknown }).vditor = {
      vditor: { currentMode: 'ir', ir: { element: emptyEditor } },
    }
    return { app, live }
  }

  test('D2 in `.vditor-preview` alone is redrawn on a flip', () => {
    vi.useFakeTimers()
    mountInPreviewOnly('d2')
    rethemeDiagrams({ ...FLAGS, d2: true })
    vi.advanceTimersByTime(400)
    expect(vi.mocked(reRenderD2)).toHaveBeenCalledTimes(1)
  })

  test('plantuml (mono group) in `.vditor-preview` alone is redrawn on a flip', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('getComputedStyle', () => ({ color: 'rgb(1,2,3)' }))
    mountInPreviewOnly('plantuml')
    rethemeDiagrams({ ...FLAGS, monoGroup: true })
    vi.advanceTimersByTime(250) // the foreground-settle timer reThemeOnForegroundChange arms
    expect(vi.mocked(reRenderPlantuml)).toHaveBeenCalledTimes(1)
  })

  test('wavedrom (custom mono, via its adapter) in `.vditor-preview` alone is redrawn on a flip', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('getComputedStyle', () => ({ color: 'rgb(1,2,3)' }))
    const reRender = vi.spyOn(CUSTOM_DIAGRAM_ADAPTERS.wavedrom, 'reRender')
    mountInPreviewOnly('wavedrom')
    rethemeDiagrams({ ...FLAGS, monoGroup: true })
    vi.advanceTimersByTime(250) // the foreground-settle timer reThemeOnForegroundChange arms
    expect(reRender).toHaveBeenCalledTimes(1)
    reRender.mockRestore()
  })

  test('geojson in `.vditor-preview` alone is redrawn on a flip', () => {
    vi.useFakeTimers()
    const reRender = vi.spyOn(CUSTOM_DIAGRAM_ADAPTERS.geojson, 'reRender')
    mountInPreviewOnly('geojson')
    rethemeDiagrams({ ...FLAGS, geo: true })
    vi.advanceTimersByTime(400)
    expect(reRender).toHaveBeenCalledTimes(1)
    reRender.mockRestore()
  })

  // sv (split) mode: the editable pane and `.vditor-preview` are both LIVE and visible
  // simultaneously (unlike full Preview, where the editable pane is display:none) — both must
  // still redraw independently; this is the shape a real `sv` mode flip produces.
  test('sv split mode: a diagram in the editable pane AND its `.vditor-preview` counterpart both redraw', () => {
    vi.useFakeTimers()
    const app = document.createElement('div')
    app.id = 'app'
    const editor = document.createElement('div')
    const { block: editorBlock } = mountLang(editor, 'd2', 0)
    const preview = document.createElement('div')
    preview.className = 'vditor-preview'
    const { live: previewLive } = mountLang(
      preview,
      'd2',
      0,
      'vditor-preview',
      null,
    )
    app.append(editor, preview)
    document.body.append(app)
    ;(window as unknown as { vditor: unknown }).vditor = {
      vditor: { currentMode: 'sv', ir: { element: editor } },
    }

    rethemeDiagrams({ ...FLAGS, d2: true })
    vi.advanceTimersByTime(400)

    expect(vi.mocked(reRenderD2)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(reRenderD2)).toHaveBeenCalledWith(editorBlock)
    // The full-Preview fallback scope is the live node's own parent (`preview` here), since
    // `.vditor-preview` markup has no `.vditor-ir__node`/`.vditor-wysiwyg__block` ancestor.
    expect(vi.mocked(reRenderD2)).toHaveBeenCalledWith(
      previewLive.parentElement,
    )
  })

  test('an OFFSCREEN diagram in `.vditor-preview` defers and redraws on scroll-in, same as the editable pane', () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
    ControlledIntersectionObserver.instances = []
    const app = document.createElement('div')
    app.id = 'app'
    const emptyEditor = document.createElement('div')
    const preview = document.createElement('div')
    preview.className = 'vditor-preview'
    const { live } = mountLang(preview, 'd2', 5000, 'vditor-preview', null)
    app.append(emptyEditor, preview)
    document.body.append(app)
    ;(window as unknown as { vditor: unknown }).vditor = {
      vditor: { currentMode: 'ir', ir: { element: emptyEditor } },
    }

    rethemeDiagrams({ ...FLAGS, d2: true })
    vi.advanceTimersByTime(400)
    expect(vi.mocked(reRenderD2)).not.toHaveBeenCalled()
    expect(live.hasAttribute('data-vmde-retheme-defer')).toBe(true)

    observer().intersect(live)

    expect(vi.mocked(reRenderD2)).toHaveBeenCalledTimes(1)
    expect(live.hasAttribute('data-vmde-retheme-defer')).toBe(false)
  })
})

// Task 404 phase 2: MONO_RERENDER/GEO_RERENDER used to carry their OWN wavedrom/nomnoml/geojson/
// topojson rows — a second per-engine map next to CUSTOM_DIAGRAM_ADAPTERS for the exact same 4
// `family: 'custom'` engines. monoOrGeoRerender() is the single dispatch point both the module-init
// fail-loud check and reThemeMono/reThemeGeoAndD2 now read from: the native (plantuml/graphviz/abc)
// map first, then CUSTOM_DIAGRAM_ADAPTERS for everything else tagged mono/geo in the registry.
describe('monoOrGeoRerender dispatch (task 404 phase 2)', () => {
  test('every registry engine tagged mono or geo resolves to a function', () => {
    const langs = [
      ...engineLangs((e) => e.retheme === 'mono'),
      ...engineLangs((e) => e.retheme === 'geo'),
    ]
    expect(langs.length).toBeGreaterThan(0)
    for (const lang of langs) {
      expect(monoOrGeoRerender(lang), lang).toBeTypeOf('function')
    }
  })

  test('wavedrom/nomnoml/geojson/topojson dispatch through CUSTOM_DIAGRAM_ADAPTERS.reRender (not a second copy)', () => {
    for (const lang of ['wavedrom', 'nomnoml', 'geojson', 'topojson']) {
      const spy = vi.spyOn(CUSTOM_DIAGRAM_ADAPTERS[lang], 'reRender')
      monoOrGeoRerender(lang)?.(document.createElement('div'), 'https://cdn')
      expect(spy, lang).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    }
  })

  test('an unknown lang resolves to undefined (no silent fallback)', () => {
    expect(monoOrGeoRerender('bogus-lang')).toBeUndefined()
  })
})
