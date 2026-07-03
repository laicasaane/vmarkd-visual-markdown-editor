import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { mock } from './vscode-mock'

// The webview→disk write-back is the corruption-critical link: a wrong `toWrite` or a
// mishandled applyEdit failure silently loses the user's edit or marks disk reconciled
// while it still holds the old bytes (task 151 item 2). WritebackController's OWN branching
// — the MINDIFF_CAP full-write bypass, the applyEdit-returned-false recovery, the
// echo-suppression flag ordering, and the no-op short-circuits — had no unit coverage
// (task 190 P0). Collaborators are mocked so those branches, not the diff algorithm
// (covered by minimal-diff-writeback.test.ts) or Lute (needs the vm host), are under test.
vi.mock('../../src/lute-host', () => ({
  // Cold Lute: reserialize unavailable → the controller must fall back safely.
  reserializeMarkdown: vi.fn(() => undefined),
}))
vi.mock('../../src/minimal-diff-writeback', () => ({
  isSemanticNoop: vi.fn(() => false),
  // Identity: the editor form is written verbatim unless a test says otherwise, so the
  // assertions read the controller's decision, not the merge heuristic.
  minimalDiffWriteback: vi.fn((_original: string, next: string) => next),
}))

import {
  isSemanticNoop,
  minimalDiffWriteback,
} from '../../src/minimal-diff-writeback'
import { WritebackController } from '../../src/writeback-controller'

function makeController(docText = 'baseline text\n') {
  const doc = mock.createTextDocument('/ws/note.md', docText)
  const deps = {
    extensionPath: '/ext',
    getDocument: () => doc,
    getActiveUri: () => doc.uri,
    setApplyingWebviewEdit: vi.fn(),
    setPendingWebviewContent: vi.fn(),
    setLastSyncedContent: vi.fn(),
    showError: vi.fn(),
    debug: vi.fn(),
  }
  const ctrl = new WritebackController(deps as never)
  return { ctrl, deps, doc }
}

describe('WritebackController.syncToEditor', () => {
  beforeEach(() => {
    mock.reset()
    vi.clearAllMocks()
  })

  it('writes the editor content and toggles the echo-suppression flag around applyEdit', async () => {
    const { ctrl, deps, doc } = makeController('baseline text\n')
    await ctrl.syncToEditor('baseline text CHANGED\n')

    // The write reached applyEdit and updated the document.
    expect(mock.calls.appliedEdits).toHaveLength(1)
    expect(mock.calls.appliedEdits[0].replacements[0].content).toBe(
      'baseline text CHANGED\n',
    )
    expect(doc.getText()).toBe('baseline text CHANGED\n')
    // Echo guard: set true BEFORE the edit, cleared false AFTER (order matters — the
    // change listener reads the flag to skip re-pushing our own write back to the webview).
    expect(deps.setApplyingWebviewEdit.mock.calls).toEqual([[true], [false]])
    // Only reconcile lastSynced once the write actually landed.
    expect(deps.setLastSyncedContent).toHaveBeenCalledWith(
      'baseline text CHANGED\n',
    )
    expect(deps.setPendingWebviewContent).toHaveBeenCalledWith(
      'baseline text CHANGED\n',
    )
    expect(deps.showError).not.toHaveBeenCalled()
  })

  it('bypasses minimal-diff for a baseline over MINDIFF_CAP (full write, no per-block reserialize)', async () => {
    const { ctrl } = makeController('small doc\n')
    ctrl.setCleanBaseline('x'.repeat(100_001)) // > MINDIFF_CAP (100_000)
    await ctrl.syncToEditor(`${'x'.repeat(100_001)} edited`)
    // Over the cap the controller writes the editor output verbatim without invoking the
    // (expensive, and here pointless) per-block merge.
    expect(minimalDiffWriteback).not.toHaveBeenCalled()
    expect(mock.calls.appliedEdits[0].replacements[0].content).toBe(
      `${'x'.repeat(100_001)} edited`,
    )
  })

  it('runs minimal-diff for a baseline under MINDIFF_CAP', async () => {
    const { ctrl } = makeController('baseline text\n')
    await ctrl.syncToEditor('baseline text edited\n')
    expect(minimalDiffWriteback).toHaveBeenCalledTimes(1)
  })

  it('recovers when applyEdit resolves false: surfaces an error, clears pending, does NOT advance lastSynced', async () => {
    const { ctrl, deps, doc } = makeController('baseline text\n')
    // applyEdit RESOLVES false (does not throw) when the doc changed under us. Advancing
    // lastSynced here would mark webview+disk reconciled while disk still holds old bytes.
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValueOnce(false)
    await ctrl.syncToEditor('baseline text CHANGED\n')

    expect(deps.showError).toHaveBeenCalledTimes(1)
    expect(deps.showError.mock.calls[0][0]).toMatch(/could not write/i)
    // pending set to the attempted content, then cleared on the failed write.
    expect(deps.setPendingWebviewContent.mock.calls).toEqual([
      ['baseline text CHANGED\n'],
      [undefined],
    ])
    expect(deps.setLastSyncedContent).not.toHaveBeenCalled()
    // Flag still reset in finally so the next real change isn't wrongly suppressed.
    expect(deps.setApplyingWebviewEdit.mock.calls).toEqual([[true], [false]])
    expect(doc.getText()).toBe('baseline text\n') // disk untouched
  })

  it('short-circuits when the content already equals the document (no write)', async () => {
    const { ctrl, deps } = makeController('baseline text\n')
    await ctrl.syncToEditor('baseline text\n')
    expect(mock.calls.appliedEdits).toHaveLength(0)
    expect(deps.setApplyingWebviewEdit).not.toHaveBeenCalled()
    expect(deps.setLastSyncedContent).toHaveBeenCalledWith('baseline text\n')
  })

  it('restores the clean baseline verbatim on a pure-reflow no-op (undo-to-disk)', async () => {
    const { ctrl, deps } = makeController('baseline text\n')
    ctrl.setCleanBaseline('baseline text\n')
    // The editor emitted a reflowed form, but it is semantically identical to the baseline
    // (task 61 v2 Layer 1). isSemanticNoop → true means restore the baseline bytes; here the
    // baseline already equals disk, so the net edit is zero and no write is issued.
    vi.mocked(isSemanticNoop).mockReturnValueOnce(true)
    await ctrl.syncToEditor('baseline text\n\n\n')
    expect(mock.calls.appliedEdits).toHaveLength(0)
    expect(deps.setLastSyncedContent).toHaveBeenCalledWith('baseline text\n')
  })
})
