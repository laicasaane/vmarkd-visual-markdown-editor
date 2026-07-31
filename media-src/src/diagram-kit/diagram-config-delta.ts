// Task 408 — unifies three previously hand-maintained "what does a config change affect"
// enumerations: message-router.ts's handleConfigChanged (8 hand-written `xxxChanged` booleans),
// diagram-retheme.ts's grouping (which this feeds via rethemeFlagsFor), and render-cache-client's
// single global themeKey (which this narrows to a per-engine fragment via engineCacheKeyFragment).
// Pure, engine-registry-driven — no DOM, no Vditor import, easy to unit test exhaustively.
import type { VmarkdConfigOptions } from '../../src/protocol'
import {
  DIAGRAM_CONFIG_KEYS,
  ENGINES,
  type RethemeStrategy,
} from './engine-registry'

// `contentTheme`/`codeTheme` are tracked alongside the engines' own DIAGRAM_CONFIG_KEYS because
// message-router.ts's rethemeDiagrams call needs both: contentTheme is the one GLOBAL trigger that
// flips every diagram engine regardless of its own configKeys (a palette/mode change repaints
// everything), and codeTheme drives the separate `code` (hljs) flag, which isn't a diagram engine
// at all. Neither belongs in DIAGRAM_CONFIG_KEYS (that list is per-engine OWNERSHIP, and no single
// engine owns either of these) but both must still be diffed the same way.
const TRACKED_KEYS = [
  ...DIAGRAM_CONFIG_KEYS,
  'contentTheme',
  'codeTheme',
] as const
type TrackedKey = (typeof TRACKED_KEYS)[number]

export interface DiagramConfigDelta {
  /** The exact tracked keys whose value differs between prev and next. */
  changed: ReadonlySet<TrackedKey>
}

// Diff two config snapshots over TRACKED_KEYS only — every other VmarkdConfigOptions field is
// irrelevant to diagram rendering/caching (see diagram-config-delta.test.ts's exhaustiveness net,
// which pins that irrelevance as a conscious classification, not an oversight). `next` is always
// the FULL current config in practice (collectConfigOptions/panel-config.ts builds every field
// every time — verified, not assumed), so a plain `!==` comparison is correct without an `in`
// presence guard.
export function diagramConfigDelta(
  prev: VmarkdConfigOptions | undefined,
  next: VmarkdConfigOptions | undefined,
): DiagramConfigDelta {
  const changed = new Set<TrackedKey>()
  for (const key of TRACKED_KEYS) {
    if (prev?.[key] !== next?.[key]) changed.add(key)
  }
  return { changed }
}

export interface RethemeEngineFlags {
  mermaid: boolean
  echarts: boolean
  flowchart: boolean
  vega: boolean
  smiles: boolean
  monoGroup: boolean
  geo: boolean
  d2: boolean
}

// retheme strategy → rethemeDiagrams' flag name (the registry's strategy tag and the flags object
// use different words in one spot: the registry calls the graphviz/plantuml/abc/wavedrom/nomnoml
// group 'mono', rethemeDiagrams calls it monoGroup — 'none' has no flag, markmap/math/stl are inert).
const STRATEGY_FLAG: Record<
  Exclude<RethemeStrategy, 'none'>,
  keyof RethemeEngineFlags
> = {
  mermaid: 'mermaid',
  echarts: 'echarts',
  flowchart: 'flowchart',
  vega: 'vega',
  smiles: 'smiles',
  mono: 'monoGroup',
  geo: 'geo',
  d2: 'd2',
}

// Derive rethemeDiagrams' 8 diagram flags from a delta: a group re-themes when contentTheme
// changed (global — every engine reacts to a palette/mode flip) OR when ANY engine sharing that
// retheme strategy has one of ITS OWN configKeys in the delta (e.g. only d2Layout/d2Theme/d2Sketch
// changing flips 'd2' alone, without touching mermaid/vega/etc). Replaces the 8 hand-written
// `xxxChanged || contentThemeChanged` expressions in message-router.ts's handleConfigChanged.
export function rethemeFlagsFor(delta: DiagramConfigDelta): RethemeEngineFlags {
  const contentThemeChanged = delta.changed.has('contentTheme')
  const ownChanged = (strategy: RethemeStrategy): boolean =>
    ENGINES.some(
      (e) =>
        e.retheme === strategy &&
        e.configKeys.some((k) => delta.changed.has(k)),
    )
  const flags = {} as RethemeEngineFlags
  for (const [strategy, flag] of Object.entries(STRATEGY_FLAG) as [
    Exclude<RethemeStrategy, 'none'>,
    keyof RethemeEngineFlags,
  ][]) {
    flags[flag] = contentThemeChanged || ownChanged(strategy)
  }
  return flags
}

// Per-engine render-cache-key fragment (task 408): folds ONLY the settings this engine's own
// `configKeys` names, in declared order, `|`-joined — the same shape as vditor-init.ts's (now
// reduced) global renderCacheThemeKey, but scoped to one lang. An engine with no own configKeys
// (most of them — see engine-registry.ts) always returns '', so its cache key is unaffected by
// ANY diagram setting; only the global fragment (mode/contentTheme/fontSize) can miss it. An
// unrecognised lang also returns '' (render-cache-client.ts's CACHEABLE_LANGS is always registry-
// derived, so this only fires for a genuinely unknown lang, not a live gap).
export function engineCacheKeyFragment(
  lang: string,
  options: VmarkdConfigOptions | undefined,
): string {
  const engine = ENGINES.find((e) => e.lang === lang)
  const keys = engine?.configKeys ?? []
  return keys.map((k) => String(options?.[k] ?? '')).join('|')
}
