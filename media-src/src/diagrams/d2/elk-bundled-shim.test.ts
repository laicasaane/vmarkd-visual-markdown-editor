// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Coverage-ratchet net (task 403 group 2) — this one, UNLIKE d2-entry.ts/mermaid-elk-entry.ts,
// has real branching logic (flagged explicitly in task 403 as worth reading before excluding):
// it's the drop-in `elkjs/lib/elk.bundled.js` replacement that delegates every `.layout()` call
// to the ONE shared main-thread ELK (window.__vmdeElk), booting it on demand if the caller
// (mermaid-layout-elk, which does NOT await our boot) got there first.
const h = vi.hoisted(() => ({ bootElk: vi.fn() }))
vi.mock('./boot-elk', () => ({ bootElk: h.bootElk }))

import ELK from './elk-bundled-shim'

describe('elk-bundled-shim (drop-in elkjs/lib/elk.bundled.js replacement, task 112)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as any).__vmdeElk
    delete (window as any).__vmdeCdn
  })

  it('delegates straight to the already-booted shared ELK, without booting again', async () => {
    const layout = vi.fn(() => Promise.resolve('LAID_OUT'))
    ;(window as any).__vmdeElk = { layout }
    const graph = { id: 'root' }
    const result = await new ELK().layout(graph)
    expect(result).toBe('LAID_OUT')
    expect(layout).toHaveBeenCalledWith(graph)
    expect(h.bootElk).not.toHaveBeenCalled()
  })

  it('boots the shared ELK (via window.__vmdeCdn) when not yet up, then delegates', async () => {
    const layout = vi.fn(() => Promise.resolve('LAID_OUT_AFTER_BOOT'))
    ;(window as any).__vmdeCdn = 'https://cdn.example'
    h.bootElk.mockResolvedValue({ layout })
    const graph = { id: 'root' }
    const result = await new ELK().layout(graph)
    expect(h.bootElk).toHaveBeenCalledWith('https://cdn.example')
    expect(layout).toHaveBeenCalledWith(graph)
    expect(result).toBe('LAID_OUT_AFTER_BOOT')
  })

  it('falls back to an empty cdn when window.__vmdeCdn is unset', async () => {
    h.bootElk.mockResolvedValue({ layout: vi.fn(() => Promise.resolve('X')) })
    await new ELK().layout({})
    expect(h.bootElk).toHaveBeenCalledWith('')
  })

  it('rejects when the shared engine cannot be booted (caller then falls back to its own default)', async () => {
    h.bootElk.mockResolvedValue(null)
    await expect(new ELK().layout({})).rejects.toThrow(
      'vmde: shared main-thread ELK unavailable',
    )
  })
})
