import { beforeEach, describe, expect, it } from 'vitest'
import { activePanels, findPanelForUri } from '../../src/platform/active-panels'
import { Uri } from './vscode-mock'

// Task 405 — the live registry of open Visual Markdown Editor panels (task 16), extracted out of
// MarkdownEditorProvider so EditorSession can reference it WITHOUT importing
// MarkdownEditorProvider (which constructs EditorSession) — avoids a circular import
// between editor-session.ts and markdown-editor-provider.ts. Mirrors the
// host-session-state.ts pattern: a plain shared module, not a class.
describe('active-panels', () => {
  beforeEach(() => {
    activePanels.clear()
  })

  it('findPanelForUri finds nothing in an empty registry', () => {
    expect(findPanelForUri(Uri.file('/ws/note.md'))).toBeUndefined()
  })

  it('finds the entry whose uri matches (by toString identity)', () => {
    const uri = Uri.file('/ws/note.md')
    const entry = { panel: {} as any, uri }
    activePanels.add(entry)
    expect(findPanelForUri(Uri.file('/ws/note.md'))).toBe(entry)
  })

  it('does not find an entry for a different uri', () => {
    activePanels.add({ panel: {} as any, uri: Uri.file('/ws/other.md') })
    expect(findPanelForUri(Uri.file('/ws/note.md'))).toBeUndefined()
  })

  it('entries can be removed (dispose path)', () => {
    const uri = Uri.file('/ws/note.md')
    const entry = { panel: {} as any, uri }
    activePanels.add(entry)
    activePanels.delete(entry)
    expect(findPanelForUri(uri)).toBeUndefined()
  })
})
