// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { ENGINES } from './engine-registry'

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
