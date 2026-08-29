import { createIncrementalMd } from './incremental-md'
import { createPendingEdit } from './pending-edit'
import { innerVditor } from '../util/inner-vditor'
import { activeModeElement } from '../util/source-map'
import {
  undoDelayForContentLength,
  LARGE_DOC_CHARS,
  useIncrementalSerialize,
} from './edit-sync-tuning'
import { setBusyCursor, nextPaint } from '../chrome/busy-cursor'
import { logToHost, reportError } from '../util/webview-log'
import { takeExplicitEdit } from '../links/link-url'
import { trackedEditorRange } from '../editing/editor-caret'

// The debounced edit→host serialize subsystem (task 152 item 1, extracted from
// initVditor). The webview owns the (single) markdown serialize — Vditor no longer
// serializes per input (fixIrInputSerialize patch). On a large doc the serialize is
// multi-second and blocks the thread, so the idle path shows a busy cursor and yields
// a paint before it (task 68); Ctrl/Cmd+S flushes SYNCHRONOUSLY (no yield) so the edit
// is posted before VS Code saves (task 58). Both guard against firing mid
// extension-update / streaming (a partial getValue() would post a truncated document).
//
// Incremental IR serialization (task 69): the full `vditor.getValue()` reserializes the
// whole document (Lute, super-linear) on every idle — seconds on a large doc. For IR we
// instead diff the top-level blocks and re-serialize only what changed, keeping a cached
// full markdown. Proven byte-identical to getValue() (task-69 spike).

/** The live edit-sync controller for one editor instance. */
export interface EditSync {
  /** Schedule a debounced edit→host post (called from Vditor's input()). */
  schedule(): void
  /** Mark that the pending schedule came from a real DOM input. */
  markUserInput(): void
  /** Flush the pending edit synchronously (Ctrl/Cmd+S, before VS Code saves). */
  flush(): void
  /** Flush live Markdown, then ask the host to return its authoritative bytes for rewrap. */
  prepareRewrap(): void
  /** Cancel pending serialization and post known, already-formatted Markdown once. */
  postExact(content: string): void
  /** Drop the incremental IR cache when the DOM is rebuilt outside the edit path
   *  (external setValue / streaming) so the next serialize rebaselines cleanly. */
  invalidate(): void
  /** Post the active large-doc helper set to the host (status-bar marker). */
  reportDocMode(): void
}

interface EditSyncDeps {
  /** True while an extension-update / streaming is in flight — suppress posts (a
   *  partial getValue() would save a truncated document). Read at call time. */
  isSuppressed: () => boolean
  /** Doc-mode flags fixed for the document's lifetime, for the status-bar marker:
   *  content-visibility (≥100 KB) and streaming (>700 KB) are fixed; incremental
   *  serialization (≥700 blocks) can flip as the user edits (recomputed per report). */
  docMode: { cvActive: boolean; streamActive: boolean; docChars: number }
}

export function createEditSync(deps: EditSyncDeps): EditSync {
  const { isSuppressed } = deps
  const { cvActive, streamActive, docChars } = deps.docMode
  let userInputPending = false

  const incrementalIr = createIncrementalMd((html: string) => {
    // `schedule`/`flush` (this closure's only callers) run after Vditor's init has completed —
    // Lute is always present by then. Fail loud rather than silently returning `''` (which would
    // truncate the serialized document) if that invariant is ever broken; `update`'s own
    // try/catch (incremental-md.ts) treats a throw here as a self-heal signal, same as its
    // internal consistency checks.
    const lute = innerVditor()?.lute
    if (!lute) throw new Error('edit-sync: Lute not initialized')
    return lute.VditorIRDOM2Md(html)
  })
  const irElement = (): HTMLElement | undefined => innerVditor()?.ir?.element
  const irTopBlocks = (el: HTMLElement): string[] =>
    Array.from(el.children, (c) => (c as HTMLElement).outerHTML)
  // Cache is IR-only; re-entering IR (after a mode switch) rebaselines.
  let lastSerializeMode: string | null = null
  const isLargeDoc = () =>
    (activeModeElement(window.vditor)?.textContent?.length ?? 0) >=
    LARGE_DOC_CHARS
  // The incremental serializer pays off only with enough top-level blocks — block COUNT
  // (not byte size) drives the super-linear full-serialize cost (task-69 analysis). Returns
  // the IR element when incremental should be used, else undefined (→ plain getValue()).
  // `children.length` is O(1) and correct for code/lists/tables (each is one block).
  const irIncrementalElement = (): HTMLElement | undefined => {
    const el = irElement()
    return el &&
      useIncrementalSerialize(
        window.vditor.getCurrentMode?.(),
        el.children.length,
      )
      ? el
      : undefined
  }
  const serializeForHost = (): string => {
    const el = irIncrementalElement()
    if (el) {
      if (lastSerializeMode !== 'ir-incremental') incrementalIr.invalidate()
      lastSerializeMode = 'ir-incremental'
      return incrementalIr.update(irTopBlocks(el))
    }
    lastSerializeMode = window.vditor.getCurrentMode?.() ?? null
    return vditor.getValue()
  }

  // Report which large-document helpers are active to the host. Post only when the
  // active SET changes, so it's cheap to call often.
  let lastReportedSig: string | null = null
  const reportDocMode = (): void => {
    const incremental = irIncrementalElement() !== undefined
    const blocks = irElement()?.children.length ?? 0
    const sig = `${cvActive}|${streamActive}|${incremental}`
    if (sig === lastReportedSig) return
    lastReportedSig = sig
    vscode.postMessage({
      command: 'docMode',
      contentVisibility: cvActive,
      streaming: streamActive,
      incremental,
      blocks,
      chars: docChars,
    })
  }

  // Keep Vditor's idle window mode-aware (Vditor reads options.undoDelay live). IR/SV
  // stay snappy (task 69: IR is incremental, SV serialize is trivial); only WYSIWYG, whose
  // full VditorDOM2Md is still super-linear, widens on large docs. Re-evaluated per edit so
  // a mode switch takes effect on the next edit's scheduling.
  const syncUndoDelay = () => {
    const inner = innerVditor()
    if (!inner?.options) return
    const mode = window.vditor.getCurrentMode?.()
    const len =
      mode === 'wysiwyg'
        ? (activeModeElement(window.vditor)?.textContent?.length ?? 0)
        : 0
    inner.options.undoDelay = undoDelayForContentLength(len, mode)
  }

  // Task 390: the markdown of the top-level block the caret sits in, for an EXPLICIT markup action
  // (the link button turning a selected URL into `[url](url)`). That result is semantically identical
  // to the bare URL already on disk — GFM autolinks it — so the host's minimal-diff write-back would
  // correctly keep the original bytes and the button would leave the file untouched. Sending the one
  // block lets the host rewrite exactly that block and nothing else; the general no-op rule, which is
  // what stops an edit reflowing untouched blocks, stays intact. Best-effort: undefined ⇒ the host
  // behaves exactly as before.
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: best-effort single-block-source extraction across the IR/WYSIWYG DOM-shape branches; pre-existing (task 469 baseline)
  const explicitBlockMd = (): string | undefined => {
    try {
      const editor = activeModeElement(window.vditor)
      const sel = window.getSelection()
      const live = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null
      // WYSIWYG's link button opens a popover and focuses its input, so the LIVE selection is no
      // longer in the editor by the time this runs — fall back to the caret editor-caret.ts tracks.
      const node =
        live && editor?.contains(live)
          ? live
          : (trackedEditorRange()?.startContainer ?? null)
      if (!editor || !node || !editor.contains(node)) return undefined
      // The top-level block is the editor's own child that contains the caret.
      let block = (
        node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
      ) as HTMLElement | null
      while (block && block.parentElement !== editor)
        block = block.parentElement
      if (!block) return undefined
      // Mode-aware: WYSIWYG's DOM is not IR's, and serializing it with VditorIRDOM2Md yields
      // markdown that matches nothing on the host, so the explicit block is silently dropped.
      const lute = innerVditor()?.lute
      const md =
        window.vditor.getCurrentMode?.() === 'wysiwyg'
          ? lute?.VditorDOM2Md(block.outerHTML)
          : lute?.VditorIRDOM2Md(block.outerHTML)
      return md?.trim() ? md : undefined
    } catch {
      return undefined
    }
  }

  const postEdit = () => {
    const explicitBlock = takeExplicitEdit(window)
      ? explicitBlockMd()
      : undefined
    vscode.postMessage({
      command: 'edit',
      content: serializeForHost(),
      explicitBlock,
    })
    userInputPending = false
    reportDocMode()
    syncUndoDelay()
  }
  const pendingEdit = createPendingEdit({
    wait: 250,
    onIdle: async () => {
      if (isSuppressed()) return
      // A postEdit() throw (e.g. a Lute serialize failure) must not become an unhandled
      // rejection: pending-edit.ts's setTimeout callback fires this without awaiting it
      // (task 482, noFloatingPromises) — without this catch, an exception here would
      // silently kill this idle cycle's host sync with no trace anywhere.
      try {
        // IR is now incremental → fast even on large docs (no busy cursor). WYSIWYG/SV
        // still do a full getValue(); keep the busy-cursor + paint for that slow path.
        if (window.vditor.getCurrentMode?.() !== 'ir' && isLargeDoc()) {
          setBusyCursor(true)
          await nextPaint() // let the busy cursor paint before the long serialize
          try {
            postEdit()
          } finally {
            setBusyCursor(false)
          }
        } else {
          postEdit()
        }
      } catch (err) {
        reportError(err, 'edit-sync: onIdle')
      }
    },
    onFlush: () => flushEdit(),
  })

  function flushEdit(rewrapDocument = false): void {
    if (isSuppressed()) return
    // Save is authoritative (task 58): on a large IR doc bring the incremental cache
    // current (cheap), then audit it against a full getValue() — drift = a fast-path bug,
    // log + resync so a bad incremental result can never corrupt a saved file. Small docs
    // (below the block-count gate) serialize directly.
    const incrEl = irIncrementalElement()
    if (incrEl) {
      const incremental = incrementalIr.update(irTopBlocks(incrEl))
      const authoritative = vditor.getValue()
      if (incremental !== authoritative) {
        logToHost(
          '[task69] incremental IR markdown drifted from full serialize on save; using authoritative + resyncing',
        )
        incrementalIr.invalidate()
      }
      vscode.postMessage({
        command: 'edit',
        content: authoritative,
        rewrapDocument,
      })
    } else {
      vscode.postMessage({
        command: 'edit',
        content: vditor.getValue(),
        rewrapDocument,
      })
    }
    userInputPending = false
  }

  return {
    schedule: () => pendingEdit.schedule(),
    markUserInput: () => {
      userInputPending = true
    },
    flush: () => pendingEdit.flush(),
    prepareRewrap: () => {
      pendingEdit.cancel()
      if (userInputPending) flushEdit(true)
      else vscode.postMessage({ command: 'request-rewrap-document' })
    },
    postExact: (content) => {
      pendingEdit.cancel()
      incrementalIr.invalidate()
      if (isSuppressed()) return
      vscode.postMessage({ command: 'edit', content, exact: true })
      userInputPending = false
      reportDocMode()
      syncUndoDelay()
    },
    invalidate: () => incrementalIr.invalidate(),
    reportDocMode,
  }
}
