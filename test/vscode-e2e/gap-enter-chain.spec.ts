import { wf } from './webview-helpers'
// Task 486: repeated Enter below a callout/code-block at EOF pinned the paragraph count at 1 —
// cleanupGapParagraphs (gap-paragraph.ts) mistook each freshly Enter-split blank paragraph for a
// stale navigation splice (its previousElementSibling is still the callout) and reclaimed it, and
// ensureTrailingParagraph (trailing-paragraph.ts) separately dropped the ORIGINAL trailing
// paragraph on the very first split (Chromium's native Enter doesn't copy `data-vmarkd-trailing`
// onto either half) without adding a replacement. Net effect: the caret never visually descended
// past the line right after the callout/code-block — "returns to the last line with text".
// Fix: cleanupGapParagraphs keeps a paragraph that reaches the caret through an unbroken chain of
// empty paragraphs (gapChainReachesCaret); ensureTrailingParagraph transfers the TRAILING_ATTR tag
// to the new last paragraph instead of deleting the old one when the gap is exactly a same-tick
// Enter split. Only reproduces in the real custom-editor pipeline (native Enter split + the live
// MutationObserver-driven cleanup), so it lives here, not the chromium harness.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'gap-enter-chain.md')

const PARAGRAPH_COUNT = () => {
  const ir = (
    window as unknown as {
      vditor?: { vditor?: { ir?: { element?: HTMLElement } } }
    }
  ).vditor?.vditor?.ir?.element
  return ir?.querySelectorAll(':scope > p').length ?? -1
}

const CARET_IN_TRAILING = () => {
  const sel = window.getSelection()
  const n = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null
  const el = n
    ? ((n.nodeType === 3 ? n.parentElement : (n as Element)) as Element)
    : null
  return !!el?.hasAttribute?.('data-vmarkd-trailing')
}

test('repeated Enter below a callout grows one new paragraph per keypress, caret follows', async ({
  workbox,
  evaluateInVSCode,
}) => {
  await evaluateInVSCode(async (vscode, uri) => {
    await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.file(uri),
      'vmarkd.editor',
    )
  }, FIXTURE)

  const frame = wf(workbox)
  await expect(
    frame.locator('.vditor-ir__node[data-callout="note"]').first(),
  ).toBeVisible({ timeout: 45_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 500)))

  // Place the caret in the maintained EOF trailing paragraph via REAL input: click the
  // callout's rendered body (expands + focuses the editable source, same as a real user),
  // End, then ArrowDown (setupTrailingNav's EOF-descent path, gap-paragraph.ts) until it
  // lands. A programmatic Range/addRange gets overridden by the caret authority's own
  // restore logic on a freshly-focused contenteditable, so this drives real keys instead.
  await frame
    .locator('.vditor-ir')
    .getByText('callout body text', { exact: true })
    .click()
  await workbox.keyboard.press('End')
  for (let i = 0; i < 4; i++) {
    if (await frame.locator('body').evaluate(CARET_IN_TRAILING)) break
    await workbox.keyboard.press('ArrowDown')
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 200)))
  }
  expect(await frame.locator('body').evaluate(CARET_IN_TRAILING)).toBe(true)

  const before = await frame.locator('body').evaluate(PARAGRAPH_COUNT)
  // The fixture's leading "above the callout" paragraph + the maintained EOF trailing paragraph.
  expect(before).toBe(2)

  for (let i = 1; i <= 4; i++) {
    await workbox.keyboard.press('Enter')
    // rAF-debounced cleanup — give it a frame to settle before measuring.
    await frame
      .locator('body')
      .evaluate(() => new Promise((r) => setTimeout(r, 120)))
    const count = await frame.locator('body').evaluate(PARAGRAPH_COUNT)
    expect(count).toBe(before + i) // one MORE paragraph per keypress — never collapses back
    expect(await frame.locator('body').evaluate(CARET_IN_TRAILING)).toBe(true)
  }
})
