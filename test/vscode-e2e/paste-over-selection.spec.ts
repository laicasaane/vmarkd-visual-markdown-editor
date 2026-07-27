import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 393 — pasting plain text over a selection inserted the new text BEFORE the selection
// instead of replacing it, and ate the selection's last character.
//
// Measured in a real VS Code with an instrumented `document.execCommand`: VS Code's webview
// clipboard bridge answers Ctrl+V by calling `document.execCommand("paste")` from a host-message
// handler, so `insertHTML`'s own `execCommand("delete")` ran WITH execCommand already on the call
// stack — genuinely re-entrant, and Chromium silently REFUSES it there (confirmed by forcing it
// synchronous: `execCommand` returned `false`, the DOM was unchanged). The old fix deferred every
// `execCommand("delete")` into a `setTimeout` to dodge that recursion guard (originally built for
// the CUT path only, see task 387) — for paste that let the delete fire a macrotask later, against
// whatever the selection had already collapsed to: a stealth backspace, one character short.
//
// The fix (`patchInsertHtmlDelete` in esbuild-shared.mjs) replaces that `execCommand("delete")`
// with `range.deleteContents()` — a plain DOM mutation the recursion guard never touches.
//
// Asserted with EXACT equality, not `toContain` — a `toContain` check passes on the mangled
// result too (it contains every original line), which is how this survived unnoticed.

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

/** Selects the exact text `needle` (first occurrence) in the currently-visible editor root. */
async function selectText(
  frame: ReturnType<typeof wf>,
  rootSelector: string,
  needle: string,
) {
  await frame
    .locator(rootSelector)
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(
    (_el, args) => {
      const root = document.querySelector(args.rootSelector) as HTMLElement
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = (n.textContent ?? '').indexOf(args.needle)
        if (i < 0) continue
        const r = document.createRange()
        r.setStart(n as Text, i)
        r.setEnd(n as Text, i + args.needle.length)
        const s = window.getSelection()
        s?.removeAllRanges()
        s?.addRange(r)
        ;(n.parentElement as HTMLElement | null)?.focus()
        return
      }
      throw new Error(`${args.needle} not found`)
    },
    { rootSelector, needle },
  )
}

test('IR: pasting plain text over a selection replaces exactly the selection', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-ir.md',
    'Read the paper today.\n',
  )
  await writeClip(evaluateInVSCode, 'WORDS')
  await selectText(frame, '.vditor-ir', 'the paper')
  await workbox.keyboard.press('Control+v')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  expect(after).toBe('Read WORDS today.\n')

  rmSync(tmp, { force: true })
})

test('WYSIWYG: pasting plain text over a selection replaces exactly the selection', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-wysiwyg.md',
    'Read the paper today.\n',
  )
  await frame.locator('body').evaluate(() => {
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
      .querySelector('button[data-mode="wysiwyg"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await frame.locator('.vditor-wysiwyg').first().waitFor({ timeout: 30_000 })
  await settle(frame, 2500)

  await writeClip(evaluateInVSCode, 'WORDS')
  await selectText(frame, '.vditor-wysiwyg', 'the paper')
  await workbox.keyboard.press('Control+v')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  expect(after).toBe('Read WORDS today.\n')

  rmSync(tmp, { force: true })
})

test('IR: pasting a two-paragraph block over a selection replaces exactly the selection', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // Multi-block paste (a Lute `data-block="0"` node) takes insertHTML's OTHER branch
  // (insertAdjacentHTML, not range.insertNode) — the delete step it shares with the plain-text
  // branch must still replace the selection, not just leave the pasted blocks alongside it.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-multiblock.md',
    'Read the paper today.\n',
  )
  await writeClip(evaluateInVSCode, 'para one\n\npara two')
  await selectText(frame, '.vditor-ir', 'the paper')
  await workbox.keyboard.press('Control+v')
  await settle(frame, 2500)

  // Vditor's own block-insert semantics: a multi-block paste always lands as new paragraph(s)
  // AFTER the current block (blocks cannot nest inline) — true with or without this fix. What
  // this fix owns is that the selected "the paper" is gone, not left duplicated alongside it.
  const after = await docText(evaluateInVSCode, tmp)
  expect(after).toBe('Read  today.\n\npara one\n\npara two\n')

  rmSync(tmp, { force: true })
})

test('sv: pasting plain text over a selection replaces exactly the selection (was never broken)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // sv's paste path (processPaste) uses range.extractContents() directly, not insertHTML/
  // execCommand — never shared the bug. Pinned here so a future refactor that routes sv through
  // insertHTML doesn't reopen it silently.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-sv.md',
    'Read the paper today.\n',
  )
  await frame.locator('body').evaluate(() => {
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
      .querySelector('button[data-mode="sv"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await frame.locator('.vditor-sv').first().waitFor({ timeout: 30_000 })
  await settle(frame, 2500)

  await writeClip(evaluateInVSCode, 'WORDS')
  await selectText(frame, '.vditor-sv', 'the paper')
  await workbox.keyboard.press('Control+v')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  expect(after).toBe('Read WORDS today.\n')

  rmSync(tmp, { force: true })
})

test('typing continues correctly after a paste-over-selection (preventInput does not poison the next keystroke)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // The old execCommand("delete") fired a synchronous "input" event that the IR/WYSIWYG input
  // listener swallows via `preventInput`. range.deleteContents() fires no such event — if the
  // patch still SET preventInput, it would stay true and the next real keystroke's input event
  // would be wrongly swallowed too (dropped from the document).
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-paste-then-type.md',
    'Read the paper today.\n',
  )
  await writeClip(evaluateInVSCode, 'WORDS')
  await selectText(frame, '.vditor-ir', 'the paper')
  await workbox.keyboard.press('Control+v')
  await settle(frame, 2500)
  await workbox.keyboard.type('!')
  await settle(frame, 2000)

  const after = await docText(evaluateInVSCode, tmp)
  expect(after).toBe('Read WORDS! today.\n')

  rmSync(tmp, { force: true })
})
