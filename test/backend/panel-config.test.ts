import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelConfigController } from '../../src/webview-host/panel-config'
import { mock, Uri } from './vscode-mock'

// Task 405 — postExternalCss/postLiveConfig/refreshExternalCssWatchers extracted out of
// EditorSession into their own unit. The controller does NOT own the panel's
// `disposables` array (that stays in EditorSession) — refreshExternalCssWatchers()
// RETURNS the new watcher disposable (or undefined) so the caller decides whether/where
// to register it, matching the original method's exact push-only-when-created behaviour.
describe('PanelConfigController', () => {
  beforeEach(() => mock.reset())

  function makeController(activeUri = Uri.file('/ws/note.md')) {
    const postMessage = vi.fn()
    const ctrl = new PanelConfigController({
      getActiveUri: () => activeUri,
      postMessage,
    })
    return { ctrl, postMessage }
  }

  it('postExternalCss() posts the resolved external CSS under id "external-css"', () => {
    mock.setConfig({ 'css.external': [] })
    const { ctrl, postMessage } = makeController()
    ctrl.postExternalCss()
    expect(postMessage).toHaveBeenCalledWith({
      command: 'reload-css',
      id: 'external-css',
      css: '',
    })
  })

  it('postLiveConfig() posts config-changed + custom-css + external-css, in that order', () => {
    mock.setConfig({ 'css.custom': 'body{color:red}', 'css.external': [] })
    const { ctrl, postMessage } = makeController()
    ctrl.postLiveConfig()
    expect(postMessage).toHaveBeenCalledTimes(3)
    expect(postMessage.mock.calls[0][0].command).toBe('config-changed')
    expect(postMessage.mock.calls[1][0]).toEqual({
      command: 'reload-css',
      id: 'custom-css',
      css: 'body{color:red}',
    })
    expect(postMessage.mock.calls[2][0].id).toBe('external-css')
  })

  it('refreshExternalCssWatchers() returns undefined when there are no external CSS files', () => {
    mock.setConfig({ 'css.external': [] })
    const { ctrl } = makeController()
    expect(ctrl.refreshExternalCssWatchers()).toBeUndefined()
  })

  it('refreshExternalCssWatchers() creates a watcher per resolved path and disposes the previous set on re-call', () => {
    mock.setWorkspaceFolder('/ws')
    mock.setConfig({ 'css.external': ['a.css', 'b.css'] })
    const { ctrl } = makeController()
    const first = ctrl.refreshExternalCssWatchers()
    expect(first).toBeDefined()
    expect(mock.calls.fileSystemWatchers).toHaveLength(2)
    const firstWatchers = [...mock.calls.fileSystemWatchers]

    // Re-call disposes the old watcher set and creates a fresh one.
    mock.setConfig({ 'css.external': ['a.css'] })
    ctrl.refreshExternalCssWatchers()
    expect(firstWatchers.every((w) => w.disposed)).toBe(true)
    expect(mock.calls.fileSystemWatchers).toHaveLength(3)
  })

  it('a watched external CSS file change re-posts external-css', () => {
    mock.setWorkspaceFolder('/ws')
    mock.setConfig({ 'css.external': ['a.css'] })
    const { ctrl, postMessage } = makeController()
    ctrl.refreshExternalCssWatchers()
    const watcher = mock.calls.fileSystemWatchers[0]
    watcher.fireChange()
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'reload-css', id: 'external-css' }),
    )
  })

  it('a watched external CSS file create/delete also re-posts external-css', () => {
    mock.setWorkspaceFolder('/ws')
    mock.setConfig({ 'css.external': ['a.css'] })
    const { ctrl, postMessage } = makeController()
    ctrl.refreshExternalCssWatchers()
    const watcher = mock.calls.fileSystemWatchers[0]
    watcher.fireCreate()
    watcher._fireDelete(Uri.file('/ws/a.css'))
    expect(postMessage).toHaveBeenCalledTimes(2)
  })
})
