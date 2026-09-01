import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import {
  docText,
  ExtensionId,
  MarkdownEditorViewType,
  waitForE2EReadiness,
  wf,
} from './webview-helpers'

type TocStats = {
  requests: number
  invalidations: number
  skippedImpacts: number
  refreshes: number
  failures: number
}

function headingRichMarkdown(): string {
  const lines = ['# Task 536 heading document', '', '[toc]', '']
  for (let section = 0; section < 130; section++) {
    lines.push(`## Section ${section}`, '')
    for (let paragraph = 0; paragraph < 7; paragraph++) {
      lines.push(
        `Section ${section} paragraph ${paragraph} keeps a realistic heading-rich document with **bold** and [link](./note.md).`,
        '',
      )
    }
    if (section === 64) {
      lines.push(
        'TARGET ordinary alpha beta gamma delta epsilon',
        '',
        'Inline `code target` stays ordinary.',
        '',
        'STRUCTURAL split target',
        '',
        '- list first item',
        '- list TARGET item',
        '',
        '| Name | Value |',
        '| ---- | ----- |',
        '| row  | TARGET table |',
        '',
      )
    }
  }
  return `${lines.join('\n')}\n`
}

const INITIAL = headingRichMarkdown()
const HEADING_EDITED = INITIAL.replace('## Section 64', '## Section 64!')

test('heading-rich edits invalidate ToC only for semantic structural impact', async ({
  workbox,
  evaluateInVSCode,
  baseDir,
}) => {
  test.setTimeout(240_000)
  expect(INITIAL.split('\n').length).toBeGreaterThan(2_000)
  const file = path.join(baseDir, 'toc-invalidation.md')
  writeFileSync(file, INITIAL)

  await evaluateInVSCode(
    async (vscode, args: [string, string, string]) => {
      const resource = vscode.Uri.file(args[0])
      const config = vscode.workspace.getConfiguration('vmde', resource)
      await config.update(
        'outline.defaultOpen',
        true,
        vscode.ConfigurationTarget.Global,
      )
      await config.update(
        'markdown.toc',
        true,
        vscode.ConfigurationTarget.Global,
      )
      await vscode.extensions.getExtension(args[1])?.activate()
      await vscode.commands.executeCommand('vscode.openWith', resource, args[2])
    },
    [file, ExtensionId, MarkdownEditorViewType] as [string, string, string],
  )

  const frame = wf(workbox)
  await frame.locator('.vditor-ir').waitFor({ timeout: 60_000 })
  await waitForE2EReadiness(
    frame,
    (state) =>
      state.routerReady &&
      state.editorEpoch > 0 &&
      state.mode === 'ir' &&
      Object.values(state.pending).every((count) => count === 0),
    { timeout: 60_000, message: 'Task 536 heading-rich editor readiness' },
  )
  await expect(frame.locator('.vditor-outline__content')).toContainText(
    'Section 64',
  )
  await expect(frame.locator('.vditor-ir .vditor-toc')).toContainText(
    'Section 64',
  )

  await frame.locator('body').evaluate(() => {
    const outer = (window as any).vditor
    const inner = outer.vditor ?? outer
    const original = inner.outline.render.bind(inner.outline)
    ;(window as any).__task536OutlineCalls = 0
    inner.outline.render = (vditor: unknown) => {
      ;(window as any).__task536OutlineCalls++
      return original(vditor)
    }
  })

  const resetStats = () =>
    frame.locator('body').evaluate(() => {
      const stats = (window as any).__vmdeTocInvalidationStats as TocStats
      stats.requests = 0
      stats.invalidations = 0
      stats.skippedImpacts = 0
      stats.refreshes = 0
      stats.failures = 0
      ;(window as any).__task536OutlineCalls = 0
    })
  const settleAndResetStats = async () => {
    await frame
      .locator('body')
      .evaluate(() => new Promise((resolve) => setTimeout(resolve, 350)))
    await resetStats()
  }
  const readStats = () =>
    frame.locator('body').evaluate(() => ({
      stats: (window as any).__vmdeTocInvalidationStats as TocStats,
      outlineCalls: (window as any).__task536OutlineCalls as number,
    }))
  const placeAtEnd = async (
    mode: 'ir' | 'wysiwyg',
    selector: string,
    needle: string,
  ) => {
    const placed = await frame.locator('body').evaluate(
      (_body, args: [string, string, string]) => {
        const [mode, selector, needle] = args
        const surface = document.querySelector<HTMLElement>(`.vditor-${mode}`)
        const target = Array.from(
          surface?.querySelectorAll<HTMLElement>(selector) ?? [],
        ).find((element) => element.textContent?.includes(needle))
        if (!target) return false
        target.scrollIntoView({ block: 'center' })
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            return node.parentElement?.closest(
              '[class*="__marker"], [class*="__preview"], [data-render]',
            )
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT
          },
        })
        let text: Text | null = null
        let next = walker.nextNode() as Text | null
        while (next) {
          text = next
          next = walker.nextNode() as Text | null
        }
        if (!text) return false
        target.focus({ preventScroll: true })
        const range = document.createRange()
        range.setStart(text, text.data.length)
        range.collapse(true)
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        ;(window as any).__vmdeRequestCaret?.({
          node: range.startContainer,
          offset: range.startOffset,
        })
        return true
      },
      [mode, selector, needle] as [string, string, string],
    )
    expect(placed, `could not place ${mode} caret at ${needle}`).toBe(true)
  }
  const expectNoRefresh = async () => {
    await frame
      .locator('body')
      .evaluate(() => new Promise((resolve) => setTimeout(resolve, 350)))
    const result = await readStats()
    expect(result.stats.invalidations).toBe(0)
    expect(result.stats.refreshes).toBe(0)
    expect(result.stats.failures).toBe(0)
    expect(result.outlineCalls).toBe(0)
  }
  const replaceDocument = (content: string) =>
    evaluateInVSCode(
      async (vscode, args: [string, string]) => {
        const document = vscode.workspace.textDocuments.find(
          (candidate) => candidate.uri.fsPath === args[0],
        )!
        const last = document.lineAt(document.lineCount - 1)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, last.range.end.line, last.range.end.character),
          args[1],
        )
        await vscode.workspace.applyEdit(edit)
      },
      [file, content] as [string, string],
    )

  const firstExternal = INITIAL.replace(
    '## Section 0',
    '### External Section 0',
  )
  await resetStats()
  await replaceDocument(firstExternal)
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(firstExternal)
  await expect.poll(async () => (await readStats()).stats.refreshes).toBe(1)
  expect((await readStats()).outlineCalls).toBe(1)
  await expect
    .poll(() =>
      frame.locator('body').evaluate(() => {
        const surface = document.querySelector('.vditor-ir')
        const targets = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.vditor-ir .vditor-toc [data-target-id]',
          ),
        )
        return (
          targets.length > 0 &&
          targets.every((target) => {
            const resolved = document.getElementById(target.dataset.targetId!)
            return (
              resolved?.matches('h1, h2, h3, h4, h5, h6') === true &&
              surface?.contains(resolved) === true
            )
          })
        )
      }),
    )
    .toBe(true)
  await resetStats()
  await replaceDocument(INITIAL)
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(INITIAL)
  await expect.poll(async () => (await readStats()).stats.refreshes).toBe(1)
  expect((await readStats()).outlineCalls).toBe(1)

  for (const [selector, needle, text] of [
    ['p', 'TARGET ordinary', 'ABCDEFGH'],
    ['li', 'list TARGET item', 'X'],
    ['td', 'TARGET table', 'X'],
    ['code', 'code target', 'X'],
  ] as const) {
    await placeAtEnd('ir', selector, needle)
    await settleAndResetStats()
    await workbox.keyboard.type(text, { delay: 15 })
    for (let index = 0; index < text.length; index++)
      await workbox.keyboard.press('Backspace')
    await expect.poll(() => docText(evaluateInVSCode, file)).toBe(INITIAL)
    await expectNoRefresh()
  }

  const heading = frame
    .locator('.vditor-ir h2')
    .filter({ hasText: 'Section 64' })
    .first()
  await heading.click()
  await workbox.keyboard.press('End')
  await resetStats()
  await workbox.keyboard.type('!')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(HEADING_EDITED)
  await expect.poll(async () => (await readStats()).stats.refreshes).toBe(1)
  const headingRefresh = await readStats()
  expect(headingRefresh.stats.refreshes).toBe(1)
  expect(headingRefresh.outlineCalls).toBe(1)
  await expect(frame.locator('.vditor-outline__content')).toContainText(
    'Section 64!',
  )
  await expect(frame.locator('.vditor-ir .vditor-toc')).toContainText(
    'Section 64!',
  )

  await resetStats()
  await workbox.keyboard.press('Control+z')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(INITIAL)
  await expect.poll(async () => (await readStats()).stats.refreshes).toBe(1)
  await settleAndResetStats()
  await workbox.keyboard.press('Control+y')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(HEADING_EDITED)
  await expect.poll(async () => (await readStats()).stats.refreshes).toBe(1)

  const laterHeadingIdBefore = await frame
    .locator('.vditor-ir h2')
    .filter({ hasText: 'Section 65' })
    .getAttribute('id')
  await placeAtEnd('ir', 'p', 'STRUCTURAL split target')
  await resetStats()
  await workbox.keyboard.press('Enter')
  await workbox.keyboard.type('inserted block', { delay: 15 })
  await expect
    .poll(() => docText(evaluateInVSCode, file))
    .toContain('STRUCTURAL split target\n\ninserted block')
  await expect.poll(async () => (await readStats()).stats.refreshes).toBe(1)
  expect((await readStats()).outlineCalls).toBe(1)
  const laterHeadingIdAfter = await frame
    .locator('.vditor-ir h2')
    .filter({ hasText: 'Section 65' })
    .getAttribute('id')
  expect(laterHeadingIdAfter).not.toBe(laterHeadingIdBefore)

  await resetStats()
  await replaceDocument(HEADING_EDITED)
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(HEADING_EDITED)
  await expect.poll(async () => (await readStats()).stats.refreshes).toBe(1)

  await resetStats()
  await frame.locator('.vditor-toolbar [data-type="edit-mode"]').click()
  await frame.locator('button[data-mode="wysiwyg"]').click()
  await waitForE2EReadiness(frame, (state) => state.mode === 'wysiwyg', {
    message: 'Task 536 WYSIWYG readiness',
  })
  await frame
    .locator('body')
    .evaluate(() => new Promise((resolve) => setTimeout(resolve, 350)))
  expect((await readStats()).stats.refreshes).toBe(1)

  await placeAtEnd('wysiwyg', 'p', 'TARGET ordinary')
  await settleAndResetStats()
  await workbox.keyboard.type('X')
  await workbox.keyboard.press('Backspace')
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(HEADING_EDITED)
  await expectNoRefresh()

  await frame.locator('.vditor-toolbar [data-type="preview"]').click()
  await expect(frame.locator('.vditor-preview')).toBeVisible()
  await expect(frame.locator('.vditor-preview .vditor-toc')).toContainText(
    'Section 64!',
  )
  await frame.locator('.vditor-toolbar [data-type="preview"]').click()
  await expect(frame.locator('.vditor-wysiwyg')).toBeVisible()
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(HEADING_EDITED)

  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.files.save')
  })
  await expect.poll(() => readFileSync(file, 'utf8')).toBe(HEADING_EDITED)

  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })
  await evaluateInVSCode(
    async (vscode, args: [string, string]) => {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        args[1],
      )
    },
    [file, MarkdownEditorViewType] as [string, string],
  )
  const reopened = wf(workbox)
  await reopened.locator('.vditor-ir, .vditor-wysiwyg').first().waitFor({
    timeout: 60_000,
  })
  await expect.poll(() => docText(evaluateInVSCode, file)).toBe(HEADING_EDITED)
  expect(readFileSync(file, 'utf8')).toBe(HEADING_EDITED)
})
