// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest'
import { Disposables } from './disposables'

const installDiagramRuntime = vi.fn()
const installDiagramZoomGate = vi.fn()

vi.mock('./diagram-runtime', () => ({ installDiagramRuntime }))
// Task 412 — finish-init.ts registers this directly (not through installDiagramRuntime's per-lang
// adapter table, mocked above), so it needs its own mock here.
vi.mock('./diagram-retheme', () => ({
  disposeDiagramRethemeGate: vi.fn(),
}))
vi.mock('./inner-vditor', () => ({
  innerVditor: () => ({ preview: { previewElement: undefined } }),
}))
vi.mock('./source-map', () => ({ activeModeElement: () => undefined }))
vi.mock('./responsive-tables', () => ({ fixResponsiveTables: vi.fn() }))
vi.mock('./toolbar-actions', () => ({
  handleToolbarClick: vi.fn(),
  reportEditorMode: vi.fn(),
}))
vi.mock('./utils', () => ({ fixPanelHover: vi.fn() }))
vi.mock('./toolbar-scroll-guard', () => ({ guardToolbarScroll: vi.fn() }))
vi.mock('./fix-table-ir', () => ({ fixTableIr: vi.fn() }))
vi.mock('./outline', () => ({ setupOutlineFlash: vi.fn() }))
vi.mock('./outline-resize', () => ({ setupOutlineResize: vi.fn() }))
vi.mock('./preview-morph', () => ({ installPreviewMorph: vi.fn() }))
vi.mock('./split-scroll-sync', () => ({ setupSplitScrollSync: vi.fn() }))
vi.mock('./preview-scroll-preserve', () => ({
  setupPreviewScrollPreserve: vi.fn(),
}))
vi.mock('./callouts', () => ({ observeCallouts: () => vi.fn() }))
vi.mock('./diagram-zoom', () => ({ observeDiagramZoom: () => vi.fn() }))
vi.mock('./html-comment', () => ({
  observeHtmlComments: () => vi.fn(),
  observePreviewComments: () => vi.fn(),
}))
vi.mock('./code-source', () => ({ observeCodeSource: () => vi.fn() }))
vi.mock('./wysiwyg-code-highlight', () => ({
  ensureHljsLoaded: () => Promise.resolve(),
  observeWysiwygCodeHighlight: () => vi.fn(),
  wrapLuteFlatten: vi.fn(),
}))
vi.mock('./gap-paragraph', () => ({
  observeTrailingParagraph: () => vi.fn(),
}))
vi.mock('./diagram-zoom-gate', () => ({ installDiagramZoomGate }))
// list-backspace imports Vditor internals (constants.ts → the esbuild-defined VDITOR_VERSION global),
// so it must be mocked here like the other installers — the real thing is covered by list-backspace.spec.
vi.mock('./list-backspace', () => ({ installListBackspace: () => vi.fn() }))
vi.mock('./echarts-fit', () => ({ installEchartsResize: () => vi.fn() }))
vi.mock('./smiles-render', () => ({ observeSmiles: () => vi.fn() }))
vi.mock('./custom-diagrams', () => ({
  observeCustomDiagrams: () => vi.fn(),
}))
vi.mock('./render-cache-client', () => ({
  installRenderCache: () => vi.fn(),
}))
vi.mock('./markmap-fit', () => ({ installMarkmapResize: () => vi.fn() }))
vi.mock('./abc-fit', () => ({ observeAbc: () => vi.fn() }))
vi.mock('./echarts-retheme', () => ({ observeMindmaps: () => vi.fn() }))
vi.mock('./mermaid-retheme', () => ({
  disposeMermaidDeferObserver: vi.fn(),
}))
vi.mock('./edit-activity', () => ({ installEditActivity: () => vi.fn() }))

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  installDiagramRuntime.mockClear()
  ;(window as unknown as { vditor: unknown }).vditor = {}
  ;(
    globalThis as unknown as {
      vscode: { postMessage: ReturnType<typeof vi.fn> }
    }
  ).vscode = { postMessage: vi.fn() }
})

it('delegates the diagram lifecycle to the phased runtime installer', async () => {
  const { runFinishInit } = await import('./finish-init')
  const observers = new Disposables()

  runFinishInit(
    { content: '', options: {} } as Parameters<typeof runFinishInit>[0],
    {
      observers,
      cdn: 'test',
      reportDocMode: vi.fn(),
    },
  )

  expect(installDiagramRuntime).toHaveBeenCalledOnce()
  expect(installDiagramZoomGate.mock.invocationCallOrder[0]).toBeLessThan(
    installDiagramRuntime.mock.invocationCallOrder[0],
  )
  const runtimeContext = installDiagramRuntime.mock.calls[0][0]
  expect(runtimeContext).toMatchObject({
    app: document.getElementById('app'),
    win: window,
    observers,
  })

  runtimeContext.postCacheMessage({ command: 'diagram-cache-get' })
  expect(vscode.postMessage).toHaveBeenCalledWith({
    command: 'diagram-cache-get',
  })
})
