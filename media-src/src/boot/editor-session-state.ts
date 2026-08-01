import type { EditSync } from '../bridge/edit-sync'
import type { InitPayload } from './init-payload'

// Mutable state shared between vditor-init.ts (owns Vditor construction + the
// streaming lifecycle) and message-router.ts (owns host->webview messages) — both
// sides read AND write these fields as part of the same init/update lifecycle
// (task 399, split out of main.ts's module-global `let`s). Kept as plain fields on
// one shared object rather than a class: nothing here encapsulates an invariant,
// every call site already does direct field mutation (`sessionState.streaming =
// true`), so getter/setter methods would add indirection without adding safety.
// State that only ONE side needs (lastDiffChanges, inlineInitedContent — both
// message-router-only; the observers registry — vditor-init-only) stays local to
// its owning module instead of living here.
interface EditorSessionState {
  // The last message Vditor was initialised from — used to re-init when a
  // constructor-only setting (toolbar, word count, …) changes live (task 26).
  lastInitMsg: InitPayload | null
  // True while an external (host-originated) document update or a wiki re-render is
  // being applied — suppresses the edit→host sync so a partial getValue() can't be
  // posted back over the update that's landing.
  applyingExtensionUpdate: boolean
  // True while a large document is being streamed into the IR editor chunk-by-chunk
  // (task 49). Like applyingExtensionUpdate, it suppresses the edit→host sync — a
  // partial getValue() mid-stream would otherwise save a TRUNCATED file. The editor is
  // also held read-only for the duration; both are released in streamRenderIR.onDone.
  streaming: boolean
  // The active editor's edit→host sync controller (task 152 item 1, edit-sync.ts). Its
  // flush() (Ctrl/Cmd+S), invalidate() (external setValue / streaming) and
  // reportDocMode() (status-bar marker) are driven from the handlers + keybind. Null
  // before the first init.
  editSync: EditSync | null
  // Shared mutable knownPages/displayNames sets — populated by initVditor and kept
  // current by the host's wiki-update message (message-router.ts). Because the custom
  // renderer captures the Set REFERENCE (not a copy), mutating a set in place updates
  // chip rendering live without re-wiring anything.
  wikiKnownPages: Set<string>
  wikiDisplayNames: Set<string>
}

export const sessionState: EditorSessionState = {
  lastInitMsg: null,
  applyingExtensionUpdate: false,
  streaming: false,
  editSync: null,
  wikiKnownPages: new Set(),
  wikiDisplayNames: new Set(),
}
