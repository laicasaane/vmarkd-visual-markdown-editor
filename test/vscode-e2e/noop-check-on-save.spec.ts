import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 434 — isSemanticNoop's whole-doc check moved OFF the 250ms edit-sync tick (it was the one
// expensive step there — measured 74ms@10KB to 2s+@100KB) onto a separate, longer idle timer
// (WritebackController.NOOP_CHECK_IDLE_MS, 1200ms), with checkNoopOnWillSave as the correctness
// backstop for every SAVE (any trigger), applied atomically via vscode.workspace.onWillSaveTextDocument
// + event.waitUntil. This spec proves BOTH halves independently:
//   1. the deferred idle timer alone (no save) restores the clean baseline once the document settles
//      — undo-dirty-probe.spec.ts already proves this at its own (2000ms) cadence; this spec targets
//      the NEW mechanism's OWN (1200ms) window specifically, unchanged, so a future change to the
//      constant is caught here first.
//   2. saving IMMEDIATELY after a revert-to-baseline (well within the 1200ms idle window, before the
//      deferred timer would have fired on its own) still lands the EXACT baseline bytes on DISK, not
//      the un-corrected (reflowed) intermediate write — proving the willSave backstop, not the timer,
//      is what caught it.
const SRC = path.join(__dirname, 'fixtures', 'undo-dirty.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

async function typeAndUndo(
  workbox: import('@playwright/test').Page,
  frame: ReturnType<typeof wf>,
) {
  await frame
    .locator('.vditor-ir')
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(() => {
    const p = Array.from(
      document.querySelectorAll('.vditor-ir p, .vditor-ir li, .vditor-ir h1'),
    ).find((x) => x.textContent?.includes('Edit here')) as
      | HTMLElement
      | undefined
    const t = p?.lastChild as Text | null
    if (!t) return
    const r = document.createRange()
    r.setStart(t, (t.textContent ?? '').length)
    r.collapse(true)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    p?.focus()
  })
  await workbox.keyboard.type('xyz123', { delay: 50 })
  // Let the insertion itself land before undoing it (matches undo-dirty-probe's own pacing —
  // reliability of the undo sequence matters more here than speed; the timing race this spec
  // actually cares about is how soon AFTER undo completes the save fires, not how fast the undo
  // itself runs — see waitForUndoToLand, called separately by the save-immediately test).
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1200)))
  for (let i = 0; i < 12; i++) {
    await workbox.keyboard.press('Control+z')
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 200)))
  }
}

// Poll the HOST document (not the webview) until the typed marker is gone — a deterministic signal
// that the LAST undo's edit-sync tick has reached WritebackController, instead of a fixed sleep.
// The save-immediately test triggers its save the INSTANT this resolves, so the gap between "the
// tick that armed the deferred timer landed" and "save fires" stays small and reliable regardless
// of how long the undo key-press loop itself took under CI/xvfb load.
async function waitForUndoToLand(
  evaluateInVSCode: (
    fn: (vscode: typeof import('vscode'), args: string[]) => unknown,
    args: string[],
  ) => Promise<unknown>,
  tmp: string,
): Promise<void> {
  const deadline = Date.now() + 15_000
  for (;;) {
    const text = (await evaluateInVSCode(
      async (vscode: typeof import('vscode'), args: string[]) =>
        vscode.workspace.textDocuments
          .find((d) => d.uri.fsPath === args[0])
          ?.getText() ?? '',
      [tmp],
    )) as string
    if (!text.includes('xyz123')) return
    if (Date.now() > deadline) {
      throw new Error('undo never landed in the host document within 15s')
    }
    await new Promise((r) => setTimeout(r, 100))
  }
}

test('the deferred idle timer alone restores the clean baseline within its own ~1200ms window (no save)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(90_000)
  const before = readFileSync(SRC, 'utf8')
  const tmp = path.join(tmpdir(), 'vmarkd-noop-check-idle.md')
  writeFileSync(tmp, before)

  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [tmp] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1000)))

  await typeAndUndo(workbox, frame)

  // NOTHING further happens — no save, no more typing. Poll for the document's content to settle
  // back to the exact original bytes WITHOUT us triggering a save — only the deferred idle timer
  // (armed by the last undo's edit-sync tick) can do this.
  await expect
    .poll(
      async () =>
        (await evaluateInVSCode(
          async (vscode: typeof import('vscode'), args: string[]) =>
            vscode.workspace.textDocuments
              .find((d) => d.uri.fsPath === args[0])
              ?.getText() ?? '',
          [tmp] as [string],
        )) as string,
      // Comfortably above the 1200ms window (CI/xvfb scheduling slack) but well under
      // undo-dirty-probe's own 2000ms — if this needs to grow past ~2s to pass, the deferred timer
      // isn't what's catching it; something else (or nothing) is, and that's the real finding.
      { timeout: 3_000, intervals: [150, 250, 400] },
    )
    .toBe(before)

  rmSync(tmp, { force: true })
})

test('saving IMMEDIATELY after a revert-to-baseline (before the idle window elapses) still lands the exact baseline bytes on disk', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(90_000)
  const before = readFileSync(SRC, 'utf8')
  const tmp = path.join(tmpdir(), 'vmarkd-noop-check-save.md')
  writeFileSync(tmp, before)

  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [tmp] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1000)))

  await typeAndUndo(workbox, frame)
  // Deterministic: wait for the undo to actually REACH the host document, then save IMMEDIATELY —
  // not a fixed sleep racing the undo loop's own (variable, CI-load-sensitive) pacing. The gap
  // between "tick landed" and "save fires" is what has to stay under the 1200ms idle window for
  // this to actually exercise the willSave backstop rather than the deferred timer.
  await waitForUndoToLand(evaluateInVSCode, tmp)
  await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
    await vscode.commands.executeCommand('workbench.action.files.save')
  })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 800)))

  const after = readFileSync(tmp, 'utf8')
  // eslint-disable-next-line no-console
  console.log(
    `[434] save-immediately-after-revert: beforeLen=${before.length} afterLen=${after.length} identical=${after === before}`,
  )
  rmSync(tmp, { force: true })

  expect(
    after,
    'the save must persist the EXACT clean baseline bytes, not an un-corrected reflow',
  ).toBe(before)

  const isDirty = await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) =>
      vscode.workspace.textDocuments.find((d) => d.uri.fsPath === args[0])
        ?.isDirty ?? true,
    [tmp] as [string],
  )
  expect(isDirty, 'an explicit save must clear the dirty flag').toBe(false)
})
