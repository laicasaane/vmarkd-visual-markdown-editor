import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'rewrap.md')
const ORIGINAL = readFileSync(FIXTURE, 'utf8')
const WRAPPED = ORIGINAL.replace(
  'alpha beta gamma delta epsilon',
  'alpha beta\ngamma delta\nepsilon',
)

test.afterEach(async ({ evaluateInVSCode }) => {
  await evaluateInVSCode(async (vscode) => {
    const config = vscode.workspace.getConfiguration('vmde')
    await config.update(
      'editor.wrapColumn',
      undefined,
      vscode.ConfigurationTarget.Global,
    )
    await config.update(
      'editor.defaultMode',
      undefined,
      vscode.ConfigurationTarget.Global,
    )
  })
})

test('Alt+Q rewraps once with caret, scroll, writeback, and undo preserved in all modes', async ({
  workbox,
  evaluateInVSCode,
  baseDir,
}) => {
  test.setTimeout(180_000)
  const docPath = path.join(baseDir, 'rewrap.md')
  writeFileSync(docPath, ORIGINAL)
  await evaluateInVSCode(
    async (vscode, args: string[]) => {
      const config = vscode.workspace.getConfiguration('vmde')
      await config.update(
        'editor.wrapColumn',
        12,
        vscode.ConfigurationTarget.Global,
      )
      await config.update(
        'editor.defaultMode',
        'ir',
        vscode.ConfigurationTarget.Global,
      )
      await vscode.extensions.getExtension('laicasaane.vmde')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmde.editor',
      )
    },
    [docPath] as [string],
  )

  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })

  const docText = () =>
    evaluateInVSCode(
      async (vscode, args: string[]) =>
        vscode.workspace.textDocuments
          .find((doc) => doc.uri.fsPath === args[0])
          ?.getText() ?? '',
      [docPath] as [string],
    ) as Promise<string>

  const replaceDocument = (text: string) =>
    evaluateInVSCode(
      async (vscode, args: [string, string]) => {
        const [fsPath, next] = args
        const doc = vscode.workspace.textDocuments.find(
          (candidate) => candidate.uri.fsPath === fsPath,
        )
        if (!doc) throw new Error('rewrap document not open')
        const edit = new vscode.WorkspaceEdit()
        edit.replace(
          doc.uri,
          new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length),
          ),
          next,
        )
        await vscode.workspace.applyEdit(edit)
      },
      [docPath, text] as [string, string],
    )

  const currentValue = () =>
    frame
      .locator('body')
      .evaluate(() =>
        (
          window as unknown as { vditor: { getValue(): string } }
        ).vditor.getValue(),
      ) as Promise<string>

  async function switchMode(mode: 'ir' | 'wysiwyg' | 'sv') {
    await frame.locator('body').evaluate((_body, nextMode) => {
      const inner = (window as any).vditor.vditor
      if (inner.currentMode === nextMode) return
      inner.toolbar.elements['edit-mode']?.children[0]?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
      document
        .querySelector(`button[data-mode="${nextMode}"]`)
        ?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        )
    }, mode)
    await expect
      .poll(() =>
        frame
          .locator('body')
          .evaluate(() => (window as any).vditor.vditor.currentMode),
      )
      .toBe(mode)
  }

  async function placeCaret(mode: 'ir' | 'wysiwyg' | 'sv') {
    const selector = `.vditor-${mode}`
    await frame
      .locator(selector)
      .first()
      .click({ position: { x: 4, y: 4 } })
    await frame.locator('body').evaluate((_body, surface) => {
      const editor = document.querySelector(surface) as HTMLElement | null
      if (!editor) throw new Error(`missing ${surface}`)
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      let target: Text | null = null
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node.textContent ?? '').includes('gamma')) {
          target = node as Text
          break
        }
      }
      if (!target) throw new Error(`gamma not found in ${surface}`)
      const range = document.createRange()
      range.setStart(target, target.data.indexOf('gamma') + 2)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
      const scroller = editor.parentElement as HTMLElement
      scroller.style.height = '80px'
      scroller.style.overflow = 'auto'
      scroller.scrollTop = 20
      ;(window as any).__rewrapScroll = { scroller, top: scroller.scrollTop }
    }, selector)
  }

  async function sourceCaretOffset(mode: 'ir' | 'wysiwyg' | 'sv') {
    return frame.locator('body').evaluate((_body, currentMode) => {
      const outer = (window as any).vditor
      if (currentMode !== 'sv') {
        const editor = outer.vditor[currentMode].element as HTMLElement
        const selection = window.getSelection()!
        const range = selection.getRangeAt(0).cloneRange()
        const marker = '\uE200REAL_REWRAP_CARET'
        const markerNode = document.createTextNode(marker)
        range.insertNode(markerNode)
        const html = editor.innerHTML
        const markdown =
          currentMode === 'ir'
            ? outer.vditor.lute.VditorIRDOM2Md(html)
            : outer.vditor.lute.VditorDOM2Md(html)
        markerNode.remove()
        editor.normalize()
        return markdown.indexOf(marker)
      }
      const editor = outer.vditor.sv.element as HTMLElement
      const selection = window.getSelection()!
      const caret = selection.getRangeAt(0)
      const before = caret.cloneRange()
      before.selectNodeContents(editor)
      before.setEnd(caret.startContainer, caret.startOffset)
      return before.toString().length
    }, mode)
  }

  for (const mode of ['ir', 'wysiwyg', 'sv'] as const) {
    if ((await docText()) !== ORIGINAL) {
      await replaceDocument(ORIGINAL)
      await expect.poll(currentValue, { timeout: 20_000 }).toBe(ORIGINAL)
    }
    await switchMode(mode)
    await placeCaret(mode)
    const canonicalBefore = await currentValue()
    const canonicalWrapped = canonicalBefore.replace(
      'alpha beta gamma delta epsilon',
      'alpha beta\ngamma delta\nepsilon',
    )

    await workbox.keyboard.press('Alt+q')

    await expect.poll(docText, { timeout: 20_000 }).toBe(WRAPPED)
    expect(await currentValue()).toBe(canonicalWrapped)
    expect(await sourceCaretOffset(mode)).toBe(13)
    const scrollKept = await frame.locator('body').evaluate(() => {
      const saved = (window as any).__rewrapScroll
      return saved.scroller.scrollTop === saved.top
    })
    expect(scrollKept).toBe(true)

    await workbox.keyboard.press('Control+z')
    await expect.poll(docText, { timeout: 20_000 }).toBe(ORIGINAL)
  }
})
