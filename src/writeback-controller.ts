import * as vscode from 'vscode'
import { reserializeMarkdown } from './lute-host'
import { isSemanticNoop, minimalDiffWriteback } from './minimal-diff-writeback'

const normalize = (content: string) => content.replace(/\r\n/g, '\n')

// The EditorSession state the write-back needs to read/mutate. Injected so the controller
// owns the task-61 baseline concern without reaching back into EditorSession: the three
// echo-suppression flags stay EditorSession fields (its change listener + postUpdate read
// them directly) and are written here through the setters. getDocument/getActiveUri are
// getters because activeUri follows a rename.
export interface WritebackDeps {
  extensionPath: string
  getDocument: () => vscode.TextDocument
  getActiveUri: () => vscode.Uri
  setApplyingWebviewEdit: (value: boolean) => void
  setPendingWebviewContent: (value: string | undefined) => void
  setLastSyncedContent: (value: string) => void
  showError: (message: string) => void
  debug: (...args: unknown[]) => void
}

// Task 61 v2 minimal-diff write-back, extracted from EditorSession. Owns the CLEAN
// baseline + the per-block reserialize cache; EditorSession delegates syncToEditor +
// setCleanBaseline to it.
export class WritebackController {
  // Task 61 — minimal-diff write-back. Keep the ORIGINAL source bytes for every block
  // the user didn't actually change; only changed blocks take Vditor's reserialized
  // form. Best-effort + gated by size (large docs reflow negligibly — see task 49/61
  // benches — and aren't worth the per-block reserialize cost) and falls back to the
  // editor's full output on any issue. `reserializeMarkdown` is memoized per source
  // block (block bytes are stable across edits), so only the first edit pays the cost.
  private static MINDIFF_CAP = 100_000

  // Task 61 v2 — the CLEAN baseline: the document bytes the last time it matched disk
  // (set on open + after save). The minimal-diff write-back minimizes against THIS, not
  // the current (possibly already-reflowed) document, so undoing back to the original
  // returns the file to disk exactly and the tab goes clean. `cleanBaselineCanonical`
  // memoizes its whole-doc reserialization (baseline is stable between saves).
  private cleanBaseline = ''
  private cleanBaselineCanonical: string | undefined
  private reserializeCache = new Map<string, string>()

  constructor(private readonly deps: WritebackDeps) {}

  private documentRange(document: vscode.TextDocument) {
    const lastLine = document.lineAt(Math.max(document.lineCount - 1, 0))
    return new vscode.Range(
      0,
      0,
      lastLine.range.end.line,
      lastLine.range.end.character,
    )
  }

  // Record a clean baseline (document == disk) and drop the memoized canonical form so
  // it's recomputed lazily on the next write against the new baseline.
  setCleanBaseline(text: string) {
    this.cleanBaseline = text
    this.cleanBaselineCanonical = undefined
  }

  // Whole-document IR reserialize (== the webview's getValue for IR mode), gated by
  // size. Returns undefined when Lute isn't warm or the doc is too large — callers
  // treat undefined as "can't decide" and fall back safely.
  private reserializeWhole(md: string): string | undefined {
    if (md.length > WritebackController.MINDIFF_CAP) return undefined
    return reserializeMarkdown(this.deps.extensionPath, md)
  }

  private minimizeWriteback(original: string, next: string): string {
    if (original.length > WritebackController.MINDIFF_CAP) return next
    try {
      return minimalDiffWriteback(original, next, (block) => {
        const hit = this.reserializeCache.get(block)
        if (hit !== undefined) return hit
        const r = reserializeMarkdown(this.deps.extensionPath, block)
        if (r !== undefined) this.reserializeCache.set(block, r) // don't cache cold-Lute misses
        return r
      })
    } catch {
      return next
    }
  }

  async syncToEditor(content: string) {
    const document = this.deps.getDocument()
    if (normalize(content) === normalize(document.getText())) {
      this.deps.setLastSyncedContent(document.getText())
      return
    }
    // Minimize against the CLEAN baseline (disk bytes at open / last save), not the
    // current — possibly already-reflowed — document. That's what lets an undo-to-start
    // return the file to disk exactly so the tab goes clean (task 61 v2).
    const baseline = this.cleanBaseline || document.getText()
    if (this.cleanBaselineCanonical === undefined) {
      this.cleanBaselineCanonical = this.reserializeWhole(baseline)
    }
    // Layer 1: whole-doc no-op short-circuit. If the editor's output is semantically
    // identical to the baseline (canonical forms match), the net edit is zero → restore
    // the baseline bytes verbatim. Catches what the block splitter can't (loose lists
    // collapse to tight under the round-trip, but both sides collapse identically).
    const reW = (md: string): string | undefined =>
      md === baseline ? this.cleanBaselineCanonical : this.reserializeWhole(md)
    const toWrite = isSemanticNoop(baseline, content, reW)
      ? baseline
      : this.minimizeWriteback(baseline, content)
    // Minimization may reduce the edit to a no-op vs disk (pure reflow the user undid).
    if (normalize(toWrite) === normalize(document.getText())) {
      this.deps.setLastSyncedContent(document.getText())
      return
    }
    this.deps.setApplyingWebviewEdit(true)
    this.deps.setPendingWebviewContent(toWrite)
    try {
      const edit = new vscode.WorkspaceEdit()
      edit.replace(
        this.deps.getActiveUri(),
        this.documentRange(document),
        toWrite,
      )
      // applyEdit RESOLVES `false` (it does not throw) when the doc changed under
      // us — advancing lastSyncedContent on a failed write would mark the webview
      // and disk as reconciled while disk still holds the old text, and the
      // change listener would never re-push (data-loss class, task 151 item 2).
      const applied = await vscode.workspace.applyEdit(edit)
      if (!applied) {
        this.deps.setPendingWebviewContent(undefined)
        this.deps.debug(
          'syncToEditor: applyEdit returned false — write not applied',
          { uri: this.deps.getActiveUri().toString() },
        )
        this.deps.showError(
          'vMarkd: could not write your edit (the document changed underneath). Your change is still in the editor — save again.',
        )
        return
      }
      this.deps.setLastSyncedContent(document.getText())
    } finally {
      this.deps.setApplyingWebviewEdit(false)
    }
  }
}
