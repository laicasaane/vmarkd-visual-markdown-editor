import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'softbreak.md')

test.afterEach(async ({ evaluateInVSCode }) => {
  await evaluateInVSCode(async (vscode) => {
    const config = vscode.workspace.getConfiguration('vmde')
    await config.update(
      'preview.reflowLineBreaks',
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

type PreviewBreaks = {
  soft: number
  backslashHard: number
  quoteSoft: number
}

test('preview reflow applies live while hard breaks, editor bytes, caret and scroll stay intact', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)
  await evaluateInVSCode(
    async (vscode, args: string[]) => {
      const config = vscode.workspace.getConfiguration('vmde')
      await config.update(
        'editor.defaultMode',
        'ir',
        vscode.ConfigurationTarget.Global,
      )
      await config.update(
        'preview.reflowLineBreaks',
        false,
        vscode.ConfigurationTarget.Global,
      )
      await vscode.extensions.getExtension('laicasaane.vmde')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmde.editor',
      )
    },
    [FIXTURE] as [string],
  )

  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await expect
    .poll(
      () => frame.locator('.vditor-ir p').filter({ hasText: 'alpha' }).count(),
      { timeout: 30_000 },
    )
    .toBe(1)

  const readBreaks = () =>
    frame.locator('body').evaluate((): PreviewBreaks => {
      const paragraphs = document.querySelectorAll(
        '.vditor-preview .vditor-reset > p',
      )
      return {
        soft: paragraphs[0]?.querySelectorAll('br').length ?? -1,
        backslashHard: paragraphs[1]?.querySelectorAll('br').length ?? -1,
        quoteSoft: document.querySelectorAll('.vditor-preview blockquote br')
          .length,
      }
    })

  await frame.locator('body').evaluate(() => {
    const outer = (window as any).vditor
    const inner = outer.vditor
    const paragraph = [...inner.ir.element.querySelectorAll('p')].find(
      (candidate) => candidate.textContent?.includes('alpha'),
    )
    const text = paragraph?.firstChild
    if (!text) throw new Error('soft-break fixture paragraph text missing')
    const range = document.createRange()
    range.setStart(text, 2)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    const scroller = inner.ir.element.parentElement as HTMLElement
    scroller.style.height = '120px'
    scroller.style.overflow = 'auto'
    scroller.scrollTop = 40

    const w = window as any
    w.__task83Before = {
      outer,
      anchor: selection?.anchorNode ?? null,
      offset: selection?.anchorOffset ?? -1,
      bytes: outer.getValue(),
      irHtml: inner.ir.element.innerHTML,
      scroller,
      scrollTop: scroller.scrollTop,
    }
    inner.preview.element.style.display = 'block'
    inner.preview.render(inner)
  })

  await expect.poll(readBreaks, { timeout: 30_000 }).toEqual({
    soft: 1,
    backslashHard: 1,
    quoteSoft: 1,
  })

  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('vmde')
      .update(
        'preview.reflowLineBreaks',
        true,
        vscode.ConfigurationTarget.Global,
      )
  })

  await expect.poll(readBreaks, { timeout: 30_000 }).toEqual({
    soft: 0,
    backslashHard: 1,
    quoteSoft: 0,
  })

  const preserved = await frame.locator('body').evaluate(() => {
    const w = window as any
    const before = w.__task83Before
    const outer = w.vditor
    const inner = outer.vditor
    const selection = window.getSelection()
    return {
      sameEditor: before.outer === outer,
      sameCaretNode: before.anchor === selection?.anchorNode,
      sameCaretOffset: before.offset === selection?.anchorOffset,
      sameBytes: before.bytes === outer.getValue(),
      sameIrDom: before.irHtml === inner.ir.element.innerHTML,
      sameScroller: before.scroller === inner.ir.element.parentElement,
      sameScrollTop: before.scrollTop === before.scroller.scrollTop,
    }
  })
  expect(preserved).toEqual({
    sameEditor: true,
    sameCaretNode: true,
    sameCaretOffset: true,
    sameBytes: true,
    sameIrDom: true,
    sameScroller: true,
    sameScrollTop: true,
  })
})
