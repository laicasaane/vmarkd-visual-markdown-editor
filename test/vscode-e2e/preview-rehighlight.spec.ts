// NET (task 371) — code stays coloured across REPEATED Preview toggles.
//
// Reported as: "w preview blok kodu się nie koloruje ... po 2 kliknięciu w preview". The first
// Preview was coloured; every one after it was not.
//
// Vditor reads the language with `block.className.replace("language-", "")`, which assumes one class.
// True on the FIRST pass — but that pass then appends `hljs`, so a SECOND pass computes
// `"language-js hljs".replace("language-", "")` = "js hljs", no such language, falls back to
// plaintext, and re-renders the block with ZERO token spans.
//
// A second pass over the same element only became reachable with the task-187 preview morph: before
// it, each render replaced the pane via innerHTML so highlightRender always met a fresh
// `<code class="language-js">`. Measured here: the code element is the SAME DOM node across toggles.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// The fixture is the one that EMPIRICALLY reproduces, and the choice is load-bearing: verified by
// mutation, the bug does NOT surface on `all-renderers.md` (too much engine churn — the morph falls
// back to a full innerHTML set, so every block is rebuilt fresh and re-highlighted from a clean
// class list) NOR on a plain diagram-free document. Do not "simplify" this fixture without
// re-running the mutation check, or the spec silently stops testing anything.
const FIXTURE = path.join(__dirname, 'fixtures', 'preview-rehighlight.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

// Token spans are the real signal: the `.hljs` CLASS survives the bug, the colouring does not.
const READ = `(() => {
  const pv = window.vditor.vditor.preview.previewElement
  // Self-selecting: '.hljs' is exactly the set highlightRender processed, so this can never
  // accidentally assert on a diagram host or an unknown language.
  return Array.from(pv.querySelectorAll('pre > code.hljs'))
    .slice(0, 3)
    .map((c) => ({
      lang: (c.className.match(/language-([^ ]+)/) || [])[1] || '?',
      spans: c.querySelectorAll('span').length,
    }))
})()`

const TOGGLE = `(() => {
  const el = window.vditor.vditor.toolbar.elements['preview']
  const btn = el && (el.querySelector('button') || el.children[0])
  if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
})()`

test('code stays highlighted after repeated IR -> Preview toggles', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(300_000)
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
    .evaluate(() => new Promise((r) => setTimeout(r, 8_000)))

  type Blk = { lang: string; spans: number }
  let first: Blk[] = []
  // THREE visits: the bug needs the second and only shows on a re-render of a SURVIVING element.
  for (let visit = 1; visit <= 3; visit++) {
    await frame.locator('body').evaluate(TOGGLE) // -> Preview
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 5_000)))
    const blocks = (await frame.locator('body').evaluate(READ)) as Blk[]
    if (visit === 1) {
      // Never let an empty pane pass as "everything matched".
      // One block is enough and is what this fixture has — the guard exists so an EMPTY pane can
      // never pass as "nothing changed".
      expect(
        blocks.length,
        'no highlightable code blocks found in Preview',
      ).toBeGreaterThan(0)
      for (const b of blocks)
        expect(
          b.spans,
          `${b.lang} was not highlighted on the FIRST visit`,
        ).toBeGreaterThan(0)
      first = blocks
    } else {
      expect(blocks, `highlighting changed on Preview visit ${visit}`).toEqual(
        first,
      )
    }
    await frame.locator('body').evaluate(TOGGLE) // -> back to edit
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 3_000)))
  }
})
