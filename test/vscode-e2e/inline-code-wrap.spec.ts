// NET (task 369) — inline code in the Preview pane must not be chopped in half.
//
// Markdown that glues text straight to inline code (`SVG post-processing` + `` `currentColor` ``,
// no space) is ONE unbreakable run there, so `overflow-wrap: anywhere` inherited from the table cell
// broke it mid-word: `currentCo` / `lor`. IR never does that — its editing markers put an element
// boundary at the code, which is a legal place to break.
//
// The fix gives the Preview the same boundary via an empty inline-block atom. BOTH halves of the
// behaviour matter and both are asserted here, because a rule that simply forbade breaking would
// pass the first check and fail the second by overflowing the cell:
//   1. code that FITS on a line moves there whole,
//   2. code LONGER than the line still breaks inside itself and does not overflow.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

// Row 6 of the renderer table is `SVG post-processing` glued to `` `currentColor` `` — the shape
// that triggers it. Measured via Range rects, which count LINE FRAGMENTS, not elements.
const STATE = `(() => {
  const pv = window.vditor.vditor.preview.previewElement
  const t = Array.from(pv.querySelectorAll('table'))
    .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]
  if (!t) return null
  const cell = t.querySelectorAll('tr')[6].children[2]
  const code = cell.querySelector('code')
  if (!code) return null
  const fragsOf = () => {
    const rg = document.createRange()
    rg.selectNodeContents(code)
    return rg.getClientRects().length
  }
  const original = code.textContent
  const fits = { frags: fragsOf(), text: original }
  // Now the other half: a token far longer than the column.
  code.textContent = 'aVeryLongInlineCodeTokenThatCannotFitInsideThisNarrowColumn'
  const long = {
    frags: fragsOf(),
    overflows: code.getBoundingClientRect().width > cell.getBoundingClientRect().width + 1,
  }
  code.textContent = original
  return { fits, long }
})()`

test('inline code moves to a new line whole, and only breaks when it cannot fit', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(240_000)
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

  // Straight IR → Preview. The path matters: an IR → WYSIWYG → Preview trip re-serialises the
  // document and inserts the missing space, which hides the whole thing (task 370).
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

  const state = (await frame.locator('body').evaluate(STATE)) as {
    fits: { frags: number; text: string }
    long: { frags: number; overflows: boolean }
  } | null

  expect(
    state,
    'the renderer table / its inline code was not found',
  ).not.toBeNull()
  const s = state as NonNullable<typeof state>
  // Guard the fixture shape: if the glued source ever gains a space, this spec stops testing
  // anything and should be re-pointed rather than left green.
  expect(s.fits.text, 'the probed cell is not the glued inline-code case').toBe(
    'currentColor',
  )
  expect(
    s.fits.frags,
    'inline code that fits on a line was still chopped in half',
  ).toBe(1)
  expect(
    s.long.frags,
    'a code span longer than the column must still break inside itself',
  ).toBeGreaterThan(1)
  expect(
    s.long.overflows,
    'a long code span overflowed its table cell instead of wrapping',
  ).toBe(false)
})
