import { describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Task 489 — the settings were regrouped and 17 keys renamed. Nothing type-checks a settings key
// string: read a key that isn't declared (a typo, a stale name, half of a future rename) and
// `WorkspaceConfiguration.get()` just returns undefined. The build is green, the tests are green,
// and the feature is silently off. Only a scan catches that, so scan.
//
// Deliberately NOT paired with a legacy-name fallback: 489's final decision (user, 2026-08-01) is
// that the old keys are simply gone — VS Code flags a leftover entry in settings.json as an unknown
// setting, which is the prompt to move it.
const SRC = fileURLToPath(new URL('../../src', import.meta.url))
const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
)

function readSites() {
  const sites: { file: string; key: string }[] = []
  for (const file of globSync('**/*.ts', { cwd: SRC })) {
    const src = readFileSync(`${SRC}/${file}`, 'utf8')
    for (const m of src.matchAll(/\.(?:get|inspect)<[^(]*>\('([^']+)'\)/g))
      sites.push({ file, key: m[1] })
  }
  return sites
}

describe('settings keys read in src/ (task 489)', () => {
  // The assertion below is `expect(offenders).toEqual([])`, which passes vacuously if the regex
  // stops matching. Pin the scan itself so a refactor of the read sites fails the guard instead of
  // quietly disarming it.
  it('the scan actually finds the read sites it is guarding', () => {
    const sites = readSites()
    expect(sites.length).toBeGreaterThan(30)
    expect(sites.some((s) => s.key === 'image.allowRemote')).toBe(true)
    expect(sites.some((s) => s.key === 'css.external')).toBe(true)
  })

  it('every key read is a declared setting in package.json', () => {
    const declared = new Set(
      pkg.contributes.configuration
        .flatMap((g: { properties: Record<string, unknown> }) =>
          Object.keys(g.properties),
        )
        .map((k: string) => k.replace(/^vmde\./, '')),
    )
    const offenders = readSites()
      .filter(({ key }) => {
        // editor-config.ts also reads VS Code's built-in Markdown Preview setting. It is intentionally
        // not declared by vmde, so validate it against VS Code's Markdown extension instead.
        if (key === 'preview.fontFamily') return false
        // wiki.ts reads through the NARROWER `vmde.wiki` section, so its literals are the tail of
        // the key ('enabled', 'root') — accept either form.
        if (declared.has(key) || declared.has(`wiki.${key}`)) return false
        // globalState/memento reads share the `.get<T>('…')` shape but are not settings.
        return key.includes('.') || /^[a-z]+$/.test(key)
      })
      .map((s) => `${s.file}: ${s.key}`)
    expect(offenders).toEqual([])
  })

  // The rename is only finished if the OLD names are gone from the source as well as the manifest.
  it('no pre-489 key name survives anywhere in src/ or package.json', () => {
    const gone = [
      'slugifyMode',
      'theme.highlightHeadings',
      'editor.linkOpenWithModifier',
      'paste.csvAsTable',
      'editor.pasteUrlAsLink',
      'image.allowRemoteImages',
      'outline.openByDefault',
      'outline.treeView',
      'advanced.streamLargeFiles',
      'advanced.contentVisibility',
      'diagram.mermaidLayout',
      'theme.mermaid',
      'diagram.d2Layout',
      'diagram.d2Sketch',
      'theme.d2',
      'theme.echarts',
      'theme.geoBasemap',
    ]
    const declared = new Set(
      pkg.contributes.configuration.flatMap(
        (g: { properties: Record<string, unknown> }) =>
          Object.keys(g.properties),
      ),
    )
    const read = new Set(readSites().map((s) => s.key))
    for (const old of gone) {
      expect(declared.has(`vmde.${old}`), `${old} still declared`).toBe(false)
      // `slugifyMode` is also a plain identifier; only the KEY form matters here.
      expect(read.has(old), `${old} still read`).toBe(false)
    }
  })

  it('no setting is declared with a deprecationMessage', () => {
    const deprecated = pkg.contributes.configuration
      .flatMap((g: { properties: Record<string, any> }) =>
        Object.entries(g.properties),
      )
      .filter(([, d]: [string, any]) => d.deprecationMessage)
      .map(([k]: [string, any]) => k)
    expect(deprecated).toEqual([])
  })
})
