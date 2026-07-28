import type { WebviewMessage } from './protocol'

// Task 148 item 3 (payload-shape validation, host side): mirrors
// `media-src/src/message-router.ts`'s `firstShapeViolation` for the OPPOSITE direction. The host's
// `onDidReceiveMessage` dispatcher (`src/editor-session.ts`'s `EditorSession.buildMessageHandlers`)
// has no runtime check that a webview→host message actually carries the fields its handler
// unconditionally reads — TypeScript's `WebviewMessage` union only checks internal callers, not
// what arrives on the wire, so a malformed or drifted message becomes a runtime shape error inside
// a handler instead of a rejection at the dispatch seam.
//
// Deliberately a standalone module rather than inline in `editor-session.ts`: that class's webview
// message dispatcher was deliberately NOT split into its own module by task 405 (too tightly
// coupled to the panel's disposables/session fields — see tasks/405-*.md; the CLASS itself did
// move out of `extension.ts` into `editor-session.ts` as that task's own final step, but the
// dispatcher method stayed inline within it), so this pure, dependency-free validator lives on its
// own and is wired in with a one-line call at the dispatch site.
//
// The field table is DELIBERATELY not "every field protocol.ts marks non-optional" — a field is
// listed only when the ACTUAL handler (`editor-session.ts`'s `buildMessageHandlers`, or a module it
// delegates to, e.g. `asset-link-actions.ts`) reads it unconditionally, with no coercion/fallback
// that already makes a missing/malformed value harmless. Fields a handler already defends
// (`Number()`, `Boolean()`, `?? ''`, `?.`) are deliberately left off — requiring them here would be
// STRICTER than the handler needs and could reject a message the handler would have handled fine.
// Verified against the real handler bodies (2026-07-28), not inferred from the type:
//   - edit / save: `onEdit`/`onSave` read `message.content` unconditionally.
//   - upload: `asset-link-actions.ts`'s `onUpload` does `message.files.map(...)` — a non-array
//     throws a TypeError inside the handler.
//   - open-link / open-wikilink: `onOpenLink`/`onOpenWikilink` do `String(message.href/target)` —
//     technically coerces without throwing, but an ABSENT field silently becomes the literal string
//     "undefined" and is then treated as a real (bogus) path/target — worth catching here, unlike
//     the true no-op coercions below.
//   - save-outline-width: `message.width` is written straight into `globalState`, no coercion.
//   - editorMode: `message.mode` is written straight into a map read back for the status-bar label.
//   - diagram-cache-get: `for (const hash of message.hashes)` throws if `hashes` isn't iterable;
//     `requestId` is echoed verbatim in the reply.
//   - diagram-render-cached: all three fields are passed straight into `diagramCache.put(...)`.
//   - save-options: `sanitizeVditorOptions(message.options)` is BUILT to tolerate any shape — no
//     required fields.
//   - docMode: `onDocMode` coerces every field (`Number()`/`Boolean()`) — nothing can crash, so
//     nothing is required even though the protocol type marks them all non-optional.
//   - log / copy-html / copy-markdown: each already has an `?? ''` fallback before use.
//   - ready / edit-in-vscode / navigate-back / open-settings / list-wiki-pages / cursor-offset:
//     carry no payload the handler reads at all.
type FieldType = 'string' | 'number' | 'array'

const REQUIRED_WEBVIEW_MESSAGE_FIELDS: Partial<
  Record<WebviewMessage['command'], [string, FieldType][]>
> = {
  ready: [],
  edit: [['content', 'string']],
  save: [['content', 'string']],
  'save-options': [],
  'save-outline-width': [['width', 'number']],
  docMode: [],
  editorMode: [['mode', 'string']],
  log: [],
  upload: [['files', 'array']],
  'open-link': [['href', 'string']],
  'open-wikilink': [['target', 'string']],
  'edit-in-vscode': [],
  'navigate-back': [],
  'open-settings': [],
  'list-wiki-pages': [],
  'copy-html': [],
  'copy-markdown': [],
  'diagram-cache-get': [
    ['requestId', 'string'],
    ['hashes', 'array'],
  ],
  'diagram-render-cached': [
    ['diagramId', 'string'],
    ['hash', 'string'],
    ['svg', 'string'],
  ],
  'cursor-offset': [],
}

function matchesFieldType(value: unknown, type: FieldType): boolean {
  if (type === 'array') return Array.isArray(value)
  return typeof value === type
}

// Returns the name of the first missing/mistyped required field, or null if the message shape is
// sound (or `command` has no entry above — an unknown command is the dispatcher's "no handler"
// branch's problem, not this function's).
export function firstWebviewMessageShapeViolation(
  msg: Record<string, unknown>,
  command: string,
): string | null {
  const fields =
    REQUIRED_WEBVIEW_MESSAGE_FIELDS[command as WebviewMessage['command']]
  if (!fields) return null
  for (const [name, type] of fields) {
    if (!matchesFieldType(msg[name], type)) return name
  }
  return null
}
