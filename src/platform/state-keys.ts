// Task 405 — the two globalState keys shared between EditorSession, MarkdownEditorProvider,
// and activate() (setKeysForSync). Pulled into their own tiny module so editor-session.ts and
// markdown-editor-provider.ts don't need to import each other (or extension.ts) just for two
// string constants.
export const KeyVditorOptions = 'vmarkd.options'
export const KeyOutlineWidth = 'vmarkd.outlineWidth'
