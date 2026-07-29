// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { Disposables } from './disposables'
import { ENGINES } from './engine-registry'
import type {
  DiagramRuntimeAdapter,
  DiagramRuntimeContext,
} from './diagram-runtime'

const sorted = (values: Iterable<string>) => Array.from(values).sort()

describe('diagram runtime adapter completeness', () => {
  it('implements every declared runtime engine and no unknown engine', async () => {
    ;(globalThis as Record<string, unknown>).VDITOR_VERSION = 'test'
    const { DIAGRAM_RUNTIME_ADAPTERS } = await import('./diagram-runtime')

    expect(sorted(Object.keys(DIAGRAM_RUNTIME_ADAPTERS))).toEqual(
      sorted(
        ENGINES.filter((engine) => engine.runtime?.length).map(
          (engine) => engine.lang,
        ),
      ),
    )
  })

  it('implements every lifecycle capability declared by each engine', async () => {
    ;(globalThis as Record<string, unknown>).VDITOR_VERSION = 'test'
    const { DIAGRAM_RUNTIME_ADAPTERS } = await import('./diagram-runtime')
    const hookFor = {
      render: 'render',
      fit: 'fit',
      resize: 'onResize',
      dispose: 'dispose',
    } as const

    for (const engine of ENGINES) {
      for (const capability of engine.runtime ?? []) {
        const hook = hookFor[capability]
        expect(
          typeof DIAGRAM_RUNTIME_ADAPTERS[engine.lang]?.[hook],
          `${engine.lang}.${hook}`,
        ).toBe('function')
      }
    }
  })
})

function context(observers = new Disposables()): DiagramRuntimeContext {
  return {
    app: document.createElement('div'),
    win: window,
    observers,
    postCacheMessage: vi.fn(),
  }
}

describe('installDiagramRuntime', () => {
  it('completes cache reservation synchronously before attaching renderers', async () => {
    const events: string[] = []
    const adapters: Record<string, DiagramRuntimeAdapter> = {
      echarts: {
        lang: 'echarts',
        onResize: () => {
          events.push('configure')
          return vi.fn()
        },
        phase: { onResize: 'configure' },
      },
      wavedrom: {
        lang: 'wavedrom',
        render: () => {
          expect(events).toContain('cache:end')
          events.push('render')
          return vi.fn()
        },
      },
      abc: {
        lang: 'abc',
        fit: () => {
          events.push('fit')
          return vi.fn()
        },
      },
      markmap: {
        lang: 'markmap',
        onResize: () => {
          events.push('resize')
          return vi.fn()
        },
      },
      mermaid: {
        lang: 'mermaid',
        dispose: () => {
          events.push('dispose')
        },
      },
    }
    const { installDiagramRuntime } = await import('./diagram-runtime')
    const runtimeContext = context()

    installDiagramRuntime(runtimeContext, {
      adapters,
      installCache: () => {
        events.push('cache:start')
        events.push('cache:end')
        return vi.fn()
      },
    })

    expect(events).toEqual([
      'configure',
      'cache:start',
      'cache:end',
      'render',
      'fit',
      'resize',
    ])
    runtimeContext.observers.disposeAll()
    expect(events.at(-1)).toBe('dispose')
  })

  it('installs a shared hook once per lifecycle kind', async () => {
    const sharedRender = vi.fn(() => vi.fn())
    const sharedResize = vi.fn(() => vi.fn())
    const adapters: Record<string, DiagramRuntimeAdapter> = {
      wavedrom: { lang: 'wavedrom', render: sharedRender },
      nomnoml: { lang: 'nomnoml', render: sharedRender },
      echarts: { lang: 'echarts', onResize: sharedResize },
      mindmap: { lang: 'mindmap', onResize: sharedResize },
    }
    const { installDiagramRuntime } = await import('./diagram-runtime')

    installDiagramRuntime(context(), {
      adapters,
      installCache: () => vi.fn(),
    })

    expect(sharedRender).toHaveBeenCalledOnce()
    expect(sharedResize).toHaveBeenCalledOnce()
  })

  it('runs the same function once for each distinct lifecycle kind', async () => {
    const sharedFitAndResize = vi.fn(() => vi.fn())
    const adapters: Record<string, DiagramRuntimeAdapter> = {
      mindmap: {
        lang: 'mindmap',
        fit: sharedFitAndResize,
        onResize: sharedFitAndResize,
      },
    }
    const { installDiagramRuntime } = await import('./diagram-runtime')

    installDiagramRuntime(context(), {
      adapters,
      installCache: () => vi.fn(),
    })

    expect(sharedFitAndResize).toHaveBeenCalledTimes(2)
  })

  it('disposes the previous runtime before replacing the same slots', async () => {
    const disposeCache = vi.fn()
    const disposeRender = vi.fn()
    const disposeResize = vi.fn()
    const observers = new Disposables()
    const adapters: Record<string, DiagramRuntimeAdapter> = {
      wavedrom: {
        lang: 'wavedrom',
        render: () => disposeRender,
      },
      markmap: {
        lang: 'markmap',
        onResize: () => disposeResize,
      },
    }
    const { installDiagramRuntime } = await import('./diagram-runtime')
    const runtimeContext = context(observers)
    const deps = {
      adapters,
      installCache: () => disposeCache,
    }

    installDiagramRuntime(runtimeContext, deps)
    expect(disposeCache).not.toHaveBeenCalled()
    expect(disposeRender).not.toHaveBeenCalled()
    expect(disposeResize).not.toHaveBeenCalled()

    installDiagramRuntime(runtimeContext, deps)

    expect(disposeCache).toHaveBeenCalledOnce()
    expect(disposeRender).toHaveBeenCalledOnce()
    expect(disposeResize).toHaveBeenCalledOnce()
  })

  it('finishes the old teardown before invoking a replacement hook', async () => {
    let active = 0
    const hook = vi.fn(() => {
      expect(active).toBe(0)
      active++
      return () => {
        active--
      }
    })
    const adapters: Record<string, DiagramRuntimeAdapter> = {
      markmap: { lang: 'markmap', onResize: hook },
    }
    const { installDiagramRuntime } = await import('./diagram-runtime')
    const runtimeContext = context()
    const deps = {
      adapters,
      installCache: () => vi.fn(),
    }

    installDiagramRuntime(runtimeContext, deps)
    installDiagramRuntime(runtimeContext, deps)

    expect(hook).toHaveBeenCalledTimes(2)
    expect(active).toBe(1)
  })
})
