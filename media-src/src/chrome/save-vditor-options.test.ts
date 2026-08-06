// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  handleToolbarClick,
  reportEditorMode,
  saveVditorOptions,
  setPersistModeOverride,
} from './toolbar-actions'

// Persistence allow-list (task 152 item 4): saveVditorOptions must persist ONLY the
// user-chosen editor mode — never the config-derived `preview`/`theme` blob that used
// to shadow live config.
describe('saveVditorOptions', () => {
  it('persists only the editor mode, not preview/theme', () => {
    const post = vi.fn()
    ;(window as unknown as { vscode: unknown }).vscode = { postMessage: post }
    ;(globalThis as unknown as { vditor: unknown }).vditor = {
      vditor: {
        currentMode: 'ir',
        // The (config-derived) state that must NOT be persisted any more:
        options: {
          theme: 'dark',
          preview: { hljs: { style: 'github', lineNumber: true } },
        },
      },
    }

    saveVditorOptions()

    expect(post).toHaveBeenCalledTimes(1)
    const msg = post.mock.calls[0][0] as {
      command: string
      options: Record<string, unknown>
    }
    expect(msg.command).toBe('save-options')
    expect(msg.options).toEqual({ mode: 'ir' })
    expect(msg.options).not.toHaveProperty('preview')
    expect(msg.options).not.toHaveProperty('theme')
  })
})

// Task 187: a streamed open forces the SESSION into IR (the stream writes the IR pane);
// that forcing must never leak into persistence — an unrelated panel click would stomp
// the user's saved sv/wysiwyg preference for every future file.
describe('persist-mode override (streamed-open forcing, task 187)', () => {
  function boot(currentMode: string) {
    const post = vi.fn()
    ;(window as unknown as { vscode: unknown }).vscode = { postMessage: post }
    ;(globalThis as unknown as { vditor: unknown }).vditor = {
      vditor: { currentMode },
    }
    return post
  }

  it('while forced, save-options persists the USER mode, not the session mode', () => {
    const post = boot('ir') // session forced into ir…
    setPersistModeOverride('sv') // …but the user's saved preference is sv
    saveVditorOptions()
    setPersistModeOverride(null) // cleanup for other tests
    expect(post.mock.calls[0][0].options).toEqual({ mode: 'sv' })
  })

  it('an explicit [data-mode] click clears the override (persist what the user picked)', () => {
    const post = boot('wysiwyg')
    setPersistModeOverride('sv')
    handleToolbarClick() // installs the capture-phase [data-mode] listener
    const toolbar = document.createElement('div')
    toolbar.className = 'vditor-toolbar'
    const btn = document.createElement('button')
    btn.setAttribute('data-mode', 'wysiwyg')
    toolbar.appendChild(btn)
    document.body.appendChild(toolbar)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    // The capture listener cleared the override synchronously.
    saveVditorOptions()
    expect(post.mock.calls[0][0].options).toEqual({ mode: 'wysiwyg' })
  })
})

// Task 187: the host status bar shows the REAL edit mode (sv must not read "WYSIWYG").
// reportEditorMode posts only for a recognized edit mode; an unknown/uninitialized mode
// must post nothing (else the status bar would show a garbage label).
describe('reportEditorMode', () => {
  function boot(currentMode: unknown) {
    const post = vi.fn()
    ;(window as unknown as { vscode: unknown }).vscode = { postMessage: post }
    ;(globalThis as unknown as { vditor: unknown }).vditor = {
      vditor: { currentMode },
    }
    return post
  }

  it.each(['ir', 'wysiwyg', 'sv'])(
    'posts the %s edit mode to the host',
    (mode) => {
      const post = boot(mode)
      reportEditorMode()
      expect(post).toHaveBeenCalledWith({ command: 'editorMode', mode })
    },
  )

  it('posts nothing for an unrecognized mode', () => {
    const post = boot('preview')
    reportEditorMode()
    expect(post).not.toHaveBeenCalled()
  })

  it('posts nothing when the mode is not yet initialized', () => {
    const post = boot(undefined)
    reportEditorMode()
    expect(post).not.toHaveBeenCalled()
  })
})
