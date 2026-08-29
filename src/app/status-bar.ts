import * as vscode from 'vscode'
import { readingTime, wordCount } from '../markdown/reading-time'
import {
  getActiveTabInput,
  isSupportedMarkdownUri,
} from '../platform/tab-targeting'
import {
  MarkdownEditorViewType,
  ProductDisplayName,
} from '../shared/product-identity'

// task 69: per-document large/normal regime (block-count gate), reported by the webview
// and shown as a small status-bar marker. Keyed by uri.toString().
export interface DocLargeModeInfo {
  blocks: number
  chars: number
  contentVisibility: boolean
  streaming: boolean
  incremental: boolean
}

// Native status-bar items (task 35): estimated reading time + an editor-mode
// indicator (WYSIWYG vs Source) + a large/normal document marker (task 69), shown
// only while a markdown doc is the active tab. Returns an `update` fn the caller wires
// to the same active-tab / document listeners that drive updateEditorContexts.
export function setupStatusBar(
  context: vscode.ExtensionContext,
  docLargeMode: Map<string, DocLargeModeInfo>,
  // Task 187: the webview's live edit mode per uri (ir/wysiwyg/sv). Absent (no report
  // yet / older webview) → the historical WYSIWYG label.
  webviewEditorMode?: Map<string, 'ir' | 'wysiwyg' | 'sv'>,
): () => void {
  const reading = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  )
  reading.name = `${ProductDisplayName} Reading Time`
  const mode = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99,
  )
  mode.name = `${ProductDisplayName} Editor Mode`
  // task 69: large-document marker (incremental serialization regime). Right-aligned with
  // a higher priority than reading-time (100) so it sits to the LEFT of the word counter;
  // shown only for large docs — its presence alone signals "incremental mode".
  const docSize = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    101,
  )
  docSize.name = `${ProductDisplayName} Document Size`
  context.subscriptions.push(reading, mode, docSize)

  const textForUri = (uri: vscode.Uri): string =>
    vscode.workspace.textDocuments
      .find((d) => d.uri.toString() === uri.toString())
      ?.getText() ?? ''

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: refresh callback branching over active-tab-input kind (VMDE custom editor vs plain text editor vs none); pre-existing (task 469 baseline)
  return () => {
    const input = getActiveTabInput()
    const showFor = (uri: vscode.Uri) => {
      const text = textForUri(uri)
      reading.text = `$(book) ${readingTime(text)} · $(pencil) ${wordCount(text)} words`
      reading.tooltip = 'Estimated reading time · word count'
      reading.show()
    }
    if (
      input instanceof vscode.TabInputCustom &&
      input.viewType === MarkdownEditorViewType
    ) {
      showFor(input.uri)
      // Task 187: sv is a source+preview split — the static "WYSIWYG" label (and its
      // "click to edit as source" hint) was wrong there. ir/wysiwyg both keep the
      // familiar product label; distinguishing them would be jargon, not information.
      if (webviewEditorMode?.get(input.uri.toString()) === 'sv') {
        mode.text = '$(split-horizontal) Split'
        mode.tooltip =
          'Markdown: split view (source + preview) — click to open the plain text editor'
      } else {
        mode.text = '$(eye) WYSIWYG'
        mode.tooltip = 'Markdown: visual editor — click to edit as source'
      }
      mode.command = 'vmde.openTextEditor'
      mode.show()
      // Large-doc marker — shown whenever ANY large-document helper is active
      // (content-visibility, streaming, or incremental serialization). The tooltip
      // lists exactly which are on. Only meaningful in the visual editor (webview).
      const ds = docLargeMode.get(input.uri.toString())
      const active: string[] = []
      if (ds?.contentVisibility) {
        const kb = ds.chars ? ` (~${Math.round(ds.chars / 1024)} KB)` : ''
        active.push(
          `**content-visibility**${kb} — browser skips layout/paint of off-screen blocks, keeping tab-switch repaint fast`,
        )
      }
      if (ds?.streaming) {
        active.push(
          '**chunked streaming** — the document was rendered progressively at open instead of one blocking pass. Saved Source/Preview mode opens directly in split view; WYSIWYG is session-forced to the visual editor while its saved preference is kept.',
        )
      }
      if (ds?.incremental) {
        active.push(
          `**incremental serialization** (${ds.blocks} top-level blocks) — only the edited block is reparsed on save`,
        )
      }
      if (active.length) {
        docSize.text = '$(zap) Large md'
        const tip = new vscode.MarkdownString(
          `**Large-document helpers active:**\n\n${active.map((a) => `- ${a}`).join('\n')}`,
        )
        docSize.tooltip = tip
        docSize.show()
      } else {
        docSize.hide()
      }
    } else if (
      input instanceof vscode.TabInputText &&
      isSupportedMarkdownUri(input.uri)
    ) {
      showFor(input.uri)
      mode.text = '$(code) Source'
      mode.tooltip = 'Markdown: source view — click to open the visual editor'
      mode.command = 'vmde.openEditor'
      mode.show()
      docSize.hide() // no webview in source view → the marker doesn't apply
    } else {
      reading.hide()
      mode.hide()
      docSize.hide()
    }
  }
}
