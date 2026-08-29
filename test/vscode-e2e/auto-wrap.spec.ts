import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'auto-wrap.md')
const ORIGINAL = readFileSync(FIXTURE, 'utf8').replace('<2sp>', '  ')
const TYPED = ORIGINAL.replace('gamma', 'gammaz')
const WRAPPED = TYPED.replace(
  'alpha beta gammaz delta epsilon',
  'alpha beta\ngammaz delta\nepsilon',
)

test.afterEach(async ({ evaluateInVSCode }) => {
  await evaluateInVSCode(async (vscode) => {
    const config = vscode.workspace.getConfiguration('vmde')
    for (const key of [
      'editor.wrapColumn',
      'editor.autoWrap',
      'editor.autoWrapDelay',
      'editor.defaultMode',
      'preview.reflowLineBreaks',
    ]) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Global)
    }
  })
})

test('auto-wrap preserves bytes and interaction state in SV, IR, and WYSIWYG', async ({
  workbox,
  evaluateInVSCode,
  baseDir,
}) => {
  test.setTimeout(240_000)
  const docPath = path.join(baseDir, 'auto-wrap.md')
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
        'editor.autoWrap',
        true,
        vscode.ConfigurationTarget.Global,
      )
      await config.update(
        'editor.autoWrapDelay',
        500,
        vscode.ConfigurationTarget.Global,
      )
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
        if (!doc) throw new Error('auto-wrap document not open')
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
      .evaluate(() => (window as any).vditor.getValue()) as Promise<string>

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

  async function waitForUndoReady() {
    await expect
      .poll(() =>
        frame.locator('body').evaluate(() => {
          const inner = (window as any).vditor.vditor
          return inner.undo[inner.currentMode].undoStack.length
        }),
      )
      .toBeGreaterThanOrEqual(1)
  }

  async function placeCaret(mode: 'ir' | 'wysiwyg' | 'sv') {
    const selector = `.vditor-${mode}`
    await frame
      .locator(selector)
      .first()
      .click({ position: { x: 4, y: 4 } })
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one in-page fixture operation resolves the mode surface, places a real caret, and manufactures measurable scroll overflow
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
      range.setStart(target, target.data.indexOf('gamma') + 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
      const wrapper = editor.parentElement as HTMLElement
      editor.style.minHeight = '2000px'
      wrapper.style.display = 'block'
      wrapper.style.height = '80px'
      wrapper.style.maxHeight = '80px'
      wrapper.style.overflowY = 'scroll'
      let candidate: HTMLElement | null = editor
      let scroller: HTMLElement | null = null
      while (candidate && candidate !== document.body) {
        const overflow = getComputedStyle(candidate).overflowY
        if (
          (overflow === 'auto' ||
            overflow === 'scroll' ||
            overflow === 'overlay') &&
          candidate.scrollHeight > candidate.clientHeight + 1
        ) {
          scroller = candidate
          break
        }
        candidate = candidate.parentElement
      }
      scroller ??=
        (document.scrollingElement as HTMLElement | null) ??
        document.documentElement
      scroller.scrollTop = 20
      if (scroller.scrollTop === 0)
        throw new Error('scroll fixture did not overflow')
      ;(window as any).__autoWrapScroll = { scroller, top: scroller.scrollTop }
    }, selector)
  }

  async function placeCaretAtText(
    mode: 'ir' | 'wysiwyg' | 'sv',
    needle: string,
    offset: number,
  ) {
    const editor = frame.locator(`.vditor-${mode}`).first()
    await editor.click({ position: { x: 4, y: 4 } })
    await editor.evaluate(
      (surface, target) => {
        const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = (node.textContent ?? '').indexOf(target.needle)
          if (index < 0) continue
          const range = document.createRange()
          range.setStart(node, index + target.offset)
          range.collapse(true)
          const selection = window.getSelection()!
          selection.removeAllRanges()
          selection.addRange(range)
          surface.focus()
          return
        }
        throw new Error(`${target.needle} not found in .vditor-${target.mode}`)
      },
      { mode, needle, offset },
    )
  }

  async function assertCaretAndScroll(mode: 'ir' | 'wysiwyg' | 'sv') {
    const state = await frame.locator('body').evaluate((_body, currentMode) => {
      const editor = document.querySelector(
        `.vditor-${currentMode}`,
      ) as HTMLElement
      const selection = window.getSelection()!
      const caret = selection.getRangeAt(0)
      const before = caret.cloneRange()
      before.selectNodeContents(editor)
      before.setEnd(caret.startContainer, caret.startOffset)
      const saved = (window as any).__autoWrapScroll
      return {
        offset: before.toString().length,
        scroll: saved.scroller.scrollTop,
        expectedScroll: saved.top,
        maxScroll: Math.max(
          0,
          saved.scroller.scrollHeight - saved.scroller.clientHeight,
        ),
      }
    }, mode)
    expect(state.offset).toBe(17)
    expect(state.expectedScroll).toBeGreaterThan(0)
    expect(state.scroll).toBe(Math.min(state.expectedScroll, state.maxScroll))
    expect(state.scroll).toBeGreaterThan(0)
  }

  async function previewBreaks() {
    return frame.locator('body').evaluate(() => {
      const inner = (window as any).vditor.vditor
      inner.preview.element.style.display = 'block'
      inner.preview.render(inner)
      const paragraphs =
        inner.preview.previewElement.querySelectorAll(':scope > p')
      return {
        soft: paragraphs[0]?.querySelectorAll('br').length ?? -1,
        twoSpace: paragraphs[1]?.querySelectorAll('br').length ?? -1,
        backslash: paragraphs[2]?.querySelectorAll('br').length ?? -1,
      }
    }) as Promise<{ soft: number; twoSpace: number; backslash: number }>
  }

  for (const mode of ['ir', 'wysiwyg', 'sv'] as const) {
    if ((await docText()) !== ORIGINAL) {
      await replaceDocument(ORIGINAL)
      await expect.poll(docText, { timeout: 20_000 }).toBe(ORIGINAL)
    }
    await switchMode(mode)
    await waitForUndoReady()
    await placeCaret(mode)

    await workbox.keyboard.type('z')
    const scrollAfterTyping = await frame.locator('body').evaluate(() => {
      const saved = (window as any).__autoWrapScroll
      saved.top = saved.scroller.scrollTop
      return saved.top
    })
    expect(scrollAfterTyping).toBeGreaterThan(0)

    await expect.poll(docText, { timeout: 20_000 }).toBe(WRAPPED)
    expect(await currentValue()).toContain('two-space alpha  \ntwo-space beta')
    expect(await currentValue()).toContain('backslash alpha\\\nbackslash beta')
    await assertCaretAndScroll(mode)
    if (mode !== 'sv') {
      const identity = await frame.locator('body').evaluate(() => {
        const inner = (window as any).vditor.vditor
        const editor = inner[inner.currentMode].element as HTMLElement
        return {
          soft: editor.querySelectorAll('[data-vmde-soft-break="1"]').length,
          hard: editor.querySelectorAll('[data-vmde-hard-break]').length,
        }
      })
      expect(identity.soft).toBeGreaterThanOrEqual(2)
      expect(identity.hard).toBe(2)
    }
    await expect.poll(previewBreaks).toEqual({
      soft: 0,
      twoSpace: 1,
      backslash: 1,
    })

    await workbox.keyboard.press('Control+z')
    await expect.poll(docText, { timeout: 20_000 }).toBe(TYPED)
    await workbox.keyboard.press('Control+z')
    await expect.poll(docText, { timeout: 20_000 }).toBe(ORIGINAL)
  }

  // A pending target belongs to the mode/editor/selection captured at input time. Switching modes
  // before the timer fires must make that target stale and produce no host edit.
  await switchMode('ir')
  await placeCaret('ir')
  await frame.locator('.vditor-ir').evaluate((editor) => {
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'x',
      }),
    )
  })
  await switchMode('wysiwyg')
  await frame
    .locator('body')
    .evaluate(() => new Promise((resolve) => setTimeout(resolve, 650)))
  expect(await docText()).toBe(ORIGINAL)

  // IME safety: an insertText input during composition must not serialize or wrap until the
  // composition ends. The fixed wait is a negative-observation window, not a settle delay.
  await switchMode('ir')
  await placeCaret('ir')
  const beforeComposition = await docText()
  await frame.locator('body').evaluate(() => {
    const editor = document.querySelector('.vditor-ir')!
    editor.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true }),
    )
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'x',
        isComposing: true,
      }),
    )
  })
  await frame
    .locator('body')
    .evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)))
  expect(await docText()).toBe(beforeComposition)
  // The synthetic composition fixture does not mutate the DOM the way a real IME does. Under
  // sustained full-suite load Vditor can perform a delayed selection correction during the
  // negative-observation window, making auto-wrap's intentionally strict captured-target guard
  // reject the stale synthetic caret. Reassert the same user caret immediately before the real
  // compositionend path; pointerdown only cancels an old timer and leaves the composing input flag.
  await placeCaret('ir')
  await frame.locator('.vditor-ir').evaluate((editor) => {
    editor.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true }),
    )
  })
  await expect
    .poll(docText, { timeout: 20_000 })
    .toBe(
      beforeComposition.replace(
        'alpha beta gamma delta epsilon',
        'alpha beta\ngamma delta\nepsilon',
      ),
    )

  const beforeToggle = await docText()
  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('vmde')
      .update('editor.autoWrap', false, vscode.ConfigurationTarget.Global)
  })
  await expect
    .poll(() =>
      frame
        .locator('.vditor-ir')
        .evaluate(
          (editor) =>
            editor.querySelectorAll('[data-vmde-soft-break="1"]').length,
        ),
    )
    .toBe(0)
  expect(await docText()).toBe(beforeToggle)
  await expect.poll(previewBreaks).toEqual({
    soft: 2,
    twoSpace: 1,
    backslash: 1,
  })

  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('vmde')
      .update('editor.autoWrap', true, vscode.ConfigurationTarget.Global)
  })
  await expect
    .poll(() =>
      frame
        .locator('.vditor-ir')
        .evaluate(
          (editor) =>
            editor.querySelectorAll('[data-vmde-soft-break="1"]').length,
        ),
    )
    .toBeGreaterThanOrEqual(2)
  expect(await docText()).toBe(beforeToggle)
  await expect.poll(previewBreaks).toEqual({
    soft: 0,
    twoSpace: 1,
    backslash: 1,
  })

  const quoteOriginal = [
    '> **Selected option:** A',
    '>',
    '> **Required `MonoView` members:**',
    '>',
    '> **Required `UIToolkitView` members:**',
    '>',
    '> **Lifecycle constraints:** **Notes:** Add to plan file instead of proposal',
    '',
  ].join('\n')
  const quoteExpected = [
    '> **Selected option:** A',
    '>',
    '> **Required `MonoView` members:**',
    '>',
    '> **Required `UIToolkitView` members:**',
    '>',
    '> **Lifecycle constraints:** **Notes:** Add to plan file',
    // Vditor serializes the new line as a valid lazy blockquote continuation.
    'instead of proposalx',
    '',
  ].join('\n')
  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('vmde')
      .update('editor.wrapColumn', 60, vscode.ConfigurationTarget.Global)
  })
  await replaceDocument(quoteOriginal)
  await expect.poll(docText, { timeout: 20_000 }).toBe(quoteOriginal)
  await switchMode('ir')
  await placeCaretAtText('ir', 'proposal', 'proposal'.length)

  await workbox.keyboard.type('x')

  await expect.poll(docText, { timeout: 20_000 }).toBe(quoteExpected)
  expect(await currentValue()).toBe(quoteExpected)

  const finalText = await docText()
  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.files.save')
  })
  await expect
    .poll(
      () =>
        evaluateInVSCode(
          async (vscode, args: string[]) =>
            Buffer.from(
              await vscode.workspace.fs.readFile(vscode.Uri.file(args[0])),
            ).toString('utf8'),
          [docPath] as [string],
        ) as Promise<string>,
      { timeout: 20_000 },
    )
    .toBe(finalText)

  await evaluateInVSCode(
    async (vscode, args: string[]) => {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmde.editor',
      )
    },
    [docPath] as [string],
  )
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await expect.poll(currentValue, { timeout: 20_000 }).toBe(finalText)
})
