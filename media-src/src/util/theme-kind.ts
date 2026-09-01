import type { ThemeKind } from '../../../src/shared/protocol'

export function themeMode(kind: ThemeKind | undefined): 'dark' | 'light' {
  return kind === 'dark' || kind === 'high-contrast' ? 'dark' : 'light'
}

export function isHighContrastTheme(kind: ThemeKind | undefined): boolean {
  return kind === 'high-contrast' || kind === 'high-contrast-light'
}

export function applyThemeKind(
  kind: ThemeKind | undefined,
  body: HTMLElement = document.body,
): void {
  body.classList.toggle('vscode-high-contrast', kind === 'high-contrast')
  body.classList.toggle(
    'vscode-high-contrast-light',
    kind === 'high-contrast-light',
  )
}
