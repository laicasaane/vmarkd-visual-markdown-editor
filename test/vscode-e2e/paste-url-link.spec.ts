import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 392 — pasting a URL produces a markdown link.
//
// The REAL clipboard and a REAL Ctrl+V, because that is the mechanism under test: VS Code's webview
// clipboard bridge is what delivers the paste, and a synthetic ClipboardEvent would prove nothing
// about it. Asserted against the document ON DISK — the markdown is what the user keeps.
//
// Half of this was already Vditor's: with text selected it wraps the selection. That half is
// asserted here too, as a guard — it is easy to break while adding the other one.

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

const ev = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  fn: unknown,
  arg = '',
) => evaluateInVSCode(fn, [arg] as [string])

const settle = (frame: ReturnType<typeof wf>, ms: number) =>
  frame
    .locator('body')
    .evaluate((_el, d) => new Promise((r) => setTimeout(r, d as number)), ms)

const docText = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  file: string,
) =>
  ev(
    evaluateInVSCode,
    async (vscode: typeof import('vscode'), args: string[]) =>
      vscode.workspace.textDocuments
        .find((d) => d.uri.fsPath === args[0])
        ?.getText() ?? '',
    file,
  ) as Promise<string>

const writeClip = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  text: string,
) =>
  ev(
    evaluateInVSCode,
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.env.clipboard.writeText(args[0])
    },
    text,
  )

let bootCount = 0

async function boot(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  workbox: import('@playwright/test').Page,
  name: string,
  body: string,
) {
  // A unique path per test — VS Code keeps a TextDocument alive per fsPath, so a reused name hands
  // the next test the previous one's in-memory content whatever is written to disk.
  const tmp = path.join(tmpdir(), `${process.pid}-${bootCount++}-${name}`)
  writeFileSync(tmp, body)
  await ev(evaluateInVSCode, async (vscode: typeof import('vscode')) => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })
  await ev(
    evaluateInVSCode,
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    tmp,
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await settle(frame, 1500)
  return { tmp, frame }
}

/** Collapsed caret right after `anchor`, or a selection of `select` when given. */
async function caretAt(
  frame: ReturnType<typeof wf>,
  anchor: string,
  select?: string,
) {
  await frame
    .locator('.vditor-ir')
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(
    (_el, args) => {
      const [needle, sel] = args as [string, string]
      const root = document.querySelector('.vditor-ir') as HTMLElement
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? ''
        const i = text.indexOf(needle)
        if (i < 0) continue
        const r = document.createRange()
        if (sel) {
          const j = text.indexOf(sel)
          if (j < 0) continue
          r.setStart(n as Text, j)
          r.setEnd(n as Text, j + sel.length)
        } else {
          r.setStart(n as Text, i + needle.length)
          r.collapse(true)
        }
        const s = window.getSelection()
        s?.removeAllRanges()
        s?.addRange(r)
        ;(n.parentElement as HTMLElement | null)?.focus()
        return
      }
      throw new Error(`anchor ${needle} not found`)
    },
    [anchor, select ?? ''] as unknown as string,
  )
}

const URL = 'https://example.com/a-paper'

test('pasting a URL with NOTHING selected makes it both the text and the destination', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-url.md',
    '# Notes\n\nSee also: \n',
  )
  await writeClip(evaluateInVSCode, URL)
  await caretAt(frame, 'See also:')
  await workbox.keyboard.press('Control+v')

  await expect
    .poll(() => docText(evaluateInVSCode, tmp), { timeout: 20_000 })
    .toContain(`[${URL}](${URL})`)

  rmSync(tmp, { force: true })
})

test('pasting a URL OVER a selection keeps the selection as the link text', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // Vditor's own behaviour, pinned: the new no-selection branch must not swallow it.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-url-sel.md',
    '# Notes\n\nRead the paper today.\n',
  )
  await writeClip(evaluateInVSCode, URL)
  await caretAt(frame, 'the paper', 'the paper')
  await workbox.keyboard.press('Control+v')

  await expect
    .poll(() => docText(evaluateInVSCode, tmp), { timeout: 20_000 })
    .toContain(`[the paper](${URL})`)

  rmSync(tmp, { force: true })
})

test('pasting ordinary text is still ordinary text', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // The guard that matters most: a false positive would silently rewrite an ordinary paste.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-text.md',
    '# Notes\n\nSee also: \n',
  )
  await writeClip(evaluateInVSCode, 'just some words')
  await caretAt(frame, 'See also:')
  await workbox.keyboard.press('Control+v')

  // No leading space in the expectation: markdown serialization drops the fixture's trailing
  // space, so the pasted text lands flush against the colon. What matters is the second
  // assertion — the text was NOT turned into a link.
  await expect
    .poll(() => docText(evaluateInVSCode, tmp), { timeout: 20_000 })
    .toContain('just some words')
  expect(await docText(evaluateInVSCode, tmp)).not.toContain('](')

  rmSync(tmp, { force: true })
})

test('pasting a URL into a fenced code block stays literal', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // Code is excluded upstream (the code branch runs before the text branch), but "excluded by
  // construction" is not evidence — a URL turning into markdown inside a code block would be
  // corruption, so it gets an assertion.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-code.md',
    '# Notes\n\n```sh\ncurl \n```\n',
  )
  await writeClip(evaluateInVSCode, URL)
  await caretAt(frame, 'curl')
  await workbox.keyboard.press('Control+v')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  expect(after, 'the URL landed as plain text').toContain(URL)
  expect(after, 'and was NOT turned into a link').not.toContain(`[${URL}](`)

  rmSync(tmp, { force: true })
})

test('one undo takes the whole pasted link back', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // Pasting is a reflex, so undoing it must be one too — a link that needs two undos is worse
  // than the convenience is worth.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-undo.md',
    '# Notes\n\nSee also: \n',
  )
  const before = await docText(evaluateInVSCode, tmp)
  await writeClip(evaluateInVSCode, URL)
  await caretAt(frame, 'See also:')
  await workbox.keyboard.press('Control+v')
  await expect
    .poll(() => docText(evaluateInVSCode, tmp), { timeout: 20_000 })
    .toContain(`[${URL}](${URL})`)

  await workbox.keyboard.press('Control+z')
  await expect
    .poll(() => docText(evaluateInVSCode, tmp), { timeout: 20_000 })
    .not.toContain('](')
  expect(await docText(evaluateInVSCode, tmp)).toBe(before)

  rmSync(tmp, { force: true })
})

// The rewrite happens before Vditor branches on the mode, so it is mode-agnostic by construction —
// which is a claim, not evidence. WYSIWYG and split get the same assertion as IR.
for (const mode of ['wysiwyg', 'sv'] as const) {
  test(`pasting a URL works the same in ${mode}`, async ({
    workbox,
    evaluateInVSCode,
  }) => {
    const { tmp, frame } = await boot(
      evaluateInVSCode,
      workbox,
      `vmarkd-paste-url-${mode}.md`,
      '# Notes\n\nSee also: \n',
    )
    await frame.locator('body').evaluate((_el, target) => {
      const v = (
        window as unknown as {
          vditor: {
            vditor: { toolbar: { elements: Record<string, HTMLElement> } }
          }
        }
      ).vditor.vditor
      v.toolbar.elements['edit-mode']?.children[0]?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
      document
        .querySelector(`button[data-mode="${target}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }, mode)
    await frame.locator(`.vditor-${mode}`).first().waitFor({ timeout: 30_000 })
    await settle(frame, 2500)

    await writeClip(evaluateInVSCode, URL)
    // Click into the surface, then put the caret at the end of the anchor line.
    await frame
      .locator(`.vditor-${mode}`)
      .first()
      .click({ position: { x: 4, y: 4 } })
    await frame.locator('body').evaluate((_el, sel) => {
      const root = document.querySelector(sel as string) as HTMLElement
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = (n.textContent ?? '').indexOf('See also:')
        if (i < 0) continue
        const r = document.createRange()
        r.setStart(n as Text, i + 'See also:'.length)
        r.collapse(true)
        const s = window.getSelection()
        s?.removeAllRanges()
        s?.addRange(r)
        ;(n.parentElement as HTMLElement | null)?.focus()
        return
      }
      throw new Error('anchor not found')
    }, `.vditor-${mode}`)
    await workbox.keyboard.press('Control+v')

    await expect
      .poll(() => docText(evaluateInVSCode, tmp), { timeout: 20_000 })
      .toContain(`[${URL}](${URL})`)

    rmSync(tmp, { force: true })
  })
}
