// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Coverage-ratchet net (task 403 group 2). mermaid-elk-entry.ts is a lazy-bundle bridge: its only
// job is exposing the vendored mermaid-layout-elk package's default export (a
// LayoutLoaderDefinition[]) as window.__vmarkdMermaidElkLayouts for mermaid-elk.ts to hand to
// mermaid.registerLayoutLoaders(...). Pin the bridge itself (mermaid-theme.ts registration is
// covered by mermaid-elk.test.ts) — a wrong global name or a dropped export here silently breaks
// `vmarkd.diagram.mermaidLayout: elk` with no compile error.
const SENTINEL_LAYOUTS = [{ name: 'elk', loader: () => Promise.resolve({}) }]
vi.mock('../vendor/mermaid-layout-elk/mermaid-layout-elk.core.mjs', () => ({
  default: SENTINEL_LAYOUTS,
}))

describe('mermaid-elk-entry (lazy mermaid-ELK bundle bridge, task 112)', () => {
  beforeEach(() => {
    delete (window as any).__vmarkdMermaidElkLayouts
    vi.resetModules()
  })

  it('exposes the vendored layout-loader array via window.__vmarkdMermaidElkLayouts', async () => {
    await import('./mermaid-elk-entry')
    expect((window as any).__vmarkdMermaidElkLayouts).toBe(SENTINEL_LAYOUTS)
  })
})
