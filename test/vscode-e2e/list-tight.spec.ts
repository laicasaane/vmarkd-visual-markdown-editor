import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 391 — a tight list must stay tight while it is edited.
//
// The trigger, measured one operation at a time in a real VS Code: Backspace at the start of a
// nested item — the ordinary way to delete a bullet. It merges the item into its parent and leaves
// the merged text wrapped in a `<p>` inside an `<li>` of a list still marked `data-tight="true"`.
// Lute serialises that contradiction as the LOOSE form, so a blank line appears between the parent's
// text and its sublist and the file is rewritten in lines the user never touched.
//
// Asserted against the document ON DISK, byte-for-byte where it matters: a `toContain` check would
// pass on the loose version too, since the loose form contains every line of the tight one.

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

const TIGHT = `# List

1. Analysis of email threads
   * first entry
   * second entry
`

// A list the user genuinely wrote loose — the repair must not touch it. NESTED on purpose: Lute
// normalises a FLAT loose list to tight on its own round trip (measured: `* one\n\n* two` →
// `* one\n* two`), so a flat fixture would fail with or without this repair and prove nothing about
// it. The nested form is stable through the round trip AND the per-keystroke spin, so any change to
// it is attributable.
const LOOSE = `# List

1. Parent

   * one
   * two
`

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

/** Collapsed caret immediately BEFORE `needle`. */
async function caretBefore(frame: ReturnType<typeof wf>, needle: string) {
  await frame
    .locator('.vditor-ir')
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate((_el, text) => {
    const root = document.querySelector('.vditor-ir') as HTMLElement
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(text as string)
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n as Text, i)
      r.collapse(true)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
      ;(n.parentElement as HTMLElement | null)?.focus()
      return
    }
    throw new Error(`${text} not found`)
  }, needle)
}

test('deleting a nested bullet with Backspace does not make the list loose', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-list-tight.md',
    TIGHT,
  )

  await caretBefore(frame, 'first entry')
  await workbox.keyboard.press('Backspace')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  // The merge itself is expected — this is what Backspace at the start of an item means.
  expect(after, 'the item merged into its parent').toContain(
    '1. Analysis of email threadsfirst entry',
  )
  // What must NOT happen: the blank line that turns the list loose.
  expect(after, 'the list stayed tight').not.toContain('threadsfirst entry\n\n')
  expect(after, 'the sublist is still nested under the parent item').toContain(
    '\n   * second entry',
  )

  rmSync(tmp, { force: true })
})

test('the caret survives the repair and typing continues where it was', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // The repair unwraps a paragraph the caret is sitting in. It moves the text NODE rather than
  // rebuilding it precisely so the selection survives — asserted here, because jsdom cannot show it.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-list-tight-caret.md',
    TIGHT,
  )

  await caretBefore(frame, 'first entry')
  await workbox.keyboard.press('Backspace')
  await settle(frame, 2500)
  await workbox.keyboard.type('XY')
  await settle(frame, 2000)

  const after = await docText(evaluateInVSCode, tmp)
  // Where exactly the caret lands after a merge is Vditor's own behaviour (measured: the end of the
  // merged text, with and without this repair). What the repair must not do is LOSE it — a caret
  // dropped by the DOM surgery would send the keystroke to the top of the document or nowhere.
  expect(after, 'typing landed inside the merged item').toContain(
    'threadsfirst entryXY',
  )
  expect(after, 'and the list is still tight').not.toContain(
    'first entry\n\n   *',
  )

  rmSync(tmp, { force: true })
})

test('a list the user wrote LOOSE is left loose', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // The half that makes the repair safe. A genuinely loose list carries no `data-tight`, so it is
  // never touched — without this the fix would silently flatten real formatting.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-list-loose.md',
    LOOSE,
  )

  await caretBefore(frame, 'Parent')
  await workbox.keyboard.type('Z')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  expect(after, 'the blank line under the parent item survives').toContain(
    '1. ZParent\n\n   * one',
  )

  rmSync(tmp, { force: true })
})
