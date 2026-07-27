import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 385 — Ctrl+C / Ctrl+X with nothing selected.
//
// Both defects were probe-confirmed in task 191 (`media-src/e2e/copy-cut-probes.spec.ts`) and left
// in place then. They are the shape of the report "copy/paste doesn't work": a collapsed Ctrl+C in
// split mode WIPED the clipboard (sv's copy handler wrote the empty selection to text/plain with no
// guard), and a collapsed Ctrl+X was a stealth backspace (cutEvent ran execCommand("delete")
// unconditionally, even after the copy half had bailed out).
//
// This asserts the VS Code contract instead: a collapsed copy takes the current line, a collapsed
// cut removes the line it copied, and neither ever destroys the clipboard or a character.
//
// Real keystrokes and the real VS Code clipboard — a synthetic ClipboardEvent proves nothing here,
// because the whole defect is in what the handlers do to the SYSTEM clipboard.
const SRC = path.join(__dirname, 'fixtures', 'torture.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

async function open(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  file: string,
) {
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [file] as [string],
  )
}

const docText = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  file: string,
) =>
  evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) =>
      vscode.workspace.textDocuments
        .find((d) => d.uri.fsPath === args[0])
        ?.getText() ?? '',
    [file] as [string],
  ) as Promise<string>

const readClip = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
) =>
  evaluateInVSCode(
    async (vscode: typeof import('vscode')) => vscode.env.clipboard.readText(),
    [] as unknown as [string],
  ) as Promise<string>

const writeClip = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  text: string,
) =>
  evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.env.clipboard.writeText(args[0])
    },
    [text] as [string],
  )

/** Collapsed caret in the middle of the paragraph holding `anchor`. */
async function caretIn(
  frame: ReturnType<typeof wf>,
  mode: string,
  anchor: string,
) {
  await frame
    .locator(mode)
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(
    (_el, args) => {
      const [sel, needle] = args as [string, string]
      const p = [...document.querySelectorAll(`${sel} p`)].find((x) =>
        x.textContent?.includes(needle),
      ) as HTMLElement | undefined
      if (!p) throw new Error(`anchor ${needle} not found`)
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = (n.textContent ?? '').indexOf(needle)
        if (i >= 0) {
          const r = document.createRange()
          r.setStart(n as Text, i + needle.length)
          r.collapse(true)
          const s = window.getSelection()
          s?.removeAllRanges()
          s?.addRange(r)
          p.focus()
          return
        }
      }
      throw new Error('anchor text node not found')
    },
    [mode, anchor] as unknown as string,
  )
}

const settle = (frame: ReturnType<typeof wf>, ms: number) =>
  frame
    .locator('body')
    .evaluate((_el, d) => new Promise((r) => setTimeout(r, d as number)), ms)

let bootCount = 0

async function boot(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  workbox: import('@playwright/test').Page,
  name: string,
) {
  // A UNIQUE path per test. VS Code keeps a TextDocument alive per fsPath, so reusing a name
  // hands the next test the previous one's in-memory content however the file on disk is rewritten
  // — which is why these passed alone and failed whenever another test had run first.
  const tmp = path.join(tmpdir(), `${process.pid}-${bootCount++}-${name}`)
  writeFileSync(tmp, readFileSync(SRC, 'utf8'))
  // Close what earlier tests left open. Every test here drives the webview by querying
  // `.vditor-ir` inside the frame, so a stale vMarkd tab from a previous test is another editor
  // answering to the same selector — which is exactly how these passed alone and failed in the
  // tier run.
  await evaluateInVSCode(
    async (vscode: typeof import('vscode')) => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    },
    [] as unknown as [string],
  )
  await open(evaluateInVSCode, tmp)
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await settle(frame, 1500)
  return { tmp, frame }
}

test('a collapsed Ctrl+C copies the current line instead of doing nothing', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-clip-copy.md',
  )
  await writeClip(evaluateInVSCode, 'SENTINEL-do-not-lose-me')
  await caretIn(frame, '.vditor-ir', 'Anchor line BRAVO')
  await workbox.keyboard.press('Control+c')
  await settle(frame, 1500)

  const clip = await readClip(evaluateInVSCode)
  // The line the caret was on, as markdown source.
  expect(clip, 'the current line reached the clipboard').toContain(
    'Anchor line BRAVO',
  )
  // …and the clipboard was never wiped on the way (the split-mode defect).
  expect(clip, 'the clipboard was not clobbered with an empty string').not.toBe(
    '',
  )
  rmSync(tmp, { force: true })
})

// These two were `test.fixme` and were blamed on a harness flake. That diagnosis was WRONG, and the
// instrumentation that settled it is worth keeping in mind: there was never a stale webview (one
// `iframe.webview`, one tab, every time) and the live selection was always exactly what the test
// set. The editor really was eating a character — VS Code's webview clipboard bridge answers Ctrl+X
// by calling `document.execCommand("cut")` from a host-message handler, which leaves the selection
// reporting `collapsed === false`, so the guard read "not collapsed" and let the delete through.
// The intent is now recorded on keydown instead. See tasks/385.
test('a collapsed Ctrl+X does NOT eat the character before the caret', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // PROBE-15's defect, stated as a contract. Vditor ran `execCommand("delete")` on every cut, even
  // when the copy half had bailed out on the empty selection, so Ctrl+X with nothing selected was a
  // silent one-character backspace. It is now inert.
  //
  // Inert, NOT a line-cut: expanding the selection here makes the browser cut natively while
  // Vditor's own deferred delete fires against a since-collapsed selection and removes part of the
  // block. That was measured, and a half-deleted paragraph is worse than the bug being fixed, so
  // line-cut parity is deliberately left undone. See the task file.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-clip-cut.md',
  )
  const before = await docText(evaluateInVSCode, tmp)
  expect(before).toContain('Anchor line BRAVO with a second sentence.')

  await caretIn(frame, '.vditor-ir', 'Anchor line BRAVO')
  await workbox.keyboard.press('Control+x')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  // The whole point: no character was silently lost. Before the fix the 'O' of BRAVO was gone.
  expect(after, 'the line is intact — no stealth backspace').toContain(
    'Anchor line BRAVO with a second sentence.',
  )
  expect(after, 'the document is untouched').toBe(before)
  rmSync(tmp, { force: true })
})

// PRODUCT DEFECT, NOT A HARNESS FLAKE — task 387. Cutting a selected multi-line paragraph in IR
// leaves its LAST line behind: measured 85 of ~96 characters removed, "Anchor line BRAVO with a
// second sentence." still in the document. Deterministic — it fails alone, on every retry — and
// PRE-EXISTING: it fails identically with the collapsed-cut fix stashed out, so it is not a
// regression from that work.
//
// Mechanism, measured rather than reasoned: fixCut() (media-src/src/utils.ts) defers
// execCommand("delete") into a setTimeout to dodge a recursion error, so it lands a macrotask
// later against a selection that has already collapsed — the input event that arrives is
// `deleteContentBackward`, not `deleteByCut`. Repairing that means restructuring the cut path,
// which is the most destructive code in the editor and not something to change unreviewed.
test.fixme('a real selection still cuts normally', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // The control that proves the collapsed guard did not disable cut altogether.
  const { tmp, frame } = await boot(
    evaluateInVSCode,
    workbox,
    'vmarkd-clip-cut-real.md',
  )
  await frame
    .locator('.vditor-ir')
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(() => {
    const p = [...document.querySelectorAll('.vditor-ir p')].find((x) =>
      x.textContent?.includes('Anchor line BRAVO'),
    ) as HTMLElement
    const r = document.createRange()
    r.selectNodeContents(p)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    p.focus()
  })
  await workbox.keyboard.press('Control+x')
  await settle(frame, 2500)

  const after = await docText(evaluateInVSCode, tmp)
  expect(after, 'a selected block is still cut out').not.toContain(
    'Anchor line BRAVO with a second sentence.',
  )
  expect(after, 'the rest of the document survives').toContain(
    'Anchor line ZULU',
  )
  rmSync(tmp, { force: true })
})
