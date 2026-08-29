import { beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import {
  appendRawLine,
  debug,
  initLogger,
  showError,
} from '../../src/platform/host-log'
import { mock } from './vscode-mock'

// Extracted from src/extension.ts (task 405): the levelled log channel + the two thin
// wrappers (debug/showError) that used to be free functions closing over a module-local
// `logger` variable. Behaviour must be byte-for-byte unchanged — only the seam moved.
describe('host-log', () => {
  beforeEach(() => mock.reset())

  it('debug() is a no-op before initLogger() is called', () => {
    expect(() => debug('hello')).not.toThrow()
  })

  it('debug() routes joined args to the channel at trace level', () => {
    const channel = vscode.window.createOutputChannel('VMDE', { log: true })
    initLogger(channel as any)
    debug('msg from webview review', { command: 'ready' }, true)
    const record = (mock.calls as any).outputChannels[0]
    expect(record.logs).toEqual([
      {
        level: 'trace',
        message: 'msg from webview review {"command":"ready"} true',
      },
    ])
  })

  it('debug() falls back to String() when JSON.stringify throws (circular arg)', () => {
    const channel = vscode.window.createOutputChannel('VMDE', { log: true })
    initLogger(channel as any)
    const circular: any = {}
    circular.self = circular
    debug(circular)
    const record = (mock.calls as any).outputChannels[0]
    expect(record.logs[0].message).toBe(String(circular))
  })

  it('showError() prefixes and shows an error message', () => {
    showError('boom')
    expect(mock.calls.showError).toEqual(['[VMDE] boom'])
  })

  it('appendRawLine() is a no-op before initLogger(), forwards after', () => {
    expect(() => appendRawLine('nope')).not.toThrow()
    const channel = vscode.window.createOutputChannel('VMDE', { log: true })
    initLogger(channel as any)
    appendRawLine('hello log')
    const record = (mock.calls as any).outputChannels[0]
    expect(record.logs).toEqual([{ level: 'append', message: 'hello log' }])
  })
})
