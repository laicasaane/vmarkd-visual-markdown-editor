import type { WebviewMessage } from '../../src/protocol'
import { observeAbc } from './abc-fit'
import { observeCustomDiagrams } from './custom-diagrams'
import type { Disposables } from './disposables'
import { installEchartsResize } from './echarts-fit'
import { observeMindmaps } from './echarts-retheme'
import { ENGINES, type RuntimeCapability } from './engine-registry'
import { installMarkmapResize } from './markmap-fit'
import { disposeMermaidDeferObserver } from './mermaid-retheme'
import { installRenderCache } from './render-cache-client'
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

export interface DiagramRuntimeDeps {
  installCache: (
    app: HTMLElement | null,
    post: (message: WebviewMessage) => void,
  ) => () => void
  adapters: Readonly<Record<string, DiagramRuntimeAdapter>>
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
  echarts: {
    lang: 'echarts',
    onResize: installEcharts,
    phase: { onResize: 'configure' },
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
  markmap: {
    lang: 'markmap',
    onResize: installMarkmap,
  },
  abc: {
    lang: 'abc',
    fit: installAbcFit,
  },
  mindmap: {
    lang: 'mindmap',
    fit: installMindmapFit,
    onResize: installEcharts,
    phase: { onResize: 'configure' },
  },
  mermaid: {
    lang: 'mermaid',
    dispose: disposeMermaidDeferObserver,
  },
} as const satisfies Readonly<Record<string, DiagramRuntimeAdapter>>

const HOOK_FOR_CAPABILITY = {
  render: 'render',
  fit: 'fit',
  resize: 'onResize',
  dispose: 'dispose',
} as const satisfies Record<
  RuntimeCapability,
  'render' | 'fit' | 'onResize' | 'dispose'
>

export function assertDiagramRuntimeAdapters(
  adapters: Readonly<Record<string, DiagramRuntimeAdapter>>,
): void {
  const engines = new Map(ENGINES.map((engine) => [engine.lang, engine]))
  for (const [lang, adapter] of Object.entries(adapters)) {
    if (!engines.has(lang))
      throw new Error(`Diagram runtime adapter has unknown engine: ${lang}`)
    if (adapter.lang !== lang)
      throw new Error(`Diagram runtime adapter key/lang mismatch: ${lang}`)
  }
  for (const engine of ENGINES) {
    for (const capability of engine.runtime ?? []) {
      const hook = HOOK_FOR_CAPABILITY[capability]
      if (typeof adapters[engine.lang]?.[hook] !== 'function')
        throw new Error(
          `Diagram runtime adapter missing ${engine.lang}.${hook}`,
        )
    }
  }
}

assertDiagramRuntimeAdapters(DIAGRAM_RUNTIME_ADAPTERS)

function hookPhase(
  adapter: DiagramRuntimeAdapter,
  kind: 'fit' | 'onResize',
): 'configure' | 'attach-decoration-and-resize' {
  return adapter.phase?.[kind] ?? 'attach-decoration-and-resize'
}

function installHooks(
  context: DiagramRuntimeContext,
  adapters: Readonly<Record<string, DiagramRuntimeAdapter>>,
  phase: 'configure' | 'attach-renderers' | 'attach-decoration-and-resize',
): void {
  const seen = new Map<RuntimeHook, string>()
  for (const adapter of Object.values(adapters)) {
    const hooks: Array<['render' | 'fit' | 'onResize', RuntimeHook | undefined]> =
      phase === 'attach-renderers'
        ? [['render', adapter.render]]
        : [
            [
              'fit',
              adapter.fit &&
              hookPhase(adapter, 'fit') === phase
                ? adapter.fit
                : undefined,
            ],
            [
              'onResize',
              adapter.onResize &&
              hookPhase(adapter, 'onResize') === phase
                ? adapter.onResize
                : undefined,
            ],
          ]
    for (const [kind, hook] of hooks) {
      if (!hook || seen.has(hook)) continue
      seen.set(hook, adapter.lang)
      const key = `diagram-runtime:${kind}:${adapter.lang}`
      context.observers.set(key, undefined)
      const disposer = hook(context)
      context.observers.set(
        key,
        typeof disposer === 'function' ? disposer : undefined,
      )
    }
    if (phase === 'attach-decoration-and-resize' && adapter.dispose)
      context.observers.set(
        `diagram-runtime:dispose:${adapter.lang}`,
        adapter.dispose,
      )
  }
}

export function installDiagramRuntime(
  context: DiagramRuntimeContext,
  deps: Partial<DiagramRuntimeDeps> = {},
): void {
  const adapters = deps.adapters ?? DIAGRAM_RUNTIME_ADAPTERS
  const installCache = deps.installCache ?? installRenderCache

  installHooks(context, adapters, 'configure')
  context.observers.set('render-cache', undefined)
  context.observers.set(
    'render-cache',
    installCache(context.app, context.postCacheMessage),
  )
  installHooks(context, adapters, 'attach-renderers')
  installHooks(context, adapters, 'attach-decoration-and-resize')
}
