import type { WebviewMessage } from '../../src/protocol'
import { observeAbc } from './abc-fit'
import { observeCustomDiagrams } from './custom-diagrams'
import type { Disposables } from './disposables'
import { installEchartsResize } from './echarts-fit'
import { observeMindmaps } from './echarts-retheme'
import { installMarkmapResize } from './markmap-fit'
import { disposeMermaidDeferObserver } from './mermaid-retheme'
import { observeSmiles } from './smiles-render'

export type DiagramRuntimePhase =
  | 'configure'
  | 'reserve-cache'
  | 'attach-renderers'
  | 'attach-decoration-and-resize'

export interface DiagramRuntimeContext {
  app: HTMLElement | null
  win: Window
  observers: Disposables
  postCacheMessage: (message: WebviewMessage) => void
}

export type RuntimeHook = (
  context: DiagramRuntimeContext,
) => void | (() => void)

export interface DiagramRuntimeAdapter {
  readonly lang: string
  readonly render?: RuntimeHook
  readonly fit?: RuntimeHook
  readonly onResize?: RuntimeHook
  readonly dispose?: () => void
  readonly phase?: {
    readonly fit?: 'configure' | 'attach-decoration-and-resize'
    readonly onResize?: 'configure' | 'attach-decoration-and-resize'
  }
}

const installCustomRender: RuntimeHook = ({ app }) =>
  observeCustomDiagrams(app)
const installSmilesFit: RuntimeHook = ({ app }) => observeSmiles(app)
const installAbcFit: RuntimeHook = ({ app }) => observeAbc(app)
const installMindmapFit: RuntimeHook = ({ app, win }) =>
  observeMindmaps(win, app)
const installEcharts: RuntimeHook = ({ win }) =>
  installEchartsResize(
    win as Parameters<typeof installEchartsResize>[0],
  )
const installMarkmap: RuntimeHook = ({ win }) => installMarkmapResize(win)

export const DIAGRAM_RUNTIME_ADAPTERS = {
  mermaid: {
    lang: 'mermaid',
    dispose: disposeMermaidDeferObserver,
  },
  echarts: {
    lang: 'echarts',
    onResize: installEcharts,
    phase: { onResize: 'configure' },
  },
  mindmap: {
    lang: 'mindmap',
    fit: installMindmapFit,
    onResize: installEcharts,
  },
  markmap: {
    lang: 'markmap',
    onResize: installMarkmap,
  },
  abc: {
    lang: 'abc',
    fit: installAbcFit,
  },
  smiles: {
    lang: 'smiles',
    fit: installSmilesFit,
    phase: { fit: 'configure' },
  },
  wavedrom: { lang: 'wavedrom', render: installCustomRender },
  nomnoml: { lang: 'nomnoml', render: installCustomRender },
  geojson: { lang: 'geojson', render: installCustomRender },
  topojson: { lang: 'topojson', render: installCustomRender },
  vega: { lang: 'vega', render: installCustomRender },
  'vega-lite': { lang: 'vega-lite', render: installCustomRender },
  stl: { lang: 'stl', render: installCustomRender },
  d2: { lang: 'd2', render: installCustomRender },
} as const satisfies Readonly<Record<string, DiagramRuntimeAdapter>>
