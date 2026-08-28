// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  applyPreviewReflowSetting,
  initOnlyChanged,
  INIT_ONLY_OPTIONS,
  previewMarkdownWithHardBreaks,
  resolveFontSize,
} from './live-config'

afterEach(() => {
  delete (window as any).__vmarkdReflowPreview
  ;(window as any).vditor = undefined
})

describe('applyPreviewReflowSetting (task 83)', () => {
  function preview(display: string) {
    const render = vi.fn()
    const element = document.createElement('div')
    element.style.display = display
    const inner = {
      preview: {
        element,
        render,
      },
    }
    ;(window as any).vditor = { vditor: inner }
    return { inner, render }
  }

  it('stores the opt-in flag and re-renders an already-visible preview once', () => {
    const { inner, render } = preview('block')

    applyPreviewReflowSetting(true)

    expect((window as any).__vmarkdReflowPreview).toBe(true)
    expect(render).toHaveBeenCalledWith(inner)
    applyPreviewReflowSetting(true)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('updates a hidden preview without rendering it', () => {
    ;(window as any).__vmarkdReflowPreview = true
    const { render } = preview('none')

    applyPreviewReflowSetting(false)

    expect((window as any).__vmarkdReflowPreview).toBe(false)
    expect(render).not.toHaveBeenCalled()
  })
})

describe('previewMarkdownWithHardBreaks (task 83)', () => {
  function editor(mode: 'ir' | 'wysiwyg' | 'sv') {
    const element = document.createElement('div')
    element.innerHTML =
      '<p>alpha\nbeta</p><p>gamma<br>delta</p><p><br></p><p>VMARKD_HARD_BREAK_83</p>'
    const VditorIRDOM2Md = vi.fn((html: string) => html)
    const VditorDOM2Md = vi.fn((html: string) => html)
    return {
      element,
      vditor: {
        currentMode: mode,
        ir: { element },
        wysiwyg: { element },
        lute: { VditorIRDOM2Md, VditorDOM2Md },
      },
      VditorIRDOM2Md,
      VditorDOM2Md,
    }
  }

  it('marks only inline IR hard breaks in a detached clone and avoids marker collisions', () => {
    ;(window as any).__vmarkdReflowPreview = true
    const { element, vditor, VditorIRDOM2Md, VditorDOM2Md } = editor('ir')
    const original = element.innerHTML

    const markdown = previewMarkdownWithHardBreaks(vditor)

    expect(markdown).toContain('gamma  \ndelta')
    expect(markdown).toContain('<p><br></p>')
    expect(markdown).toContain('VMARKD_HARD_BREAK_83')
    expect(element.innerHTML).toBe(original)
    expect(VditorIRDOM2Md).toHaveBeenCalledOnce()
    expect(VditorDOM2Md).not.toHaveBeenCalled()
  })

  it('routes WYSIWYG through VditorDOM2Md', () => {
    ;(window as any).__vmarkdReflowPreview = true
    const { vditor, VditorIRDOM2Md, VditorDOM2Md } = editor('wysiwyg')

    expect(previewMarkdownWithHardBreaks(vditor)).toContain('gamma  \ndelta')
    expect(VditorDOM2Md).toHaveBeenCalledOnce()
    expect(VditorIRDOM2Md).not.toHaveBeenCalled()
  })

  it('falls back to Vditor getMarkdown when disabled or in source mode', () => {
    const ir = editor('ir')
    ;(window as any).__vmarkdReflowPreview = false
    expect(previewMarkdownWithHardBreaks(ir.vditor)).toBeUndefined()
    expect(ir.VditorIRDOM2Md).not.toHaveBeenCalled()

    const sv = editor('sv')
    ;(window as any).__vmarkdReflowPreview = true
    expect(previewMarkdownWithHardBreaks(sv.vditor)).toBeUndefined()
    expect(sv.VditorIRDOM2Md).not.toHaveBeenCalled()
    expect(sv.VditorDOM2Md).not.toHaveBeenCalled()
  })
})

describe('initOnlyChanged', () => {
  it('is false when no constructor-only option changed', () => {
    const opts = {
      showToolbar: true,
      wordCount: false,
      highlightHeadings: true,
    }
    // highlightHeadings flips, but it is a live body-attr option, not init-only
    expect(initOnlyChanged(opts, { ...opts, highlightHeadings: false })).toBe(
      false,
    )
  })

  it('is true when a constructor-only option changed', () => {
    const opts = { showToolbar: true, wordCount: false }
    expect(initOnlyChanged(opts, { ...opts, showToolbar: false })).toBe(true)
    expect(initOnlyChanged(opts, { ...opts, wordCount: true })).toBe(true)
  })

  it('covers the documented init-only keys', () => {
    expect(INIT_ONLY_OPTIONS).toContain('showToolbar')
    expect(INIT_ONLY_OPTIONS).toContain('wordCount')
    expect(INIT_ONLY_OPTIONS).toContain('outlinePosition')
    // mermaidTheme is applied LIVE (no re-init) — must NOT be init-only, else changing it
    // rebuilds the editor and scrolls a big doc to the top.
    expect(INIT_ONLY_OPTIONS).not.toContain('mermaidTheme')
  })

  it('does not list fontSize (it is a live body/CSS-var option, not init-only)', () => {
    expect(INIT_ONLY_OPTIONS).not.toContain('fontSize')
  })
})

describe('resolveFontSize (task 43)', () => {
  const VSCODE = 'var(--vscode-editor-font-size, 14px)'

  it('follows VS Code for "editor", empty, and unset', () => {
    expect(resolveFontSize('editor')).toBe(VSCODE)
    expect(resolveFontSize('')).toBe(VSCODE)
    expect(resolveFontSize(undefined)).toBe(VSCODE)
  })

  it('keeps Vditor\'s 16px for "vditor"', () => {
    expect(resolveFontSize('vditor')).toBe('16px')
  })

  it('uses an explicit pixel size for a number or numeric string', () => {
    expect(resolveFontSize(15)).toBe('15px')
    expect(resolveFontSize('13')).toBe('13px')
    expect(resolveFontSize('17.5')).toBe('17.5px')
  })

  it('falls back to the VS Code size for garbage or non-positive values', () => {
    expect(resolveFontSize('nonsense')).toBe(VSCODE)
    expect(resolveFontSize('0')).toBe(VSCODE)
    expect(resolveFontSize('-4')).toBe(VSCODE)
  })

  // task 82: a GitHub content theme reads at GitHub's 16px by default (unset/"editor"),
  // but an explicit size still wins so the `fontSize` setting scales it.
  it('defaults a GitHub theme to 16px, but an explicit size still wins', () => {
    expect(resolveFontSize('editor', 'github-light')).toBe('16px')
    expect(resolveFontSize(undefined, 'github-dark')).toBe('16px')
    expect(resolveFontSize('nonsense', 'github-light')).toBe('16px')
    expect(resolveFontSize(20, 'github-light')).toBe('20px') // explicit wins
    // non-GitHub themes keep the VS Code editor size default
    expect(resolveFontSize('editor', 'vscode-dark-2026')).toBe(VSCODE)
    expect(resolveFontSize(undefined, 'material-dark')).toBe(VSCODE)
  })
})
