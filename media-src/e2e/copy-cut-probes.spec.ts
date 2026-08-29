import { expect, test } from './coverage-fixture'
import {
  getValue,
  gotoMouseops,
  setDoc,
  syntheticClipboard,
  UNSET,
} from './mouseops-helpers'

// PROBES (task 191 §4) — originally written to observe and PIN two suspected-broken collapsed-
// clipboard behaviours as a "current, possibly-undesirable" baseline, pending a product decision.
// That decision shipped as task 385 (patchClipboardCollapsed / patchCutDeleteSync /
// patchSvCopyGuard in esbuild-shared.mjs, driven by clipboard-line.ts): a collapsed Ctrl+X is now
// INERT instead of a stealth backspace, and a collapsed sv Ctrl+C now bails out (leaving the
// clipboard untouched) instead of clobbering it with "". These two tests are updated to pin that
// FIXED behaviour — kept as a regression net at this layer, not because it's the primary proof.
//
// It is NOT the primary proof: task 385's own line-copy/line-cut behaviour is gated on a
// KEYDOWN listener (clipboard-line.ts), and a collapsed selection makes Chromium skip the
// native `copy` event entirely — so `syntheticClipboard`'s direct `dispatchEvent(new
// ClipboardEvent(...))` (no real keydown) can only exercise the unconditional guard inside the
// copy/cut handlers themselves, not the line-expansion. The real keystroke behaviour (a
// collapsed Ctrl+C copies the current line; a collapsed Ctrl+X leaves the doc byte-identical) is
// proven with real keystrokes + the real system clipboard in `test/vscode-e2e/clipboard-collapsed.spec.ts`
// (task 385's own verification) — a synthetic ClipboardEvent proves nothing about that half.

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

// PROBE-15 — a collapsed Ctrl+X with NO real keydown (so clipboard-line.ts never records a cut
// intent and `takeCutIntent()` returns undefined, falling back to the live selection, which here
// genuinely reports collapsed === true — unlike VS Code's real clipboard bridge, see
// patchClipboardCollapsed's comment). The cutEvent patch's `!vmdeCollapsed` guard therefore
// skips `execCommand('delete')` entirely: the cut is INERT, not a stealth backspace.
test('PROBE-15: a collapsed cut is inert — no stealth backspace', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'abcdefgh\n')
  await caretAfter(page, 'abc')
  await syntheticClipboard(page, 'cut')
  // Give the (now-skipped) delete a beat to prove it does NOT fire, then assert the
  // document is still byte-identical.
  await page.waitForTimeout(300)
  const value = await getValue(page)
  expect(value).toContain('abcdefgh') // nothing lost — the guard held
})

// PROBE-14 — a collapsed Ctrl+C in sv with NO real keydown, so clipboard-line.ts's keydown-gated
// line-expansion never runs. patchSvCopyGuard's copy() still calls __vmdeExpandToLine directly
// as a belt-and-suspenders — but sv has no per-line block elements (BLOCK_SELECTOR matches
// nothing above the editor root in sv's DOM), so expandToLine leaves the selection collapsed and
// getSelectText(...) is still "". The guard's `if (vmdeText === "") return` then fires BEFORE
// touching clipboardData at all — the clipboard is left UNTOUCHED (UNSET), not clobbered with ''.
test('PROBE-14: a collapsed copy in sv leaves the clipboard untouched, does not clobber it', async ({
  page,
}) => {
  await gotoMouseops(page, 'sv')
  await setDoc(page, 'some source text\n')
  await caretAfter(page, 'some')
  const { plain } = await syntheticClipboard(page, 'copy')
  // The guard bails before calling setData — the pre-seeded sentinel survives untouched,
  // proving the OLD clobber-with-'' bug (task 191 PROBE-14) is gone.
  expect(plain).toBe(UNSET)
})
