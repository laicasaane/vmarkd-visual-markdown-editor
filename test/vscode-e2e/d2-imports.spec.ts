// Task 131 in the REAL webview. D2 composes diagrams from sibling FILES (`...@partials/header`,
// `k: @file`); we compile one fenced block through a filesystem-less WASM, so the target can never
// resolve. That already failed SAFE — raw source stayed visible — it just never said why, so it read
// as "the renderer is broken" instead of "this construct cannot work here". Now the source is
// checked BEFORE compiling and routed through the same loud fallback the other unsupported D2
// constructs use.
//
// The third block in the fixture is self-contained and MUST still render: the detector's real risk
// is a false positive replacing a working diagram with a note, which would be strictly worse than
// the generic compile error it replaces. Both halves are asserted in one test — one VS Code boot.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'd2-imports.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('a D2 block using imports says so, and a self-contained block still renders', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)
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
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })

  await expect
    .poll(
      async () =>
        frame.locator('body').evaluate(() => {
          const blocks = [
            ...document.querySelectorAll('.vditor-ir__preview .language-d2'),
          ]
          return {
            unsupported: blocks.filter((b) =>
              b.hasAttribute('data-d2-unsupported'),
            ).length,
            rendered: blocks.filter((b) => b.querySelector('svg')).length,
          }
        }),
      { timeout: 60_000, intervals: [1000, 2000, 3000] },
    )
    .toMatchObject({ unsupported: 2, rendered: 1 })

  const state = await frame.locator('body').evaluate(() => {
    const blocks = [
      ...document.querySelectorAll('.vditor-ir__preview .language-d2'),
    ]
    const flagged = blocks.filter((b) => b.hasAttribute('data-d2-unsupported'))
    return {
      notes: flagged.map(
        (b) => b.querySelector('.d2-unsupported-note')?.textContent ?? '',
      ),
      // The point of a loud fallback: the user can still read and copy what they wrote.
      sourceKept: flagged.every((b) =>
        (
          b.querySelector('pre.language-d2-unsupported')?.textContent ?? ''
        ).includes('service -> db'),
      ),
      // A stated non-support must NOT be reported as a compile failure — that is the confusion
      // this task exists to remove.
      anyCompileError: flagged.some((b) => b.hasAttribute('data-d2-error')),
    }
  })

  expect(state.notes[0]).toContain('...@file spread')
  expect(state.notes[1]).toContain('key: @file')
  for (const n of state.notes)
    expect(n).toContain('inline the imported content')
  expect(state.sourceKept, 'the raw source stays readable').toBe(true)
  expect(state.anyCompileError, 'not reported as a compile error').toBe(false)
})
