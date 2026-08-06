import { t } from '../util/lang'
import {
  backIcon,
  editInVsCodeIcon,
  linkIcon,
  moreIcon,
  outlineIcon,
  wikiPagesIcon,
} from './toolbar-icons'

// Build-time constants injected via esbuild `define` (see esbuild-shared.mjs):
// the Vditor version and the vendored Lute pin (commit + date). Empty if unpinned.
declare const __VMARKD_VDITOR_VERSION__: string
declare const __VMARKD_LUTE_COMMIT__: string
declare const __VMARKD_LUTE_COMMITTED_AT__: string

// "About vMarkd" dialog (shown via vditor.tip.show). Mirrors the version line of the
// "About vditor" dialog — Vditor + the pinned Lute build as a GitHub commit link +
// date — and links to the vMarkd repo. Rendered inside the webview tip; the links
// are chrome (not editor content), so they open on a plain click. Pure (takes its
// version data as args) so it's unit-testable; the call site passes the build-time
// `define` constants.
export const VMARKD_REPO =
  'https://github.com/spiochacz/vmarkd-visual-markdown-editor'
export function aboutVmarkdHtml(v: {
  vditorVersion: string
  luteCommit: string
  luteCommittedAt: string
}): string {
  const lute = v.luteCommit
    ? `Lute <a href="https://github.com/88250/lute/commit/${v.luteCommit}" target="_blank">${v.luteCommit.slice(0, 7)}</a>${v.luteCommittedAt ? ` (${v.luteCommittedAt})` : ''}`
    : 'Lute'
  return (
    '<div style="max-width: 440px;font-size: 14px;line-height: 22px;margin-bottom: 14px;">' +
    '<p style="text-align: center;margin: 14px 0"><em>vMarkd — a visual Markdown editor for VS Code</em></p>' +
    '<ul style="list-style: none">' +
    `<li>GitHub: <a href="${VMARKD_REPO}" target="_blank">spiochacz/vmarkd-visual-markdown-editor</a></li>` +
    '<li>License: MIT</li>' +
    `<li>Version: Vditor v${v.vditorVersion} / ${lute}</li>` +
    '</ul>' +
    '</div>'
  )
}

function getEditorRange(): Range | undefined {
  const mode = vditor.getCurrentMode()
  const editor = vditor.vditor?.[mode]?.element as HTMLElement | undefined
  const selection = window.getSelection()

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    if (
      editor?.contains(range.commonAncestorContainer) ||
      editor?.isEqualNode(range.commonAncestorContainer as Node)
    ) {
      return range.cloneRange()
    }
  }

  const storedRange = vditor.vditor?.[mode]?.range as Range | undefined
  return storedRange?.cloneRange()
}

function getCharBeforeRange(range: Range): string {
  const mode = vditor.getCurrentMode()
  const editor = vditor.vditor?.[mode]?.element as HTMLElement | undefined
  if (!editor) return ''

  const beforeRange = range.cloneRange()
  beforeRange.selectNodeContents(editor)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  return beforeRange.toString().slice(-1)
}

function restoreEditorRange(range: Range | undefined) {
  if (!range) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  const mode = vditor.getCurrentMode()
  // Mirrors the optional-chained reads above (getEditorRange/getCharBeforeRange): the current
  // mode's editor state can be absent (e.g. mode just switched), in which case there's nowhere
  // to store the range — same no-op the reads already tolerate.
  const modeState = vditor.vditor[mode]
  if (!modeState) return
  modeState.range = range.cloneRange()
}

function insertMarkdownLink() {
  const range = getEditorRange()
  const selectedText = (range?.toString() || '').trim()
  const beforeChar = range ? getCharBeforeRange(range) : ''
  const needsLeadingSpace = Boolean(beforeChar) && !/\s/.test(beforeChar)
  const leadingSpace = needsLeadingSpace ? ' ' : ''

  vditor.focus()
  restoreEditorRange(range)

  if (selectedText) {
    vditor.updateValue(`${leadingSpace}[${selectedText}]()`)
    return
  }

  vditor.insertValue(`${leadingSpace}[]()`)
}

interface ToolbarOptions {
  wikiEnabled?: boolean
}

export function createToolbar(options: ToolbarOptions = {}) {
  const toolbarItems = [
    'emoji',
    'headings',
    'bold',
    'italic',
    'strike',
    {
      hotkey: '⌘K',
      icon: linkIcon,
      name: 'link',
      click() {
        insertMarkdownLink()
      },
      tipPosition: 'n',
    },
    '|',
    'list',
    { name: 'ordered-list', tip: t('numberedList') },
    'check',
    'outdent',
    'indent',
    '|',
    'quote',
    { name: 'line', tip: t('horizontalRule') },
    'code',
    'inline-code',
    'insert-before',
    'insert-after',
    '|',
    'upload',
    'table',
    '|',
    'undo',
    {
      name: 'redo',
      // Vditor also handles the OS-standard Shift+Ctrl/Cmd+Z chord, but its
      // default tooltip advertises only Ctrl/Cmd+Y.
      tip: `${t('redo')} (Shift+Ctrl/Cmd+Z)`,
    },
    '|',
    { name: 'outline', icon: outlineIcon },
    'preview',
    '|',
    ...(options.wikiEnabled
      ? [
          {
            name: 'navigate-back',
            tipPosition: 's',
            tip: t('navigateBack'),
            className: 'right',
            icon: backIcon,
            click() {
              vscode.postMessage({
                command: 'navigate-back',
              })
            },
          },
          {
            name: 'wiki-pages',
            tipPosition: 's',
            tip: t('wikiPages'),
            className: 'right',
            icon: wikiPagesIcon,
            click() {
              vscode.postMessage({
                command: 'list-wiki-pages',
              })
            },
          },
          '|',
        ]
      : []),
    {
      name: 'edit-in-vscode',
      tipPosition: 's',
      tip: t('editInVsCode'),
      className: 'right',
      icon: editInVsCodeIcon,
      click() {
        vscode.postMessage({
          command: 'edit-in-vscode',
        })
      },
    },
    { name: 'edit-mode', tipPosition: 'e' },
    {
      name: 'more',
      tipPosition: 'e',
      icon: moreIcon,
      toolbar: [
        'both',
        // content-theme + code-theme pickers dropped from the toolbar — VS Code
        // manages the theme: content follows the editor colours, and the code
        // block highlight is the `markdown-editor.codeTheme` setting.
        // outline + preview promoted to the main toolbar.
        {
          name: 'settings',
          tip: t('settings'),
          // Plain text label, matching the sibling dropdown rows (Outline/Preview/
          // Info/Help render as text via the .vditor-hint button rule). No gear icon.
          icon: 'Settings',
          click() {
            vscode.postMessage({
              command: 'open-settings',
            })
          },
        },
        // The 'info' item shows Vditor's original About dialog (translated to English
        // by the fixInfoDialog esbuild patch), with the Help dialog's links folded in
        // as a section below it — so the separate Vditor 'help' item is dropped. Renamed
        // "About Vditor" (tip drives the dropdown label for level-2 items).
        { name: 'info', tip: t('aboutVditor') },
        {
          name: 'about',
          tip: t('aboutVmarkd'),
          // Shows the vMarkd About dialog (version + GitHub link) as a webview tip,
          // matching the "About vditor" dialog. `vditor` is the IVditor instance
          // Vditor passes to a Custom item's click; its `.tip` renders the popup.
          icon: 'About vMarkd',
          click(_event: Event, vditor: any) {
            vditor.tip.show(
              aboutVmarkdHtml({
                vditorVersion: __VMARKD_VDITOR_VERSION__,
                luteCommit: __VMARKD_LUTE_COMMIT__,
                luteCommittedAt: __VMARKD_LUTE_COMMITTED_AT__,
              }),
              0,
            )
          },
        },
      ],
    },
  ]

  return toolbarItems.map((it: any) => {
    if (typeof it === 'string') {
      it = { name: it }
    }
    it.tipPosition = it.tipPosition || 's'
    return it
  })
}
