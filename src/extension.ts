import * as vscode from 'vscode'
import * as NodePath from 'node:path'
import * as os from 'node:os'
import { MarkdownOutlineProvider } from './outline-tree'
import { selectionForLine } from './reveal-range'
import { createDiffScheduler, makeDiffComputer } from './git-diff'
import { type EditorMode, prewarmLute, renderForMode } from './lute-host'
import { escapeTableSpanPipes } from './table-pipe-escape'
import {
  createWikiPage,
  getWikiDocumentContext,
  getWikiRoot,
  isWikiFile,
  normalizeWikiLookupKey,
} from './wiki'
import {
  disposeAllCaches,
  getOrBuildCache,
  invalidateCache,
} from './wiki-cache'
import {
  buildWebviewHtml,
  hasCodeFence,
  sanitizeCss,
  serializeInitPayload,
} from './html-builder'
import type { HostMessage, WebviewMessage } from './protocol'

// Monotonic id for `get-cursor-offset` request/reply correlation (revealCaretInSource).
let cursorOffsetSeq = 0
import { DiagramCache } from './diagram-cache-host'
import {
  resolveContentTheme,
  resolveFontSize,
  themeDef,
} from './theme-registry'
import {
  getCommandTarget,
  isSupportedMarkdownUri,
  MarkdownEditorViewType,
} from './tab-targeting'
import { type DocLargeModeInfo, setupStatusBar } from './status-bar'
import { registerCommands } from './commands'
import { WritebackController } from './writeback-controller'
import {
  cfgFor,
  collectConfigOptions,
  extensionVersion,
  getAssetsFolder,
  getWebviewOptions,
  readExternalCss,
  resolveExternalCssPaths,
  sanitizeVditorOptions,
  vmarkdConfig,
  webviewRoots,
} from './editor-config'

const KeyVditorOptions = 'vmarkd.options'
const KeyOutlineWidth = 'vmarkd.outlineWidth'
// Task 38: max content length we inline into the HTML to skip the ready→init roundtrip. Above this,
// keep the roundtrip (+ stream-render) — the prerender teaser already embeds the rendered content, so
// inlining the raw source too would ~double the HTML for large docs. ~100 KB covers nearly all docs.
const InlineInitMax = 100_000
const WikiFileContextKey = 'vmarkd.isWikiFile'

// Levelled log channel (task 18 §2d). Replaces raw `console.log`, which always
// dumped full payloads — including document content — to the dev console.
// Routed at `trace`, so content-bearing logs surface only when the user raises
// the channel's log level; nothing leaks at the default level.
let logger: vscode.LogOutputChannel | undefined

function debug(...args: any[]) {
  if (!logger) return
  logger.trace(
    args
      .map((a) => {
        if (typeof a === 'string') return a
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      })
      .join(' '),
  )
}

function showError(msg: string) {
  vscode.window.showErrorMessage(`[vMarkd] ${msg}`)
}

// Random per-render nonce so only our own <script> tags are allowed to run
// under the CSP (task 18 §2c) — injected inline scripts (no nonce) cannot.
function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let text = ''
  for (let i = 0; i < 32; i++)
    text += chars.charAt(Math.floor(Math.random() * chars.length))
  return text
}

// Map the VS Code UI language (vscode.env.language, a lowercase BCP-47 tag like
// "en", "zh-cn", "pt-br") to the closest Vditor i18n bundle that ships under
// media/vditor/dist/js/i18n/*.js (de_DE, en_US, es_ES, fr_FR, ja_JP, ko_KR, pt_BR,
// ru_RU, sv_SE, vi_VN, zh_CN, zh_TW). Default en_US. The host injects the matching
// bundle into the webview HTML *before* main.js so `window.VditorI18n` is set when
// Vditor is constructed; with i18n inline Vditor skips its async i18n fetch and
// builds the editor (toolbar included) synchronously inside the constructor — so
// the toolbar can be cloned into the instant-paint overlay right away, instead of
// after an extra network round-trip (see media-src/src/main.ts).
export function resolveVditorI18nLang(envLang: string | undefined): string {
  const l = (envLang || 'en').toLowerCase().replace('_', '-')
  if (l === 'zh-tw' || l === 'zh-hant') return 'zh_TW'
  if (l.startsWith('zh')) return 'zh_CN'
  const byBase: Record<string, string> = {
    de: 'de_DE',
    en: 'en_US',
    es: 'es_ES',
    fr: 'fr_FR',
    ja: 'ja_JP',
    ko: 'ko_KR',
    pt: 'pt_BR',
    ru: 'ru_RU',
    sv: 'sv_SE',
    vi: 'vi_VN',
  }
  return byBase[l.split('-')[0]] ?? 'en_US'
}

// Resolve the `fontSize` setting to the --me-font-size CSS value. Thin alias over the
// shared registry resolver (src/theme-registry.ts) so the host and webview can't
// diverge — the registry is now importable by BOTH build units (it's dependency-free),
// retiring the old "separate bundle, can't share" duplication. Kept exported under this
// name for the host unit tests + the call site below.
export const resolveFontSizeCss = resolveFontSize

function normalizeContent(content: string) {
  return content.replace(/\r\n/g, '\n')
}

// Map the active VS Code color theme to the webview's two-value theme. Used by
// both the init payload and the live onDidChangeActiveColorTheme listener so
// they stay in sync (task 25).
function currentThemeKind(): 'dark' | 'light' {
  const kind = vscode.window.activeColorTheme.kind
  return kind === vscode.ColorThemeKind.Dark ||
    kind === vscode.ColorThemeKind.HighContrast
    ? 'dark'
    : 'light'
}

// The editor's light/dark MODE (task 82). A GitHub content theme pins the mode to
// its own light/dark so the rendered content — including code blocks (hljs) — is
// themed consistently (github-light → light code, not the VS Code dark code). The
// toolbar/chrome stays VS Code-coloured regardless (its CSS vars are mode-independent
// in main.css). `auto` follows the VS Code theme.
function effectiveThemeKind(): 'dark' | 'light' {
  const ct = resolveContentTheme(
    vscode.workspace.getConfiguration('vmarkd').get<string>('theme.content'),
  )
  // A named theme pins its own mode (registry); `auto`/unknown follows VS Code.
  return themeDef(ct)?.mode ?? currentThemeKind()
}

// Gate filesystem-writing actions (image upload, wiki page creation) on the
// declared capabilities (see package.json `capabilities`): not in virtual
// workspaces (non-file scheme), and not in an untrusted workspace.
function ensureCanWriteFiles(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') {
    vscode.window.showInformationMessage(
      `[vMarkd] Image upload and wiki page creation are unavailable in virtual workspaces.`,
    )
    return false
  }
  if (!vscode.workspace.isTrusted) {
    vscode.window.showWarningMessage(
      `[vMarkd] Trust this workspace to upload images and create wiki pages.`,
    )
    return false
  }
  return true
}

async function updateEditorContexts() {
  const target = getCommandTarget()
  await vscode.commands.executeCommand(
    'setContext',
    WikiFileContextKey,
    isWikiFile(target),
  )
}

// task 69: per-document large/normal regime (block-count gate), reported by the webview
// and shown as a small status-bar marker (see setupStatusBar). Keyed by uri.toString().
// `refreshStatusBarMarker` is the status-bar updater, wired in activate() so the webview
// report can refresh it.
export const docLargeMode = new Map<string, DocLargeModeInfo>()
// Task 187: the webview's CURRENT edit mode per document (ir/wysiwyg/sv), reported at
// init + on every edit-mode switch — drives the status-bar mode label (sv is a SOURCE
// view; the static "WYSIWYG" label was wrong there).
export const webviewEditorMode = new Map<string, 'ir' | 'wysiwyg' | 'sv'>()
let refreshStatusBarMarker: () => void = () => {}
// Wired in activate(); called from a panel's onDidChangeViewState so the
// Markdown Outline tree (task 78) follows the active vMarkd editor — custom
// editors don't fire onDidChangeActiveTextEditor.
let refreshOutline: () => void = () => {}

// Open a vMarkd document's source in a text editor and select the caret's line
// (task 16). Shared by the revealInSource command (opens Beside) and the
// edit-in-vscode toolbar button (opens in the active column). The webview is
// asked for the caret's line + that line's text — measured against
// vditor.getValue() — and we match by CONTENT in the real doc so Vditor's
// on-load reflow (a blank line after a heading, `>` re-prefixing) can't shift
// the target. If the caret can't be resolved, we still open the editor (at the
// top) so the button always does something.
async function revealCaretInSource(
  panel: vscode.WebviewPanel,
  docUri: vscode.Uri,
  viewColumn: vscode.ViewColumn,
): Promise<void> {
  // One-shot request/reply on the panel (reveal is panel-scoped, so it doesn't go through the
  // session's handler map — that map carries a no-op 'cursor-offset' entry to stay exhaustive).
  // `requestId` correlation: a late reply from a previous timed-out reveal must not resolve
  // this one (185/3a). The 1000 ms timeout stays as the hung-webview fallback.
  const requestId = `co-${++cursorOffsetSeq}`
  const reply = await new Promise<{ line: number; lineText: string }>(
    (resolve) => {
      const timeout = setTimeout(() => {
        sub.dispose()
        resolve({ line: -1, lineText: '' })
      }, 1000)
      const sub = panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
        if (msg.command === 'cursor-offset' && msg.requestId === requestId) {
          clearTimeout(timeout)
          sub.dispose()
          resolve({ line: msg.line, lineText: msg.lineText })
        }
      })
      panel.webview.postMessage({
        command: 'get-cursor-offset',
        requestId,
      } satisfies HostMessage)
    },
  )

  const editor = await vscode.window.showTextDocument(docUri, {
    viewColumn,
    preview: false,
  })
  if (reply.line < 0) return // opened, but no caret to jump to

  const doc = vscode.workspace.textDocuments.find(
    (d) => d.uri.toString() === docUri.toString(),
  )
  const text = doc ? doc.getText() : editor.document.getText()
  const { line, startChar, endChar } = selectionForLine(
    text,
    reply.line,
    reply.lineText,
  )
  const start = new vscode.Position(line, startChar)
  const end = new vscode.Position(line, endChar)
  editor.selection = new vscode.Selection(start, end)
  editor.revealRange(
    new vscode.Range(start, end),
    vscode.TextEditorRevealType.InCenter,
  )
}

export function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('vMarkd', { log: true })
  context.subscriptions.push(logger)
  context.subscriptions.push({ dispose: disposeAllCaches })

  // Warm the host-side Lute now so the first file open already gets the instant
  // pre-rendered paint (see src/lute-host.ts). Deferred off the activation path.
  prewarmLute(context.extensionPath)

  const updateStatusBar = setupStatusBar(
    context,
    docLargeMode,
    webviewEditorMode,
  )
  // Let a webview's large/normal-mode report (task 69) refresh the status-bar marker.
  refreshStatusBarMarker = updateStatusBar

  // Markdown Outline tree (task 78): a sidebar TreeView, because VS Code's
  // built-in Outline does not query DocumentSymbolProvider while a custom editor
  // is active (microsoft/vscode#97095). Tracks the active vMarkd/text markdown
  // document and lets a click scroll the webview to that heading.
  const outlineProvider = new MarkdownOutlineProvider()
  let lastHasOutline: boolean | undefined
  const updateOutline = () => {
    const enabled = vmarkdConfig().get<boolean>('outline.treeView') !== false
    const target = enabled ? getCommandTarget() : undefined
    const doc =
      target && isSupportedMarkdownUri(target)
        ? vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === target.toString(),
          )
        : undefined
    outlineProvider.refresh(doc)
    const has = !!doc
    if (has !== lastHasOutline) {
      lastHasOutline = has
      void vscode.commands.executeCommand(
        'setContext',
        'vmarkd.hasOutline',
        has,
      )
    }
  }
  // Debounced — a single file switch fires many editor/tab/view-state events;
  // coalesce them so the tree rebuilds once (not 4–5×, which froze the UI).
  let outlineTimer: NodeJS.Timeout | undefined
  const scheduleOutline = () => {
    if (outlineTimer) clearTimeout(outlineTimer)
    outlineTimer = setTimeout(updateOutline, 120)
  }

  refreshOutline = scheduleOutline
  const refreshContexts = () => {
    void updateEditorContexts()
    updateStatusBar()
    scheduleOutline()
  }
  // Live reading-time on edits, debounced so it doesn't recompute per keystroke.
  let statusBarTimer: NodeJS.Timeout | undefined
  const debouncedStatusBar = () => {
    if (statusBarTimer) clearTimeout(statusBarTimer)
    statusBarTimer = setTimeout(updateStatusBar, 300)
  }

  registerCommands(context, {
    debug,
    showError,
    revealCaretInSource,
    findPanelForUri: (uri) => MarkdownEditorProvider.findPanelForUri(uri),
  })

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MarkdownEditorViewType,
      new MarkdownEditorProvider(context),
      {
        webviewOptions: {
          // Always ON = instant tab switching (task 37). The user setting
          // (advanced.retainHidden) was removed 2026-07-01 — the reload on
          // re-show with it OFF proved too disruptive to ever want.
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
      },
    ),
    vscode.window.onDidChangeActiveTextEditor(refreshContexts),
    vscode.window.tabGroups.onDidChangeTabs(refreshContexts),
    vscode.workspace.onDidOpenTextDocument(refreshContexts),
    vscode.workspace.onDidCloseTextDocument(refreshContexts),
    // One text-change listener drives both the debounced reading-time/status-bar
    // refresh and the outline rebuild (was two separate onDidChangeTextDocument
    // registrations doing one concern each).
    vscode.workspace.onDidChangeTextDocument((e) => {
      debouncedStatusBar()
      if (e.document.uri.toString() === outlineProvider.uri?.toString())
        scheduleOutline()
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('vmarkd.outline.treeView')) scheduleOutline()
    }),
    vscode.window.registerTreeDataProvider('vmarkd.outline', outlineProvider),
  )

  context.globalState.setKeysForSync([KeyVditorOptions, KeyOutlineWidth])
  refreshContexts()
  // Test API (task 187): the real-VS-Code suite asserts the webview→host editorMode
  // report end-to-end (sv-split.spec reads this map via extension.exports).
  return { webviewEditorMode }
}

interface ActivePanelEntry {
  panel: vscode.WebviewPanel
  uri: vscode.Uri
}

// One open editor tab. Holds the per-panel state + behaviour that previously lived
// as closures inside MarkdownEditorProvider.resolveCustomTextEditor (SRP step 1:
// god-method -> class). For now the state stays local to start(); later steps
// promote it to fields and split the closures into methods. The HTML builder is
// injected so this class needn't reach back into the provider's private members.
export class EditorSession {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly document: vscode.TextDocument,
    private readonly webviewPanel: vscode.WebviewPanel,
    // Task 184 — the shared host-memory+disk diagram render cache, owned by the provider
    // (spans the window session, outlives every webview). Injected so a tab close/reopen
    // reuses the same store.
    private readonly diagramCache: DiagramCache,
    private readonly htmlForWebview: (
      webview: vscode.Webview,
      uri: vscode.Uri,
      content?: string,
      theme?: 'dark' | 'light',
      // Task 38: pre-serialized init payload inlined into the HTML (see inlineInitPayload).
      initPayload?: string,
    ) => string,
  ) {}

  // Per-panel state (was closure-local in resolveCustomTextEditor). The `!` fields
  // are assigned at the top of start(); activeUri/activeFsPath are reassigned on
  // rename and read lazily elsewhere, so they must stay fields (not snapshots).
  private disposables!: vscode.Disposable[]
  private activeUri!: vscode.Uri
  private activeFsPath!: string
  private suppressCloseDispose = false
  private textEditTimer: NodeJS.Timeout | undefined
  private applyingWebviewEdit = false
  private pendingWebviewContent: string | undefined
  private lastSyncedContent = ''
  // Task 61 v2 minimal-diff write-back (CLEAN baseline + per-block reserialize cache)
  // lives in WritebackController; created in start(). The three flags above stay here
  // because the change listener + postUpdate read them directly.
  private writeback!: WritebackController
  private currentWatcher: vscode.Disposable | undefined
  private externalCssWatcher: vscode.Disposable | undefined
  private wiki!: ReturnType<typeof getWikiDocumentContext>
  private lastWikiRoot: vscode.Uri | undefined
  private workspaceFolder: vscode.WorkspaceFolder | undefined
  private vditorBaseUri!: string
  private panelEntry!: ActivePanelEntry

  private async postUpdate(
    props: {
      type?: 'init' | 'update'
      cdn?: string
      options?: any
      theme?: 'dark' | 'light'
      wiki?: any
    } = { options: void 0 },
  ) {
    const content = this.document.getText()
    const force = props.type === 'init'
    if (
      !force &&
      normalizeContent(content) === normalizeContent(this.lastSyncedContent)
    ) {
      return
    }
    this.lastSyncedContent = content
    this.webviewPanel.webview.postMessage({
      command: 'update',
      // Normalize table-cell math/code pipes (#1904) before Vditor parses it. Identity
      // for content without the bug; dedup above still tracks the raw text.
      content: escapeTableSpanPipes(content),
      ...props,
    })
  }

  private schedulePostUpdate() {
    if (this.textEditTimer) {
      clearTimeout(this.textEditTimer)
    }
    this.textEditTimer = setTimeout(() => {
      this.postUpdate()
    }, 75)
  }

  // Extracted so it can be disposed + recreated when the file is renamed.
  private setupFileWatcher(uri: vscode.Uri): vscode.Disposable | undefined {
    if (!this.workspaceFolder) {
      return undefined
    }
    const relativePath = NodePath.relative(
      this.workspaceFolder.uri.fsPath,
      uri.fsPath,
    ).replace(/\\/g, '/')
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceFolder, relativePath),
    )
    return vscode.Disposable.from(
      watcher,
      watcher.onDidChange(() => this.schedulePostUpdate()),
      watcher.onDidCreate(() => this.schedulePostUpdate()),
    )
  }

  private postExternalCss() {
    this.webviewPanel.webview.postMessage({
      command: 'reload-css',
      id: 'external-css',
      css: readExternalCss(this.activeUri),
    })
  }

  // Live config reload (tasks 12/26): push config-driven body options + CSS to the
  // open editor (no Vditor re-init, so cursor/scroll are preserved).
  private postLiveConfig() {
    this.webviewPanel.webview.postMessage({
      command: 'config-changed',
      options: collectConfigOptions(),
      // Effective light/dark mode so a live theme.content change re-themes the
      // editor (mode + code) without a reopen (task 82).
      theme: effectiveThemeKind(),
    })
    this.webviewPanel.webview.postMessage({
      command: 'reload-css',
      id: 'custom-css',
      css: cfgFor(this.activeUri).get<string>('css.custom') || '',
    })
    this.postExternalCss()
  }

  private refreshExternalCssWatchers() {
    this.externalCssWatcher?.dispose()
    const paths = resolveExternalCssPaths(this.activeUri)
    if (paths.length === 0) {
      this.externalCssWatcher = undefined
      return
    }
    this.externalCssWatcher = vscode.Disposable.from(
      ...paths.map((p) => {
        const w = vscode.workspace.createFileSystemWatcher(p)
        return vscode.Disposable.from(
          w,
          w.onDidChange(() => this.postExternalCss()),
          w.onDidCreate(() => this.postExternalCss()),
          w.onDidDelete(() => this.postExternalCss()),
        )
      }),
    )
    this.disposables.push(this.externalCssWatcher)
  }

  private async onReady() {
    let wikiInit: any = this.wiki
    const wikiRoot = this.wiki.enabled
      ? getWikiRoot(this.document.uri)
      : undefined
    this.lastWikiRoot = wikiRoot
    if (wikiRoot) {
      const cache = await getOrBuildCache(wikiRoot, () => {
        // Watcher fired (file create/delete) — push updated keys to webview.
        this.webviewPanel.webview.postMessage({
          command: 'wiki-update',
          pageKeys: cache.allPageKeys(),
          displayNames: cache.allDisplayNames(),
        })
      })
      // Send the full key + display-name set at init so the hint and the
      // missing-link check agree from the first render. (These are precomputed
      // and cached on the WikiCache, so this is cheap — no per-target resolve.)
      wikiInit = {
        ...this.wiki,
        pageKeys: cache.allPageKeys(),
        displayNames: cache.allDisplayNames(),
      }
    }
    await this.postUpdate({
      type: 'init',
      cdn: this.vditorBaseUri,
      options: this.buildInitOptions(),
      theme: effectiveThemeKind(),
      wiki: wikiInit,
    })
  }

  // The Vditor init options blob: config-derived options + saved per-user Vditor options + the
  // drag-resized outline width override. Shared by onReady() (postMessage init) and
  // inlineInitPayload() (task 38 inline init) so the two paths can't drift.
  private buildInitOptions() {
    return {
      ...collectConfigOptions(),
      // globalState.get is untyped (unknown) → cast so the saved options spread (sanitize is identity-typed).
      ...(sanitizeVditorOptions(
        this.context.globalState.get(KeyVditorOptions),
      ) as Record<string, unknown>),
      // Drag-resized outline width overrides the setting default.
      ...(this.context.globalState.get<number>(KeyOutlineWidth)
        ? {
            outlineWidth: this.context.globalState.get<number>(KeyOutlineWidth),
          }
        : {}),
    }
  }

  // Task 38: serialize the init payload to inline into the HTML so the webview boots Vditor
  // synchronously on first paint (skip the serial ready→init host roundtrip). Returns undefined to
  // keep the roundtrip for (a) WIKI files — their links need async pageKeys at first render — and
  // (b) LARGE docs — the prerender teaser already embeds the rendered content, so inlining the raw
  // source too would ~double the HTML. Mirrors onReady()'s init payload; onReady still posts the echo
  // (with identical content), which the webview no-ops — see media-src/src/main.ts.
  private inlineInitPayload(content: string | undefined): string | undefined {
    if (
      content === undefined ||
      isWikiFile(this.document.uri) ||
      content.length > InlineInitMax
    ) {
      return undefined
    }
    // Match postUpdate: external-edit diffing compares against the content handed to the webview.
    this.lastSyncedContent = content
    return serializeInitPayload({
      type: 'init',
      content: escapeTableSpanPipes(content),
      cdn: this.vditorBaseUri,
      options: this.buildInitOptions(),
      theme: effectiveThemeKind(),
      wiki: this.wiki,
    })
  }

  private async onSaveOptions(
    message: Extract<WebviewMessage, { command: 'save-options' }>,
  ) {
    await this.context.globalState.update(
      KeyVditorOptions,
      sanitizeVditorOptions(message.options),
    )
  }

  private onInfo(message: Extract<WebviewMessage, { command: 'info' }>) {
    vscode.window.showInformationMessage(message.content)
  }

  private onError(message: Extract<WebviewMessage, { command: 'error' }>) {
    showError(message.content)
  }

  // Copy HTML / Markdown via the host clipboard (task 53 #1). The webview posts the
  // content and we write it with vscode.env.clipboard — rock-solid regardless of
  // iframe focus/permissions, unlike navigator.clipboard inside the webview.
  private async onCopyToClipboard(
    message: Extract<
      WebviewMessage,
      { command: 'copy-html' | 'copy-markdown' }
    >,
    label: string,
  ) {
    try {
      await vscode.env.clipboard.writeText(String(message.content ?? ''))
      vscode.window.showInformationMessage(`Copy ${label} successfully!`)
    } catch (error: any) {
      showError(`Copy ${label} failed! ${error?.message ?? error}`)
    }
  }

  private async onEdit(message: Extract<WebviewMessage, { command: 'edit' }>) {
    await this.writeback.syncToEditor(message.content)
  }

  // Task 184 — the webview asks for cached SVGs of the diagram blocks it found on open.
  // Serve the hits (misses are simply absent); the webview injects each hit via the offscreen
  // render+atomic-swap primitive and skips the engine. `requestId` correlates the reply.
  private onDiagramCacheGet(
    message: Extract<WebviewMessage, { command: 'diagram-cache-get' }>,
  ) {
    const svgByHash: Record<string, string> = {}
    for (const hash of message.hashes) {
      const svg = this.diagramCache.get(hash)
      if (svg !== undefined) svgByHash[hash] = svg
    }
    this.webviewPanel.webview.postMessage({
      command: 'diagram-cache-hits',
      requestId: message.requestId,
      svgByHash,
    })
  }

  // Task 184 — a render landed in the webview; store it under THIS panel's document uri so
  // the per-doc pinned current-set (fairness) tracks the right document. The webview is the
  // authority on the hash it computed.
  private onDiagramRenderCached(
    message: Extract<WebviewMessage, { command: 'diagram-render-cached' }>,
  ) {
    this.diagramCache.put(
      this.activeUri.toString(),
      message.diagramId,
      message.hash,
      message.svg,
    )
  }

  // The webview reports which large-document helpers are active (content-visibility,
  // streaming, incremental serialization). Store per-uri and refresh the status-bar
  // marker, whose tooltip lists the active ones.
  private onDocMode(message: Extract<WebviewMessage, { command: 'docMode' }>) {
    docLargeMode.set(this.activeUri.toString(), {
      blocks: Number(message.blocks) || 0,
      chars: Number(message.chars) || 0,
      contentVisibility: Boolean(message.contentVisibility),
      streaming: Boolean(message.streaming),
      incremental: Boolean(message.incremental),
    })
    refreshStatusBarMarker()
  }

  private async onSave(message: Extract<WebviewMessage, { command: 'save' }>) {
    await this.writeback.syncToEditor(message.content)
    // Guard the save: a failed disk write must surface, not vanish (task 151 item 2).
    try {
      await this.document.save()
    } catch (error) {
      debug('onSave: document.save() failed', error)
      showError(
        `vMarkd: save failed — ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async onEditInVscode() {
    // Open the source AND jump to the caret's line (task 16). Same column as
    // the visual editor, matching the previous open-in-place behavior.
    await revealCaretInSource(
      this.webviewPanel,
      this.activeUri,
      vscode.ViewColumn.Active,
    )
  }

  private async onNavigateBack() {
    await vscode.commands.executeCommand('workbench.action.navigateBack')
  }

  private async onOpenSettings() {
    await vscode.commands.executeCommand('vmarkd.openSettings')
  }

  private async onListWikiPages() {
    const wikiRoot = getWikiRoot(this.document.uri)
    if (!wikiRoot) {
      return
    }
    const cache = await getOrBuildCache(wikiRoot)
    const allPages = cache.allFiles()
    const picked = await vscode.window.showQuickPick(
      allPages.map((page) => ({
        label: NodePath.basename(page.fsPath, NodePath.extname(page.fsPath)),
        description: vscode.workspace.asRelativePath(page, false),
        uri: page,
      })),
      {
        title: 'Wiki Pages',
        placeHolder: 'Select a wiki page to open',
      },
    )
    if (picked?.uri) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        picked.uri,
        MarkdownEditorViewType,
      )
    }
  }

  private async onUpload(
    message: Extract<WebviewMessage, { command: 'upload' }>,
  ) {
    if (!ensureCanWriteFiles(this.activeUri)) {
      return
    }
    const assetsFolder = getAssetsFolder(this.activeUri)
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(assetsFolder))
    } catch (error) {
      debug('upload: createDirectory failed', error)
      showError(`Invalid image folder: ${assetsFolder}`)
      return // can't write into a folder we failed to create
    }
    // Defense in depth (task 191 P1-18): never trust the webview-supplied name. Reduce it
    // to a bare basename (strips any `dir/` components), then verify the join stays inside
    // the assets folder — so a crafted `..`/`../` name can't write outside it even if the
    // webview-side sanitizeUploadName is bypassed. Unsafe names are skipped, not written.
    const written = (
      await Promise.all(
        message.files.map(async (file: any) => {
          const safeName = NodePath.basename(String(file.name))
          const target = NodePath.join(assetsFolder, safeName)
          const rel = NodePath.relative(assetsFolder, target)
          if (
            !safeName ||
            safeName === '..' ||
            rel.startsWith('..') ||
            NodePath.isAbsolute(rel)
          ) {
            debug('upload: rejected unsafe file name', file.name)
            return null
          }
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(target),
            Buffer.from(file.base64, 'base64'),
          )
          return NodePath.relative(
            NodePath.dirname(this.activeFsPath),
            target,
          ).replace(/\\/g, '/')
        }),
      )
    ).filter((r): r is string => r !== null)
    this.webviewPanel.webview.postMessage({
      command: 'uploaded',
      files: written,
    })
  }

  private async onOpenLink(
    message: Extract<WebviewMessage, { command: 'open-link' }>,
  ) {
    const href = String(message.href)
    if (/^https?:/i.test(href)) {
      // External URL → the OS default browser. env.openExternal is the canonical
      // API for this; vscode.open routes http inconsistently (Simple Browser).
      await vscode.env.openExternal(vscode.Uri.parse(href))
      return
    }
    // Relative/local target → open the file in the editor (unchanged behaviour).
    const local = NodePath.resolve(NodePath.dirname(this.activeFsPath), href)
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(local))
  }

  private async onOpenWikilink(
    message: Extract<WebviewMessage, { command: 'open-wikilink' }>,
  ) {
    const root = getWikiRoot(this.document.uri)
    if (!root) {
      showError(
        'Wiki links are only enabled for Markdown files inside a wiki folder.',
      )
      return
    }
    const rawTarget = String(message.target)
    const [targetPart] = rawTarget.split('|', 1)
    const key = normalizeWikiLookupKey(targetPart.trim())
    if (!key) {
      showError('Invalid wiki link target.')
      return
    }
    const cache = await getOrBuildCache(root)
    const matches = cache.resolve(key)

    if (matches.length === 0) {
      const createChoice = await vscode.window.showWarningMessage(
        `Wiki page "${rawTarget}" was not found under "${vscode.workspace.asRelativePath(root, false)}".`,
        'Create Page',
      )
      if (createChoice === 'Create Page') {
        if (!ensureCanWriteFiles(this.document.uri)) return
        const newFileUri = await createWikiPage(root, key)
        await vscode.commands.executeCommand(
          'vscode.openWith',
          newFileUri,
          MarkdownEditorViewType,
        )
      }
      return
    }
    if (matches.length > 1) {
      const picked = await vscode.window.showQuickPick(
        matches.map((candidate) => ({
          label: NodePath.basename(candidate.fsPath),
          description: vscode.workspace.asRelativePath(candidate, false),
          uri: candidate,
        })),
        {
          title: `Select wiki page for "${rawTarget}"`,
          placeHolder: 'Multiple wiki pages match this link.',
        },
      )
      if (picked?.uri) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          picked.uri,
          MarkdownEditorViewType,
        )
      }
      return
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      matches[0],
      MarkdownEditorViewType,
    )
  }

  start() {
    const document = this.document
    const webviewPanel = this.webviewPanel

    this.disposables = []
    // Mutable file identity — updated by onDidRenameFiles (task 14) so the tab,
    // watcher, edits and asset paths follow a renamed file. (Wiki context below
    // stays init-frozen — cross-folder wiki rename is a known Phase-1 limit.)
    this.activeUri = document.uri
    this.activeFsPath = document.uri.fsPath
    this.suppressCloseDispose = false
    this.wiki = getWikiDocumentContext(document.uri)
    this.workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    this.vditorBaseUri = webviewPanel.webview
      .asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vditor'),
      )
      .toString()
    this.applyingWebviewEdit = false
    this.lastSyncedContent = document.getText()
    // The three echo-suppression flags stay session fields; the controller writes them
    // through these setters (its syncToEditor toggles them around applyEdit).
    this.writeback = new WritebackController({
      extensionPath: this.context.extensionPath,
      getDocument: () => this.document,
      getActiveUri: () => this.activeUri,
      setApplyingWebviewEdit: (v) => {
        this.applyingWebviewEdit = v
      },
      setPendingWebviewContent: (v) => {
        this.pendingWebviewContent = v
      },
      setLastSyncedContent: (v) => {
        this.lastSyncedContent = v
      },
      showError,
      debug,
    })
    this.writeback.setCleanBaseline(document.getText()) // open: document == disk
    // Task 184 — mark this doc open so its diagram renders' current-set stays PINNED (never
    // LRU-evicted) while the tab is open. Released in onDidDispose below.
    this.diagramCache.registerDoc(this.activeUri.toString())

    webviewPanel.title = NodePath.basename(this.activeFsPath)
    webviewPanel.iconPath = new vscode.ThemeIcon('markdown')
    // Track this panel so commands (e.g. revealInSource, task 16) can find the
    // focused editor + its document. `uri` is updated on rename below and the
    // entry is removed on dispose.
    this.panelEntry = { panel: webviewPanel, uri: this.activeUri }
    MarkdownEditorProvider.activePanels.add(this.panelEntry)
    // Augment, don't replace: keep VS Code's default custom-editor webview options
    // and only override the ones we control (task 27).
    webviewPanel.webview.options = {
      ...webviewPanel.webview.options,
      ...getWebviewOptions(this.context.extensionUri, document.uri),
    }
    // NOTE: webview.html is intentionally set LAST (after onDidReceiveMessage is
    // registered below) — see the assignment at the end of this method. Setting it
    // here loads main.js, which posts `ready` almost immediately; if the host's
    // message listener isn't attached yet, that `ready` is dropped and the editor
    // never gets its `init` payload (blank/"hung" editor — intermittent, races the
    // bundle load). Attaching the listener first closes that race.

    // Git gutters (task 17): debounced HEAD↔current diff pushed to the webview.
    // The computer reads `this.activeFsPath` lazily so it follows a rename. Self-
    // disables (posts []) when there's no git / the file is untracked.
    const scheduleDiffInfo = createDiffScheduler(
      (msg) => webviewPanel.webview.postMessage(msg),
      (content) =>
        makeDiffComputer(this.activeFsPath, vscode.extensions, debug)(content),
      undefined,
      debug,
    )

    // Extracted so it can be disposed + recreated when the file is renamed.
    this.currentWatcher = this.setupFileWatcher(this.activeUri)
    if (this.currentWatcher) {
      this.disposables.push(this.currentWatcher)
    }

    // Live config reload (tasks 12/26): on settings change push the config-driven
    // body options + CSS to the open editor, and watch external CSS files so
    // edits apply without reopening. No Vditor re-init (cursor/scroll preserved).
    this.refreshExternalCssWatchers()

    // Wire the document/panel/config/theme listeners + the webview message handler.
    // Done BEFORE webview.html is set below (the ready-race — see the note above).
    this.installListeners(scheduleDiffInfo)

    // Set the HTML LAST — only now that onDidReceiveMessage (above) is attached.
    // This loads main.js, which posts `ready` and triggers the init handshake; with
    // the listener already live, the `ready` can't be dropped, so the editor always
    // gets its content (fixes the intermittent blank/"hung" editor on window reload).
    // Task 38: also inline the init payload so the webview can boot Vditor synchronously
    // (the `ready→init` roundtrip remains as the fallback + the source of the wiki/echo path).
    const initContent = document.getText()
    webviewPanel.webview.html = this.htmlForWebview(
      webviewPanel.webview,
      document.uri,
      initContent,
      effectiveThemeKind(),
      this.inlineInitPayload(initContent),
    )

    // Populate the Markdown Outline tree for this freshly-opened editor (task 78);
    // onDidChangeViewState may not fire on the initial open.
    refreshOutline()
  }

  // Webview→host message handlers, one per command (replaces a 15-case switch).
  // Each arrow delegates to the session's on<Command> methods. Adding a command
  // means adding an entry, not editing a central switch (Open/Closed).
  // Keyed by the WebviewMessage discriminant so each handler receives its
  // narrowed variant and a renamed command/field is a compile error (task 151).
  private buildMessageHandlers(): {
    [K in WebviewMessage['command']]?: (
      message: Extract<WebviewMessage, { command: K }>,
    ) => unknown
  } {
    return {
      ready: () => this.onReady(),
      'save-options': (message) => this.onSaveOptions(message),
      info: (message) => this.onInfo(message),
      error: (message) => this.onError(message),
      edit: (message) => this.onEdit(message),
      save: (message) => this.onSave(message),
      docMode: (message) => this.onDocMode(message),
      editorMode: (message) => {
        webviewEditorMode.set(this.activeUri.toString(), message.mode)
        refreshStatusBarMarker()
      },
      log: (message) => logger?.appendLine(String(message?.text ?? '')),
      'edit-in-vscode': () => this.onEditInVscode(),
      'navigate-back': () => this.onNavigateBack(),
      'open-settings': () => this.onOpenSettings(),
      'list-wiki-pages': () => this.onListWikiPages(),
      'save-outline-width': (message) =>
        this.context.globalState.update(KeyOutlineWidth, message.width),
      upload: (message) => this.onUpload(message),
      'open-link': (message) => this.onOpenLink(message),
      'open-wikilink': (message) => this.onOpenWikilink(message),
      'copy-html': (message) => this.onCopyToClipboard(message, 'HTML'),
      'copy-markdown': (message) => this.onCopyToClipboard(message, 'Markdown'),
      'diagram-cache-get': (message) => this.onDiagramCacheGet(message),
      'diagram-render-cached': (message) => this.onDiagramRenderCached(message),
      // Consumed by revealCaretInSource's one-shot listener (requestId-correlated) — this
      // entry only keeps the reply out of the "unhandled webview message" debug noise.
      'cursor-offset': () => {},
    }
  }

  // Install this session's document/panel/config/theme listeners + the webview
  // message dispatcher. Called from start() BEFORE webview.html is set (ready-race).
  private installListeners(
    scheduleDiffInfo: ReturnType<typeof createDiffScheduler>,
  ) {
    const webviewPanel = this.webviewPanel
    const messageHandlers = this.buildMessageHandlers()

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        // Scope to this document's uri so resource-scoped overrides (task 51 #3)
        // in a folder's .vscode/settings.json trigger a reload — and so an
        // unrelated folder's change doesn't reload editors it doesn't affect.
        if (!e.affectsConfiguration('vmarkd', this.activeUri)) {
          return
        }
        // Wiki config changed (enabled/root) → invalidate the old cache so the
        // re-init (triggered by postLiveConfig → handleConfigChanged) builds a
        // fresh cache for the potentially-changed root.
        if (e.affectsConfiguration('vmarkd.wiki')) {
          if (this.lastWikiRoot) {
            invalidateCache(this.lastWikiRoot)
            this.lastWikiRoot = undefined
          }
          this.wiki = getWikiDocumentContext(this.document.uri)
          void updateEditorContexts()
        }
        this.postLiveConfig()
        this.refreshExternalCssWatchers()
      }),
      // One text-change listener drives both the content sync and the title dirty-
      // marker (was two separate onDidChangeTextDocument registrations). The title
      // update runs UNCONDITIONALLY after the uri guard — the content-sync short-
      // circuits below must not skip it, since it was an independent listener before.
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== this.activeUri.toString()) {
          return
        }
        const currentContent = event.document.getText()
        webviewPanel.title = `${event.document.isDirty ? '[edit]' : ''}${NodePath.basename(this.activeFsPath)}`
        // Any content change (webview edit, external edit, typing) shifts the git
        // diff — refresh the gutters even for echoed/own edits.
        scheduleDiffInfo(currentContent)
        if (
          this.pendingWebviewContent !== undefined &&
          normalizeContent(currentContent) ===
            normalizeContent(this.pendingWebviewContent)
        ) {
          this.pendingWebviewContent = undefined
          this.lastSyncedContent = currentContent
          return
        }
        if (this.applyingWebviewEdit) {
          return
        }
        // An external change that left the document clean (revert, reload from disk):
        // adopt it as the new baseline so a later undo-to-here can return to disk.
        if (!event.document.isDirty) {
          this.writeback.setCleanBaseline(currentContent)
        }
        this.schedulePostUpdate()
      }),
      vscode.workspace.onDidSaveTextDocument((savedDocument) => {
        if (savedDocument.uri.toString() !== this.activeUri.toString()) {
          return
        }
        // After save the on-disk bytes ARE the saved bytes — adopt them as the new
        // clean baseline so a later undo-to-here returns the file to disk exactly.
        this.writeback.setCleanBaseline(savedDocument.getText())
        scheduleDiffInfo(savedDocument.getText())
        this.schedulePostUpdate()
      }),
      vscode.workspace.onDidRenameFiles((e) => {
        // Phase 1: direct file rename only. Re-point identity, tab, watcher and
        // suppress the old-uri close that would otherwise dispose the panel.
        const hit = e.files.find(
          (f) => f.oldUri.toString() === this.activeUri.toString(),
        )
        if (!hit) {
          return
        }
        this.suppressCloseDispose = true
        this.activeUri = hit.newUri
        this.activeFsPath = hit.newUri.fsPath
        this.panelEntry.uri = hit.newUri // keep the active-panel registry in sync
        webviewPanel.title = NodePath.basename(this.activeFsPath)
        this.currentWatcher?.dispose()
        this.currentWatcher = this.setupFileWatcher(this.activeUri)
        if (this.currentWatcher) {
          this.disposables.push(this.currentWatcher)
        }
        setTimeout(() => {
          this.suppressCloseDispose = false
        }, 0)
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        // Live re-theme this editor when the VS Code theme changes (task 25). A
        // GitHub content theme pins the mode to its own light/dark (task 82), so
        // effectiveThemeKind keeps the content stable here while `auto` follows VS Code.
        webviewPanel.webview.postMessage({
          command: 'set-theme',
          theme: effectiveThemeKind(),
        })
      }),
      vscode.workspace.onDidCloseTextDocument((closedDocument) => {
        if (this.suppressCloseDispose) {
          return
        }
        if (closedDocument.uri.toString() !== this.activeUri.toString()) {
          return
        }
        webviewPanel.dispose()
      }),
      webviewPanel.onDidChangeViewState(() => {
        // Custom editors don't fire onDidChangeActiveTextEditor, so refresh the
        // Markdown Outline tree (task 78) when this panel becomes active/inactive.
        refreshOutline()
      }),
      webviewPanel.webview.onDidReceiveMessage(
        async (message: WebviewMessage) => {
          debug('msg from webview review', message, webviewPanel.active)
          // The map type guarantees each entry matches its command; bridge the
          // runtime-string index the same way the webview dispatcher does.
          const handler = (
            messageHandlers as Record<
              string,
              ((m: WebviewMessage) => unknown) | undefined
            >
          )[message?.command]
          if (!handler) {
            debug('unhandled webview message', message?.command)
            return
          }
          // Error boundary (task 151 item 2): a throwing handler used to reject the
          // onDidReceiveMessage promise silently — route it to the Output channel +
          // surface it instead of swallowing it across the seam.
          try {
            await handler(message)
          } catch (error) {
            debug('webview message handler failed', message?.command, error)
            showError(
              `vMarkd: handling "${message?.command}" failed — ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }
        },
      ),
      webviewPanel.onDidDispose(() => {
        this.pendingWebviewContent = undefined
        docLargeMode.delete(this.activeUri.toString())
        webviewEditorMode.delete(this.activeUri.toString())
        // Task 184 — tab closed: release this doc's pins. Its renders stay in the host cache
        // (memory + disk) as unpinned LRU entries, so a reopen within the session is still an
        // instant hit — they're only reclaimed later under pressure.
        this.diagramCache.closeDoc(this.activeUri.toString())
        MarkdownEditorProvider.activePanels.delete(this.panelEntry)
        if (this.textEditTimer) {
          clearTimeout(this.textEditTimer)
        }
        while (this.disposables.length) {
          this.disposables.pop()?.dispose()
        }
      }),
    )
  }
}

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  // Live registry of open vMarkd panels (task 16). Commands like revealInSource
  // need the focused panel + its document; CustomTextEditorProvider gives us no
  // singleton, so we track them here and pick the active one.
  static activePanels = new Set<ActivePanelEntry>()

  static findActivePanel(): ActivePanelEntry | undefined {
    for (const entry of MarkdownEditorProvider.activePanels) {
      if (entry.panel.active) return entry
    }
    return undefined
  }

  static findPanelForUri(uri: vscode.Uri): ActivePanelEntry | undefined {
    const want = uri.toString()
    for (const entry of MarkdownEditorProvider.activePanels) {
      if (entry.uri.toString() === want) return entry
    }
    return undefined
  }

  // Config/CSS reader logic lives as free functions in editor-config.ts (SRP). These
  // static aliases keep the test-facing API (test/backend/*) that calls them as
  // MarkdownEditorProvider.<name>; production call sites use the free functions directly.
  static webviewRoots = webviewRoots
  static getWebviewOptions = getWebviewOptions
  static sanitizeCss = sanitizeCss
  static sanitizeVditorOptions = sanitizeVditorOptions
  static getAssetsFolder = getAssetsFolder

  // Task 184 — the persistent diagram render cache, ONE instance per window session (the
  // extension host outlives every webview). Disk-backed under globalStorageUri; version-keyed
  // so an engine re-pin invalidates old SVGs. LAZY (built on first use, not in the ctor) so the
  // unit tests that construct the provider with a minimal mock context (no globalStorageUri)
  // don't trip on it; the disk is only touched on the first cache message anyway.
  private _diagramCache: DiagramCache | undefined
  private get diagramCache(): DiagramCache {
    if (!this._diagramCache) {
      const base =
        this._context.globalStorageUri?.fsPath ??
        NodePath.join(os.tmpdir(), 'vmarkd-diagram-cache')
      this._diagramCache = new DiagramCache({
        dir: NodePath.join(base, 'diagram-render-cache'),
        version: extensionVersion(),
        // The real-VS-Code e2e suite shares one worker-scoped globalStorage across all tests, so a
        // stale cache HIT from an earlier spec breaks fresh-render specs order-dependently. Wipe per
        // test (a fresh VS Code launches per test). Never set outside the harness — defeats task 184.
        freshStart: !!process.env.VMARKD_E2E,
      })
      this._context.subscriptions?.push({
        dispose: () => this._diagramCache?.dispose(),
      })
    }
    return this._diagramCache
  }

  constructor(private readonly _context: vscode.ExtensionContext) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ) {
    new EditorSession(
      this._context,
      document,
      webviewPanel,
      this.diagramCache,
      (webview, uri, content, theme, initPayload) =>
        this._getHtmlForWebview(webview, uri, content, theme, initPayload),
    ).start()
  }

  private _getHtmlForWebview(
    webview: vscode.Webview,
    uri: vscode.Uri,
    content?: string,
    theme: 'dark' | 'light' = 'light',
    // Task 38: pre-serialized init payload (built by EditorSession.inlineInitPayload) forwarded into
    // the HTML so the webview boots Vditor without the ready→init roundtrip.
    initPayload?: string,
  ) {
    const toUri = (f: string) =>
      webview
        .asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, f))
        .toString()
    const baseHref = `${NodePath.dirname(
      webview.asWebviewUri(vscode.Uri.file(uri.fsPath)).toString(),
    )}/`
    const cfg = vmarkdConfig()
    const savedOpts = sanitizeVditorOptions(
      this._context.globalState.get(KeyVditorOptions),
    ) as { mode?: string } | undefined
    const savedMode: EditorMode =
      savedOpts?.mode === 'wysiwyg'
        ? 'wysiwyg'
        : savedOpts?.mode === 'sv'
          ? 'sv'
          : 'ir'

    const contentTheme = resolveContentTheme(cfg.get<string>('theme.content'))
    return buildWebviewHtml({
      toUri,
      baseHref,
      cspSource: webview.cspSource,
      nonce: getNonce(),
      theme,
      config: {
        showToolbar: cfg.get<boolean>('editor.toolbar') !== false,
        contentTheme,
        useVscodeThemeColor: contentTheme === 'auto',
        enableFullWidth: cfg.get<boolean>('editor.fullWidth') === true,
        highlightHeadings: cfg.get<boolean>('theme.highlightHeadings') === true,
        showHeadingMarkers: cfg.get<boolean>('editor.headingMarkers') !== false,
        fontSize: resolveFontSizeCss(
          cfg.get<string>('editor.fontSize'),
          contentTheme,
        ),
        allowRemoteImages:
          cfgFor(uri).get<boolean>('image.allowRemoteImages') === true,
        customCss: cfgFor(uri).get<string>('css.custom') || '',
        externalCss: readExternalCss(uri),
      },
      preRenderedHtml:
        content !== undefined
          ? renderForMode(
              this._context.extensionPath,
              content,
              savedMode,
              isWikiFile(uri),
            )
          : undefined,
      // Gate the hljs preload on the FULL document (not the truncated preRenderedHtml) so a code fence
      // below MAX_PRERENDER_CHARS still preloads hljs (task 170 bonus).
      docHasCodeFence: content !== undefined && hasCodeFence(content),
      savedMode,
      i18nLang: resolveVditorI18nLang(vscode.env?.language),
      initPayload,
    })
  }
}
