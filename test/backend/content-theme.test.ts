import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CONTENT_THEMES,
  NAMED_THEME_VALUES,
  isNamedTheme,
  resolveContentTheme,
} from '../../src/shared/theme-registry'

// `theme.content` migration + normalisation. The `vscode-*-modern` themes were renamed to
// `vscode-*-2026`; VS Code keeps a stale settings.json value after it leaves the manifest enum, so
// resolveContentTheme maps it at read time and folds any other unknown value to `auto` (avoids the
// broken in-between where `markdown-body` is applied but no theme stylesheet matches).
describe('resolveContentTheme (theme.content migration)', () => {
  it('empty / unset → auto', () => {
    expect(resolveContentTheme(undefined)).toBe('auto')
    expect(resolveContentTheme('')).toBe('auto')
    expect(resolveContentTheme('auto')).toBe('auto')
  })

  it('migrates the renamed vscode-*-modern themes to their -2026 names', () => {
    expect(resolveContentTheme('vscode-dark-modern')).toBe('vscode-dark-2026')
    expect(resolveContentTheme('vscode-light-modern')).toBe('vscode-light-2026')
  })

  it('passes through every currently-valid named theme unchanged', () => {
    for (const v of NAMED_THEME_VALUES) {
      expect(resolveContentTheme(v)).toBe(v)
    }
  })

  it('folds any other unknown value to auto (no broken in-between)', () => {
    expect(resolveContentTheme('garbage')).toBe('auto')
    expect(resolveContentTheme('vscode-dark-modern-x')).toBe('auto')
    expect(resolveContentTheme('GitHub-Dark')).toBe('auto') // case-sensitive
  })

  it('every migration target is a real, currently-registered named theme', () => {
    for (const target of ['vscode-dark-2026', 'vscode-light-2026']) {
      expect(isNamedTheme(target)).toBe(true)
    }
  })
})

// Task 443: the two vscode-*-2026 files are hand-maintained TWINS — the light one is a colour swap of
// the dark one — so a declaration added to only one of them is a silent, per-mode inconsistency (and
// the kind of drift no colour assertion catches). Pin the prose-typography contract in both: VS Code's
// preview leading (markdown.preview.lineHeight default 1.6, against Vditor's own 1.5) and its font
// stack (markdown.preview.fontFamily, whose leading "Segoe WPC" is absent from the GitHub stack
// main.css forces on named themes). The COMPUTED cascade is asserted by the harness spec
// (media-src/e2e/content-theme.spec.ts) and against VS Code's real preview by
// test/vscode-e2e/font-parity.spec.ts; this is the cheap both-files-agree gate.
describe('vscode-*-2026 prose typography contract (task 443)', () => {
  const vscodeThemes = CONTENT_THEMES.filter((t) =>
    t.value.startsWith('vscode-'),
  )

  it('covers both vscode themes', () => {
    expect(vscodeThemes.map((t) => t.value)).toEqual([
      'vscode-light-2026',
      'vscode-dark-2026',
    ])
  })

  for (const theme of vscodeThemes) {
    it(`${theme.value} declares the preview leading + font stack`, () => {
      const css = readFileSync(join(__dirname, '..', '..', theme.file), 'utf8')
      expect(css).toMatch(/line-height:\s*1\.6\s*;/)
      expect(css).toContain('"Segoe WPC"')
      // both must ride the same selector that out-ranks main.css's !important bridge
      expect(css).toContain('body.markdown-body .vditor .vditor-reset {')
    })
  }
})
