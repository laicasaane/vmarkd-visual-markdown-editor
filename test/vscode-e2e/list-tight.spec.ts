import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 391 (originally) — a tight list must stay tight while it is edited.
//
// UPDATED 2026-07-31 (tasks 461/462): the original trigger was Backspace at the start of a NESTED
// item, which used to fall into Vditor's `fixList:474` "first item → paragraph" branch (gated only
// on `!previousElementSibling`, not top-level-ness) — for a nested item that branch inserts the
// lifted content as a stray `<p>` SIBLING inside the parent `<li>`, contradicting the list's own
// `data-tight="true"` and making Lute serialise it as the LOOSE form (a blank line the user never
// asked for). `list-tight.ts`'s repair observer fixed that AFTER the fact.
//
// Task 462 fixed the CAUSE instead: `patchFixListOutdent` gates `fixList:474` to top-level-only, so
// a nested item (first or not) now routes to `list-backspace.ts`'s `listOutdent` — real editor
// behaviour (outdent one level), never a merge, and structurally incapable of producing the stray
// `<p>` (`listOutdent` promotes the `<li>` itself, it never wraps content in a fresh `<p>`). With the
// cause gone, the repair had nothing left to repair (measured harness-side, zero corruption across
// every op that could plausibly trigger it — Backspace first/non-first, Tab, Shift+Tab, Enter-split,
// IR + WYSIWYG — see `media-src/e2e/list.spec.ts`), so task 461 retired `list-tight.ts` and its
// observer. What's left here is the regression net for the INVARIANT itself (a tight list must stay
// tight) plus the independent paste-race net, not for a repair module that no longer exists.
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

/** Collapsed caret immediately BEFORE `needle`, under `root` (`.vditor-ir` by default, or
 * `.vditor-wysiwyg` once the editor's been switched to WYSIWYG mode). */
async function caretBefore(
  frame: ReturnType<typeof wf>,
  needle: string,
  root = '.vditor-ir',
) {
  await frame
    .locator(root)
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(
    (_el, args) => {
      const { root, text } = args as { root: string; text: string }
      const rootEl = document.querySelector(root) as HTMLElement
      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = (n.textContent ?? '').indexOf(text)
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
    },
    { root, text: needle },
  )
}

test('deleting a nested bullet with Backspace outdents it — never a merge, never a loose list', async ({
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
  // Pre-462 this merged into the parent ("...threadsfirst entry") and, absent the repair, would have
  // gone LOOSE too. Post-462 `list-backspace.ts`'s `listOutdent` promotes the item instead — real
  // editor behaviour, and structurally incapable of the stray-<p> corruption (`listOutdent` moves the
  // `<li>` itself, it never wraps content in a fresh `<p>`).
  expect(after, 'no merge into the parent item').not.toContain(
    'Analysis of email threadsfirst entry',
  )
  // Outdenting into the ENCLOSING ordered list adopts its marker (real-editor behaviour — Word/Docs
  // do the same: a promoted item takes the surrounding list's numbering, not its old bullet).
  expect(after, 'first entry survives as its own outdented item').toMatch(
    /^1\. first entry$/m,
  )
  expect(after, 'no blank line — the list never went loose').not.toMatch(
    /Analysis of email threads\n\n/,
  )
  expect(after, 'second entry is still nested, not orphaned').toContain(
    '* second entry',
  )

  rmSync(tmp, { force: true })
})

test('a list the user wrote LOOSE is left loose', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // Not a `list-tight.ts` repair-safety test anymore (that module is gone) — a plain regression net:
  // ordinary typing must never accidentally TIGHTEN a list the user deliberately wrote loose.
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

test('pasting two paragraphs into a tight list item keeps BOTH', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // Independent of the Backspace-outdent fix above: Lute/Vditor's own paste-then-reparse behaviour
  // for genuine multi-block content landing in a tight item. Kept as a NET (task 461/462) even though
  // `list-tight.ts`'s repair — which this test originally guarded against racing — no longer exists;
  // this pins behaviour the fork depends on but doesn't own, same pattern as task 428's
  // `list-enter-start.spec.ts`.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-list-paste-race.md',
    TIGHT,
  )
  await writeClip(evaluateInVSCode, 'para one\n\npara two')
  await caretBefore(frame, 'first entry')
  await workbox.keyboard.press('Control+v')
  await settle(frame, 3000)

  const after = await docText(evaluateInVSCode, tmp)
  expect(
    after,
    'both pasted paragraphs survive, not merged into one',
  ).toContain('para one\n\n   para two')

  rmSync(tmp, { force: true })
})

test('WYSIWYG: deleting a nested bullet with Backspace outdents it — never a merge, never a loose list', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // The IR case proves the outdent fires and the list stays tight; this proves the SAME thing happens
  // in WYSIWYG (`list-backspace.ts` uses `SpinVditorDOM`, not `SpinVditorIRDOM`, there — a genuinely
  // different code path).
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-list-tight-wysiwyg.md',
    TIGHT,
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

  await caretBefore(frame, 'first entry', '.vditor-wysiwyg')
  await workbox.keyboard.press('Backspace')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  expect(after, 'no merge into the parent item').not.toContain(
    'Analysis of email threadsfirst entry',
  )
  expect(after, 'first entry survives as its own outdented item').toMatch(
    /^1\. first entry$/m,
  )
  expect(after, 'no blank line — the list never went loose').not.toMatch(
    /Analysis of email threads\n\n/,
  )
  expect(after, 'second entry is still nested, not orphaned').toContain(
    '* second entry',
  )

  rmSync(tmp, { force: true })
})
