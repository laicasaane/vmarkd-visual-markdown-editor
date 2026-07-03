import { expect, test } from './coverage-fixture'
import {
  getValue,
  gotoMouseops,
  setDoc,
  syntheticClipboard,
  UNSET,
} from './mouseops-helpers'

// PROBES (task 191 §4) — suspected-broken clipboard edge cases. Run to observe the REAL
// behaviour, then PIN it: these are documented-as-current, flagged as fix candidates gated on
// a product decision (the collapsed-cut/collapsed-copy handlers act unconditionally in
// Vditor). Kept out of the smoke battery — they assert current, possibly-undesirable behaviour.

// Place a collapsed caret right after the first occurrence of `after` in the editor.
async function caretAfter(
  page: import('@playwright/test').Page,
  after: string,
) {
  await page.evaluate((needle) => {
    const el = (window as any).__modeEl() as HTMLElement
    el.focus()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n: Node | null = walker.nextNode()
    while (n) {
      const i = (n.textContent ?? '').indexOf(needle)
      if (i >= 0) {
        const r = document.createRange()
        r.setStart(n, i + needle.length)
        r.collapse(true)
        const s = getSelection()!
        s.removeAllRanges()
        s.addRange(r)
        return
      }
      n = walker.nextNode()
    }
    throw new Error(`caretAfter: ${needle} not found`)
  }, after)
}

// PROBE-15 — a collapsed Ctrl+X (no selection) is a stealth backspace: Vditor's cutEvent
// runs execCommand('delete') UNCONDITIONALLY (the copy() empty-guard only skips the clipboard
// write, not the delete). Pinned as current behaviour; a fix (skip delete when collapsed)
// is a product decision.
test('PROBE-15: a collapsed cut deletes the character before the caret (stealth backspace)', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'abcdefgh\n')
  await caretAfter(page, 'abc')
  await syntheticClipboard(page, 'cut')
  // The deferred execCommand('delete') removes the char before the caret ('c').
  await expect
    .poll(() => getValue(page), { timeout: 5_000, intervals: [50, 100, 200] })
    .not.toContain('abcdefgh')
  const value = await getValue(page)
  expect(value).toContain('abdefgh') // 'c' gone — a silent one-char loss
})

// PROBE-14 — a collapsed Ctrl+C in sv writes getSelectText(...) to text/plain
// unconditionally. With no selection that is the empty string, i.e. it CLOBBERS the clipboard
// with '' (no early-return guard like ir/wysiwyg). Pinned as current behaviour.
test('PROBE-14: a collapsed copy in sv clobbers text/plain with an empty string', async ({
  page,
}) => {
  await gotoMouseops(page, 'sv')
  await setDoc(page, 'some source text\n')
  await caretAfter(page, 'some')
  const { plain } = await syntheticClipboard(page, 'copy')
  // Unlike ir/wysiwyg (which early-return on an empty selection, leaving the clipboard
  // untouched → UNSET), sv sets text/plain to the empty selection text.
  expect(plain).not.toBe(UNSET)
  expect(plain).toBe('')
})
