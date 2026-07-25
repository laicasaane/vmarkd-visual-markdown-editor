// NET (task 373) — every SVG reference must resolve INSIDE its own pane.
//
// Reported: "flowchart i mermaid nie mają strzałek pomiędzy preview i ir". The render reuse paints a
// VERBATIM copy of the other pane's SVG, which duplicates every `id` in the document — and
// `url(#marker)` resolves to the FIRST match in DOCUMENT ORDER, i.e. the ORIGINAL (IR) pane. That
// pane is display:none while Preview is shown, and a marker inside a display:none subtree is not
// painted, so every arrowhead disappeared.
//
// Asserting "arrowheads are visible" pixel-wise would be brittle; the mechanism is exact: for each
// url(#id) in a pane's SVG, the FIRST element with that id in the document must be in the SAME pane.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

const CHECK = `(() => {
  const pv = window.vditor.vditor.preview.previewElement
  const bad = []
  const dangling = []
  let checked = 0
  for (const svg of Array.from(pv.querySelectorAll('.language-mermaid svg, .language-flowchart svg'))) {
    const refs = new Set((svg.innerHTML.match(/url\\(#([^)]+)\\)/g) || [])
      .map((r) => r.replace(/url\\(#|\\)/g, '')))
    for (const id of refs) {
      checked++
      const first = document.querySelector('[id="' + CSS.escape(id) + '"]')
      // A reference that is DEFINED SOMEWHERE ELSE is the bug: the browser paints nothing when that
      // somewhere is a display:none pane. A reference defined NOWHERE is a different, pre-existing
      // thing (mermaid emits url(#…-gradient) without ever defining the gradient) — record it, but
      // do not fail on it, or this spec would be red for a reason it does not guard.
      if (!first) dangling.push(id)
      else if (!pv.contains(first))
        bad.push(id + ' -> ' + (first.closest('.vditor-ir') ? 'IR pane (hidden)' : 'elsewhere'))
    }
  }
  return { checked, bad: bad.slice(0, 5), dangling: dangling.slice(0, 3) }
})()`

test('mermaid/flowchart marker references resolve inside the visible pane', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(180_000)
  await evaluateInVSCode(async (vscode: typeof import('vscode')) => {
    await vscode.workspace
      .getConfiguration('vmarkd')
      .update('theme.content', 'auto', vscode.ConfigurationTarget.Global)
  })
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
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 12_000)))
  await frame.locator('body').evaluate(() => {
    const inst = (window as any).vditor
    const v = inst.vditor
    v.preview.element.style.display = 'block'
    v[inst.getCurrentMode()].element.parentElement.style.display = 'none'
    v.preview.render(v)
  })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 12_000)))

  const r = (await frame.locator('body').evaluate(CHECK)) as {
    checked: number
    bad: string[]
    dangling: string[]
  }
  // Never let an unrendered pane pass as "no broken references".
  expect(r.checked, 'no marker references found to check').toBeGreaterThan(3)
  if (r.dangling.length)
    console.log('dangling (pre-existing): ' + r.dangling.join(', '))
  expect(
    r.bad,
    'a marker reference pointed outside the visible pane — arrowheads vanish',
  ).toEqual([])
})
