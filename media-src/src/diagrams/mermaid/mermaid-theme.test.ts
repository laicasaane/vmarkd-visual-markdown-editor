// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  applyMermaidTheme,
  MERMAID_THEMES,
  mermaidInitSignature,
  resolveMermaidInit,
} from './mermaid-theme'

function fakeWin(mermaid?: any) {
  return { mermaid } as any
}

describe('applyMermaidTheme', () => {
  it('injects the chosen theme into an already-loaded mermaid.initialize', () => {
    let seen: any
    const win = fakeWin({ initialize: (cfg: any) => (seen = cfg) })
    applyMermaidTheme(win, 'forest')
    win.mermaid.initialize({ securityLevel: 'loose' })
    expect(seen).toEqual({ securityLevel: 'loose', theme: 'forest' })
  })

  it('wraps mermaid that is assigned later (Vditor lazy-loads it)', () => {
    let seen: any
    const win = fakeWin(undefined)
    applyMermaidTheme(win, 'neutral')
    win.mermaid = { initialize: (cfg: any) => (seen = cfg) } // lazy assignment
    win.mermaid.initialize({ a: 1 })
    expect(seen).toEqual({ a: 1, theme: 'neutral' })
  })

  it('leaves initialize untouched for "auto" / empty', () => {
    let seen: any
    const win = fakeWin({ initialize: (cfg: any) => (seen = cfg) })
    applyMermaidTheme(win, 'auto')
    win.mermaid.initialize({ a: 1 })
    expect(seen).toEqual({ a: 1 }) // no theme injected
    applyMermaidTheme(win, undefined)
    win.mermaid.initialize({ b: 2 })
    expect(seen).toEqual({ b: 2 })
  })

  it('re-themes on a later call without double-wrapping the original', () => {
    const calls: any[] = []
    const win = fakeWin({ initialize: (cfg: any) => calls.push(cfg) })
    applyMermaidTheme(win, 'forest')
    applyMermaidTheme(win, 'dark') // setting changed → re-init
    win.mermaid.initialize({ x: 1 })
    expect(calls).toEqual([{ x: 1, theme: 'dark' }]) // latest theme, single wrap
  })

  it('can fall back from a forced theme to auto (restores original)', () => {
    let seen: any
    const win = fakeWin({ initialize: (cfg: any) => (seen = cfg) })
    applyMermaidTheme(win, 'dark')
    applyMermaidTheme(win, 'auto')
    win.mermaid.initialize({ a: 1 })
    expect(seen).toEqual({ a: 1 }) // theme injection removed
  })

  it('injects a palette via base theme + themeVariables (object spec)', () => {
    let seen: any
    const win = fakeWin({ initialize: (cfg: any) => (seen = cfg) })
    applyMermaidTheme(win, {
      theme: 'base',
      themeVariables: { background: '#0d1117', darkMode: true },
    })
    win.mermaid.initialize({ securityLevel: 'loose' })
    expect(seen).toEqual({
      securityLevel: 'loose',
      theme: 'base',
      themeVariables: { background: '#0d1117', darkMode: true },
    })
  })

  it('null spec leaves initialize untouched', () => {
    let seen: any
    const win = fakeWin({ initialize: (cfg: any) => (seen = cfg) })
    applyMermaidTheme(win, null)
    win.mermaid.initialize({ a: 1 })
    expect(seen).toEqual({ a: 1 })
  })

  it('injects config.layout="elk" alongside the theme (task 112)', () => {
    let seen: any
    const win = fakeWin({ initialize: (cfg: any) => (seen = cfg) })
    win.__vmdeMermaidLayout = 'elk'
    applyMermaidTheme(win, 'forest')
    win.mermaid.initialize({ a: 1 })
    expect(seen).toEqual({ a: 1, theme: 'forest', layout: 'elk' })
  })

  it('reads the layout global LIVE per initialize call — elk with no theme, nothing for dagre/unset', () => {
    let seen: any
    const win = fakeWin({ initialize: (cfg: any) => (seen = cfg) })
    applyMermaidTheme(win, 'auto') // no theme injected
    // elk → layout only (proves the wrapper reads the global at call time, not apply time).
    win.__vmdeMermaidLayout = 'elk'
    win.mermaid.initialize({ a: 1 })
    expect(seen).toEqual({ a: 1, layout: 'elk' })
    // dagre = mermaid's default → nothing injected.
    win.__vmdeMermaidLayout = 'dagre'
    win.mermaid.initialize({ b: 2 })
    expect(seen).toEqual({ b: 2 })
    // unset → nothing injected.
    win.__vmdeMermaidLayout = undefined
    win.mermaid.initialize({ c: 3 })
    expect(seen).toEqual({ c: 3 })
  })

  it('exposes auto + the built-in mermaid themes + the palettes', () => {
    expect(MERMAID_THEMES).toContain('auto')
    expect(MERMAID_THEMES).toContain('forest')
    expect(MERMAID_THEMES).toContain('default')
    expect(MERMAID_THEMES).toContain('github-dark')
    expect(MERMAID_THEMES).toContain('dracula')
  })
})

describe('resolveMermaidInit', () => {
  it('built-in setting → theme only, no themeVariables', () => {
    expect(resolveMermaidInit('forest', undefined)).toEqual({ theme: 'forest' })
    expect(resolveMermaidInit('dark', 'github-light')).toEqual({
      theme: 'dark',
    })
  })

  it('explicit palette → base + themeVariables (wins over content pairing)', () => {
    const init = resolveMermaidInit('dracula', 'github-light')
    expect(init?.theme).toBe('base')
    expect(init?.themeVariables?.background).toBe('#282a36')
  })

  it('accessibility palette overrides explicit and paired themes', () => {
    const init = resolveMermaidInit('forest', 'github-dark', 'dark', {
      bg: '#000000',
      fg: '#ffffff',
      line: '#ffff00',
      accent: '#ffffff',
      muted: '#ffff00',
    })
    expect(init?.theme).toBe('base')
    expect(init?.themeVariables).toMatchObject({
      background: '#000000',
      primaryTextColor: '#ffffff',
      lineColor: '#ffff00',
    })
  })

  it('auto + paired content theme → that palette', () => {
    const gh = resolveMermaidInit('auto', 'github-dark')
    expect(gh?.theme).toBe('base')
    expect(gh?.themeVariables?.background).toBe('#0d1117')
    // vscode/material are paired too (vscode-dark-2026 / one-dark)
    const vs = resolveMermaidInit('auto', 'vscode-dark-2026')
    expect(vs?.theme).toBe('base')
    expect(vs?.themeVariables?.background).toBe('#121314') // vscode-dark-2026 page bg
  })

  it('auto + unpaired/unknown content theme → null (mermaid keeps its own light/dark)', () => {
    expect(resolveMermaidInit('auto', 'no-such-theme')).toBeNull()
    expect(resolveMermaidInit('auto', undefined)).toBeNull()
    expect(resolveMermaidInit(undefined, undefined)).toBeNull()
  })
})

// The theme-flip skip in rethemeDiagrams (task 164 §1) hinges on this signature: same signature ⇒
// same SVG ⇒ skip reRenderMermaid.
describe('mermaidInitSignature', () => {
  it('a non-null (paired/explicit) init is mode-INDEPENDENT — identical across a dark↔light flip', () => {
    const init = resolveMermaidInit('auto', 'github-dark')
    expect(init).not.toBeNull()
    // Same init object, different mode → SAME signature (so the flip is a no-op re-render).
    expect(mermaidInitSignature(init, 'dark')).toBe(
      mermaidInitSignature(init, 'light'),
    )
  })

  it('a built-in/explicit setting is likewise mode-independent', () => {
    const forest = resolveMermaidInit('forest', undefined)
    expect(mermaidInitSignature(forest, 'dark')).toBe(
      mermaidInitSignature(forest, 'light'),
    )
  })

  it('the auto (null) branch DOES fold in the mode — differs across a flip so auto stays fresh', () => {
    expect(mermaidInitSignature(null, 'dark')).toBe('auto:dark')
    expect(mermaidInitSignature(null, 'light')).toBe('auto:light')
    expect(mermaidInitSignature(null, 'dark')).not.toBe(
      mermaidInitSignature(null, 'light'),
    )
  })

  it('different palettes → different signatures (a real theme change still re-renders)', () => {
    const github = resolveMermaidInit('auto', 'github-dark')
    const dracula = resolveMermaidInit('dracula', undefined)
    expect(mermaidInitSignature(github, 'dark')).not.toBe(
      mermaidInitSignature(dracula, 'dark'),
    )
  })

  it('folds the layout in (task 112): elk busts the sig; dagre == the 2-arg default', () => {
    const init = resolveMermaidInit('forest', undefined)
    // dagre is mermaid's default → identical to the layout-less signature (existing stored values stay valid).
    expect(mermaidInitSignature(init, 'dark', 'dagre')).toBe(
      mermaidInitSignature(init, 'dark'),
    )
    // elk changes the geometry → must differ so rethemeDiagrams re-renders on a layout flip.
    expect(mermaidInitSignature(init, 'dark', 'elk')).not.toBe(
      mermaidInitSignature(init, 'dark', 'dagre'),
    )
    // The auto (null-init) branch too.
    expect(mermaidInitSignature(null, 'dark', 'elk')).toBe('auto:dark|elk')
  })
})

describe('C4 colour hook (task 507)', () => {
  // Mermaid emits its C4 boxes + #FFFFFF labels inline; the hook is installed on the window and
  // resolved per CALL, because Vditor's render theme flips without applyMermaidTheme running again.
  const c4Host = () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <svg aria-roledescription="c4">
        <g><rect fill="#08427B"></rect><text fill="#FFFFFF">User</text></g>
        <g><rect fill="#85BBF0"></rect><text fill="#FFFFFF">DB</text></g>
        <text fill="#444444">Uses</text>
        <line stroke="#444444"></line>
      </svg>`
    return host
  }
  const fill = (host: ParentNode, i: number) =>
    host.querySelectorAll('rect')[i]?.getAttribute('fill')
  const ink = (host: ParentNode, txt: string) =>
    [...host.querySelectorAll('text')]
      .find((t) => t.textContent === txt)
      ?.getAttribute('fill')

  it('a LIGHT palette keeps its own ramp even when Vditor renders dark', () => {
    const win = fakeWin()
    applyMermaidTheme(win, resolveMermaidInit('vscode-light-2026', undefined))
    const host = c4Host()
    win.__vmdeStyleMermaidC4(host, 'dark')

    // The palette decides its darkness — pairing a dark box ramp with that palette's dark
    // relationship labels would be the worst of both.
    expect(fill(host, 0)).toBe('#08427B')
    expect(fill(host, 1)).toBe('#85BBF0')
    expect(ink(host, 'DB')).toBe('#0d1b2a')
    expect(ink(host, 'Uses')).toBe('#202020')
  })

  it('no palette + a dark render theme → dark ramp and readable relationships', () => {
    const win = fakeWin()
    applyMermaidTheme(win, resolveMermaidInit(undefined, undefined))
    const host = c4Host()
    win.__vmdeStyleMermaidC4(host, 'dark')

    expect(fill(host, 0)).toBe('#062b50')
    expect(ink(host, 'User')).toBe('#ffffff')
    expect(ink(host, 'Uses')).toBe('#d4d4d4')
    expect(host.querySelector('line')?.getAttribute('stroke')).toBe('#8ab4f8')
  })

  it('no palette + a light render theme → only the unreadable in-box ink is fixed', () => {
    const win = fakeWin()
    applyMermaidTheme(win, resolveMermaidInit(undefined, undefined))
    const host = c4Host()
    win.__vmdeStyleMermaidC4(host, 'light')

    expect(fill(host, 1)).toBe('#85BBF0')
    expect(ink(host, 'DB')).toBe('#0d1b2a')
    expect(ink(host, 'Uses')).toBe('#444444')
  })
})
