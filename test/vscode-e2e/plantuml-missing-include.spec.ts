import { wf } from './webview-helpers'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 384 — a PlantUML diagram whose `!include <lib/…>` cannot be resolved offline renders WITHOUT
// whatever that file defined, and used to say nothing at all: `expandStdlibIncludes` already
// returned the list of missing keys and the render path threw it away. Found on `domainstory`, whose
// icons all live in a `material2.1.19` library task 354 deliberately did not vendor (16 MB for an
// optional feature) — the diagram drew its structure with every icon gone and looked complete.
//
// The note is webview surface, so this is the layer that can prove it: a real editor, a real engine,
// the note element actually in the DOM under the diagram — and NOT under a diagram that lost nothing.
const FIXTURE = path.join(__dirname, 'fixtures', 'plantuml-missing-include.md')

test('an unresolvable stdlib include renders WITH a note; a clean diagram gets none', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(240_000)
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [FIXTURE] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 90_000 })
  // PlantUML boots a ~7 MB TeaVM engine and renders serialised, so give both blocks room.
  await frame
    .locator('.vditor-ir__preview .language-plantuml svg')
    .first()
    .waitFor({ timeout: 120_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 8000)))

  const blocks = await frame.locator('body').evaluate(() => {
    const out: { rendered: boolean; note: string | null }[] = []
    for (const pane of Array.from(
      document.querySelectorAll('.vditor-ir__preview'),
    )) {
      const el = pane.querySelector('.language-plantuml')
      if (!el) continue
      const note = el.querySelector('.vmarkd-diagram-note__msg')
      out.push({
        rendered: !!el.querySelector('svg'),
        note: note ? (note.textContent ?? '') : null,
      })
    }
    return out
  })
  // eslint-disable-next-line no-console
  console.log(`[missing-include] ${JSON.stringify(blocks)}`)

  expect(blocks.length, 'both plantuml blocks found').toBe(2)
  // The diagram still draws — the note is an INFO note beside a successful render, not an error box.
  expect(
    blocks[0].rendered,
    'the diagram with the bad include still renders',
  ).toBe(true)
  expect(blocks[0].note, 'it says which file it could not resolve').toContain(
    '<nosuchlib/NoSuchFile>',
  )
  expect(blocks[0].note).toContain('not available offline')
  // …and a diagram that lost nothing stays quiet, or the note would be noise on every document.
  expect(blocks[1].rendered, 'the clean diagram renders').toBe(true)
  expect(blocks[1].note, 'a clean diagram carries no note').toBeNull()
})
