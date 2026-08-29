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
    frame.locator('body').evaluate(() => {
      const outer = (window as any).vditor
      return outer?.vditor?.lute ? outer.getValue() : null
    }) as Promise<string | null>

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

  async function insertTextAtText(
    mode: 'ir' | 'wysiwyg' | 'sv',
    needle: string,
    offset: number,
    text: string,
    rewrapAfterInsert: boolean,
  ): Promise<boolean | null> {
    const editor = frame.locator(`.vditor-${mode}`).first()
    return editor.evaluate(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one atomic in-page edit locates the requested text, installs the Range, performs browser editing, and optionally runs the existing rewrap transaction before caret normalization can race it
      (surface, target) => {
        surface.focus()
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
          if (!document.execCommand('insertText', false, target.text)) {
            throw new Error(`insertText failed for ${target.needle}`)
          }
          return target.rewrapAfterInsert
            ? ((window as any).__vmdeRunRewrapForTest?.() ?? false)
            : null
        }
        throw new Error(`${target.needle} not found in .vditor-${target.mode}`)
      },
      { mode, needle, offset, text, rewrapAfterInsert },
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
          whiteSpace: getComputedStyle(editor.querySelector('p')!).whiteSpace,
        }
      })
      expect(identity.soft).toBe(0)
      expect(identity.hard).toBe(2)
      expect(identity.whiteSpace).toBe('normal')
    }
    await expect.poll(previewBreaks).toEqual({
      soft: 2,
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
    .toBe(0)
  expect(await docText()).toBe(beforeToggle)
  await expect.poll(previewBreaks).toEqual({
    soft: 2,
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
    '> instead of proposalx',
    '',
  ].join('\n')
  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('vmde')
      .update('editor.wrapColumn', 60, vscode.ConfigurationTarget.Global)
  })
  await replaceDocument(quoteOriginal)
  await expect.poll(docText, { timeout: 20_000 }).toBe(quoteOriginal)
  await expect.poll(currentValue, { timeout: 20_000 }).toBe(quoteOriginal)
  await switchMode('ir')
  expect(
    await insertTextAtText('ir', 'proposal', 'proposal'.length, 'x', true),
  ).toBe(true)

  await expect.poll(docText, { timeout: 20_000 }).toBe(quoteExpected)
  expect(await currentValue()).toBe(quoteExpected)

  const composite = [
    'Plain sibling unchanged',
    '',
    '- list sibling unchanged',
    '',
    '- [ ]  task sibling unchanged',
    '',
    '1. ordered sibling unchanged',
    '',
    '>> nested sibling unchanged',
    '>>',
    '>',
    '> [!NOTE]',
    '> callout alpha beta gamma delta epsilon',
    '>',
    '> quoted sibling unchanged',
    '',
    '> ```js',
    '> const protected = "alpha beta gamma delta"',
    '> ```',
    '',
    '> $$',
    '> alpha beta gamma',
    '> $$',
    '',
    'A Setext Heading',
    '----------------',
    '',
  ].join('\n')
  const compositeExpected = composite.replace(
    '> callout alpha beta gamma delta epsilon',
    '> callout alpha beta gamma\n> delta epsilonx',
  )
  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('vmde')
      .update('editor.wrapColumn', 30, vscode.ConfigurationTarget.Global)
  })
  await replaceDocument(composite)
  await expect.poll(docText, { timeout: 20_000 }).toBe(composite)
  await expect.poll(currentValue, { timeout: 20_000 }).toBe(composite)
  expect(
    await insertTextAtText('ir', 'epsilon', 'epsilon'.length, 'x', true),
  ).toBe(true)

  await expect.poll(docText, { timeout: 20_000 }).toBe(compositeExpected)
  expect(await currentValue()).toBe(compositeExpected)

  const nestedQuote = [
    '> outer alpha beta',
    '>',
    '>> nested gamma delta',
    '>>',
    '>',
    '> tail epsilon',
    '',
  ].join('\n')
  const nestedQuoteExpected = [
    '> outer alpha',
    '> betax',
    '>',
    '>> nested gamma delta',
    '>>',
    '>',
    '> tail epsilon',
    '',
  ].join('\n')
  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('vmde')
      .update('editor.wrapColumn', 14, vscode.ConfigurationTarget.Global)
  })
  await replaceDocument(nestedQuote)
  await expect.poll(docText, { timeout: 20_000 }).toBe(nestedQuote)
  await expect.poll(currentValue, { timeout: 20_000 }).toBe(nestedQuote)
  expect(await insertTextAtText('ir', 'beta', 'beta'.length, 'x', true)).toBe(
    true,
  )

  await expect.poll(docText, { timeout: 20_000 }).toBe(nestedQuoteExpected)
  expect(await currentValue()).toBe(nestedQuoteExpected)

  const protectedFence = '> ```\n>> alpha beta gamma delta\n> ```\n'
  const typedProtectedFence = protectedFence.replace('gamma', 'gammax')
  await evaluateInVSCode(async (vscode) => {
    await vscode.workspace
      .getConfiguration('vmde')
      .update('editor.wrapColumn', 12, vscode.ConfigurationTarget.Global)
  })
  await replaceDocument(protectedFence)
  await expect.poll(docText, { timeout: 20_000 }).toBe(protectedFence)
  await expect.poll(currentValue, { timeout: 20_000 }).toBe(protectedFence)
  expect(await insertTextAtText('ir', 'gamma', 'gamma'.length, 'x', true)).toBe(
    false,
  )
  await expect.poll(docText, { timeout: 20_000 }).toBe(typedProtectedFence)
  await frame
    .locator('body')
    .evaluate(() => new Promise((resolve) => setTimeout(resolve, 650)))
  expect(await docText()).toBe(typedProtectedFence)
  expect(await currentValue()).toBe(typedProtectedFence)

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
