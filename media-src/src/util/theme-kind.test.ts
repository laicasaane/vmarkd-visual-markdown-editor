// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { applyThemeKind, themeMode } from './theme-kind'

describe('four-value workbench theme kind', () => {
  beforeEach(() => {
    document.body.className = ''
  })

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['high-contrast', 'dark'],
    ['high-contrast-light', 'light'],
  ] as const)('maps %s to Vditor mode %s', (kind, mode) => {
    expect(themeMode(kind)).toBe(mode)
  })

  it('keeps exactly the active high-contrast body class', () => {
    applyThemeKind('high-contrast', document.body)
    expect(document.body.classList.contains('vscode-high-contrast')).toBe(true)
    expect(document.body.classList.contains('vscode-high-contrast-light')).toBe(
      false,
    )

    applyThemeKind('high-contrast-light', document.body)
    expect(document.body.classList.contains('vscode-high-contrast')).toBe(false)
    expect(document.body.classList.contains('vscode-high-contrast-light')).toBe(
      true,
    )
  })
})
