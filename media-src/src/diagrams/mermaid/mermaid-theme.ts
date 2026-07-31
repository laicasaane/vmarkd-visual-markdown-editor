// User-configurable mermaid diagram theme. Vditor renders mermaid with
// theme='dark' iff its UI theme is dark and exposes no hook to override, so a
// plain flowchart in a dark editor looks monochrome. We wrap `mermaid.initialize`
// (whenever Vditor lazy-loads it and on every render call) to inject the chosen
// theme. `'auto'` / empty leaves Vditor's own behavior untouched — unless the active
// content theme pairs a palette (task 86), in which case we inject mermaid's `base`
// theme + that palette's themeVariables.
//
// Pure except for the `win` it's given — unit-tested with a fake window.

import {
  MERMAID_PALETTE_NAMES,
  MERMAID_PALETTES,
  paletteToThemeVariables,
} from '../../../../src/shared/mermaid-palettes'
import { pairedPalette } from '../../../../src/shared/theme-registry'
// Register the opt-in ELK layout loaders on the mermaid global when it appears (task 112). Imported
// here because this module owns the one interception of Vditor's lazy `window.mermaid = …` assignment.
import { registerMermaidElkLoaders } from './mermaid-elk'

/** Mermaid's customisable + built-in themes (no palette injection). */
const BUILTIN_THEMES = ['default', 'dark', 'forest', 'neutral'] as const

export const MERMAID_THEMES = [
  'auto',
  ...BUILTIN_THEMES,
  ...MERMAID_PALETTE_NAMES,
] as const
export type MermaidTheme = (typeof MERMAID_THEMES)[number]

/** What gets merged into `mermaid.initialize` — a theme name, optionally with vars. */
export interface MermaidInit {
  theme?: string
  themeVariables?: Record<string, string | boolean>
}

/**
 * Resolve the effective mermaid init from the setting + active content theme.
 * Precedence: explicit built-in → explicit palette → content-theme paired palette →
 * none (null → leave mermaid's own light/dark behavior). The `mode` is accepted for
 * symmetry with the code-theme resolver but pairing is purely content-theme driven.
 */
export function resolveMermaidInit(
  setting: string | undefined,
  contentTheme: string | undefined,
  _mode?: 'dark' | 'light',
): MermaidInit | null {
  if (setting && (BUILTIN_THEMES as readonly string[]).includes(setting)) {
    return { theme: setting }
  }
  if (setting && MERMAID_PALETTES[setting]) {
    return {
      theme: 'base',
      themeVariables: paletteToThemeVariables(MERMAID_PALETTES[setting]),
    }
  }
  // auto / empty / unknown → content-theme pairing, else nothing.
  const paired = pairedPalette(contentTheme)
  if (paired && MERMAID_PALETTES[paired]) {
    return {
      theme: 'base',
      themeVariables: paletteToThemeVariables(MERMAID_PALETTES[paired]),
    }
  }
  return null
}

/**
 * A stable string identity of the resolved mermaid init, for the theme-flip skip in
 * `rethemeDiagrams` (task 164 §1). A NON-null init (explicit/paired palette) is mode-INDEPENDENT —
 * `resolveMermaidInit` ignores `mode` for it — so a dark↔light flip re-renders to byte-identical
 * output; the signature is just the init. The `null` (auto) branch DOES depend on the effective
 * light/dark mode (it leaves mermaid's own binary behaviour), so fold the mode in there ONLY, else
 * auto diagrams would go stale across a flip. Equal signature ⇒ skipping `reRenderMermaid` is safe.
 */
export function mermaidInitSignature(
  init: MermaidInit | null,
  mode: 'dark' | 'light',
  layout?: string,
): string {
  const base = init === null ? `auto:${mode}` : JSON.stringify(init)
  // Layout (dagre|elk, task 112) is orthogonal to the theme but ALSO changes the SVG geometry, so a
  // layout flip must bust the signature — otherwise rethemeDiagrams would skip the re-render and leave
  // the old layout on screen. Only fold in the non-default 'elk', so every existing dagre signature
  // (and its stored `__vmarkdLastMermaidSig` value) is byte-unchanged.
  return layout === 'elk' ? `${base}|elk` : base
}

export function applyMermaidTheme(
  win: any,
  spec: string | MermaidInit | null | undefined,
): void {
  // Normalise: a bare string is a theme name (legacy callers); an object carries
  // theme + themeVariables; null/'auto'/undefined → no injection.
  let init: MermaidInit | null
  if (spec && typeof spec === 'object') init = spec
  else if (typeof spec === 'string') init = { theme: spec }
  else init = null
  const theme = init?.theme && init.theme !== 'auto' ? init.theme : null

  // Desired theme/vars kept on the window so the lazy-load setter always reads the
  // current value (re-init can change it before mermaid has even loaded).
  win.__vmarkdMermaidTheme = theme
  win.__vmarkdMermaidVars = init?.themeVariables ?? null

  const apply = (m: any) => {
    if (!m || typeof m.initialize !== 'function') return
    const orig = m.__vmarkdMermaidInit || m.initialize.bind(m)
    m.__vmarkdMermaidInit = orig
    const t = win.__vmarkdMermaidTheme
    const v = win.__vmarkdMermaidVars
    // Always wrap (task 112): besides theme/themeVariables, inject `config.layout` from the LIVE
    // `win.__vmarkdMermaidLayout` at each initialize call. Layout can flip without a theme change, so
    // reading it per-call (not baking it into the closure) keeps a live setting flip correct. Only the
    // non-default 'elk' is injected — dagre is mermaid's default, left unset — so a dagre doc's
    // initialize is byte-equivalent to the old orig path.
    m.initialize = (cfg: any) => {
      const layout = win.__vmarkdMermaidLayout === 'elk' ? 'elk' : null
      const result = orig({
        ...cfg,
        ...(t ? { theme: t } : {}),
        ...(v ? { themeVariables: v } : {}),
        ...(layout ? { layout } : {}),
      })
      // Register the ELK layout loaders AFTER mermaid's own initialize (task 112): mermaid lazily
      // (re)initialises its layout-algorithm registry on initialize and WIPES an earlier registration,
      // so registering in the load hook left `layout:'elk'` on the dagre fallback. Re-registering here
      // (after every initialize) keeps `elk` resolvable at render time; it is a plain overwrite (no
      // dupes/warnings) and a no-op until the loaders exist or off a real window (unit tests).
      registerMermaidElkLoaders()
      return result
    }
  }

  // Re-theme an already-loaded mermaid (covers re-init with a changed setting).
  if (win.mermaid) apply(win.mermaid)

  // Intercept Vditor's lazy `window.mermaid = …` assignment exactly once.
  if (!win.__vmarkdMermaidHook) {
    let current = win.mermaid
    try {
      Object.defineProperty(win, 'mermaid', {
        configurable: true,
        get() {
          return current
        },
        set(v) {
          current = v
          apply(v)
        },
      })
      win.__vmarkdMermaidHook = true
    } catch {
      // property non-configurable in this env — the eager apply above is best-effort
    }
  }
}
