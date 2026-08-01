import { wf } from './webview-helpers'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 384 — domainstory draws its icons offline.
//
// The library ships NO sprites: it pulls each one with `!include <material2.1.19/$icon>`, where
// `$icon` is a procedure parameter — a key our textual expander can never resolve, and the reason
// every icon was silently missing. It does not need to resolve: the include is not load-bearing
// (the library's own `%set_variable_value($var, "$ma_" + $icon)` runs regardless), so an icon draws
// as soon as its sprite EXISTS. We vendor the 15 icons the library names by default (15 KB packed,
// recompressed to 16z) and the expander inlines that whole trimmed map on the variable key.
//
// Two halves, and the second is the one that rots quietly: the icons must DRAW, and the
// missing-include note must NOT fire any more — it was a true report before the icons shipped and
// would be a false alarm now.
const FIXTURE = path.join(__dirname, 'fixtures', 'plantuml-domainstory.md')

test('domainstory renders its actor/document/system icons, with no missing-include note', async ({
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
  await frame
    .locator('.vditor-ir__preview .language-plantuml svg')
    .first()
    .waitFor({ timeout: 150_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 3000)))

  const out = await frame.locator('body').evaluate(() => {
    const el = document.querySelector('.vditor-ir__preview .language-plantuml')
    const svg = el?.querySelector('svg')
    return {
      // Each drawn sprite is an <image> in the rendered SVG.
      images: svg ? svg.querySelectorAll('image').length : 0,
      note: el?.querySelector('.vmarkd-diagram-note__msg')?.textContent ?? null,
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[domainstory] ${JSON.stringify(out)}`)

  // Person, Document and System — one sprite each, from the vendored material set.
  expect(out.images, 'the three icons drew').toBe(3)
  expect(
    out.note,
    'nothing is missing any more, so the note must stay silent',
  ).toBeNull()
})
