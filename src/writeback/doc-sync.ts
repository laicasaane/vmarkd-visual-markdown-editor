import type * as vscode from 'vscode'
import { escapeTableSpanPipes } from '../markdown/table-pipe-escape'
import { SyncState } from './sync-state'
import type { HostMessage } from '../shared/protocol'

interface DocSyncDeps {
  getDocument: () => vscode.TextDocument
  postMessage: (msg: HostMessage) => void
}

interface PostUpdateProps {
  type?: 'init' | 'update'
  cdn?: string
  options?: any
  theme?: 'dark' | 'light'
  wiki?: any
  e2e?: boolean
  foldState?: Extract<HostMessage, { command: 'update' }>['foldState']
}

// Task 405 — the document→webview push (`postUpdate`/`schedulePostUpdate`) extracted out
// of EditorSession, now backed by SyncState instead of three loose private fields
// (lastSyncedContent + the debounce timer). One instance per open editor.
export class DocSyncController {
  readonly syncState: SyncState
  private textEditTimer: NodeJS.Timeout | undefined

  constructor(
    private readonly deps: DocSyncDeps,
    initialContent: string,
  ) {
    this.syncState = new SyncState(initialContent)
  }

  async postUpdate(
    props: PostUpdateProps = { options: undefined },
  ): Promise<void> {
    const content = this.deps.getDocument().getText()
    const force = props.type === 'init'
    if (!force && this.syncState.isAlreadySynced(content)) {
      return
    }
    this.syncState.markSynced(content)
    this.deps.postMessage({
      command: 'update',
      // Normalize table-cell math/code pipes (#1904) before Vditor parses it. Identity
      // for content without the bug; dedup above still tracks the raw text.
      content: escapeTableSpanPipes(content),
      ...props,
    })
  }

  schedulePostUpdate(): void {
    if (this.textEditTimer) {
      clearTimeout(this.textEditTimer)
    }
    this.textEditTimer = setTimeout(() => {
      void this.postUpdate()
    }, 75)
  }

  // Cancel a pending scheduled post — called from the panel's onDidDispose teardown.
  disposeTimer(): void {
    if (this.textEditTimer) {
      clearTimeout(this.textEditTimer)
      this.textEditTimer = undefined
    }
  }
}
