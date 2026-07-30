import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

/**
 * E2e for Vditor's listToggle crash fix (task 56). The uncheck path iterates ALL
 * sibling <li> and called `.remove()` on a missing <input> — a checkbox-less
 * sibling threw. Fixed with `?.` (the fixListToggle patch); this asserts the
 * toggle no longer throws. (The sibling-scope behaviour is parked — see below.)
 */
async function gotoList(page: Page, list: 'plain' | 'mixed' | 'ops') {
  await page.goto(`/list.html?list=${list}`)
  await page.waitForFunction(() => (window as any).__ready === true)
}

// Toggle list type on the Nth <li>; returns {ok,error} from the harness.
function toggle(page: Page, liIndex: number, type: string) {
  return page.evaluate(
    ({ liIndex, type }) => (window as any).__listToggle(liIndex, type),
    { liIndex, type },
  )
}

test.describe('listToggle — crash fix (task 56)', () => {
  test('toggling list type on a mixed list does not throw on a checkbox-less sibling', async ({
    page,
  }) => {
    await gotoList(page, 'mixed')
    // Item 0 has a checkbox; the uncheck path iterates every sibling incl. the
    // plain bullet (index 2). Pre-fix this threw on `.remove()` of null.
    const res = await toggle(page, 0, 'list')
    expect(res.ok).toBe(true)
    expect(res.error).toBeNull()
  })
})

// Sibling-scope (task 56) is PARKED by decision: Vditor's listToggle mutates the
// WHOLE list (`itemElement.parentElement.querySelectorAll("li")`), so toggling
// "check"/"list" affects every sibling, not just the clicked item. We accept that
// upstream whole-list behaviour as-is and do NOT pursue the Aloklok per-item split
// rewrite. Only the crash (above) was fixed. See tasks/56 for the rationale.

// Task 453 — migrated from test/vscode-e2e/list-ops.spec.ts (NET, task 190 P1): list editing
// round-trips to correct markdown. Continuing a list with Enter is the common op; asserts the
// serialized getValue() (what actually saves). Pure Vditor + Lute, no host API touched — the
// real-VS-Code original's only non-portable bit was a webview-iframe focus quirk (documented
// there as a harness artifact, not product behaviour), which doesn't exist in this plain-page
// harness.
test.describe('list editing — Enter continues a list (task 190 P1)', () => {
  test('continuing a bullet list with Enter serializes a new sibling item', async ({
    page,
  }) => {
    await gotoList(page, 'ops')

    const getValue = () =>
      page.evaluate(
        () => (window as any).vditor.getValue() as string,
      ) as Promise<string>

    // Sanity: the list loaded and serializes on open.
    const initial = await getValue()
    expect(initial, 'task list present on open').toMatch(/- \[ \]\s+task one/)
    expect(initial, 'bullet list present on open').toContain('- bullet B')

    // Place the caret at the end of "bullet B", Enter to continue the list, type a new item.
    await page.evaluate(() => {
      const li = [...document.querySelectorAll('.vditor-ir li')].find((x) =>
        x.textContent?.includes('bullet B'),
      ) as HTMLElement | undefined
      if (!li) throw new Error('bullet B not found')
      const r = document.createRange()
      r.selectNodeContents(li)
      r.collapse(false)
      const s = getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
      li.focus()
    })
    await page.keyboard.press('Enter')
    await page.keyboard.type('bullet NEW', { delay: 40 })
    await page.waitForTimeout(500)

    const afterEnter = await getValue()
    // eslint-disable-next-line no-console
    console.log(
      `[list] afterEnter tail=${JSON.stringify(afterEnter.slice(-90))}`,
    )
    // The new text is its own bullet item (a "- " line), and bullet B is preserved.
    expect(afterEnter, 'Enter created a new bullet item').toMatch(
      /- bullet NEW/,
    )
    expect(afterEnter, 'original bullet B preserved').toContain('- bullet B')
    // The task list above was not disturbed by editing the bullet list below.
    expect(afterEnter, 'task list intact').toMatch(/- \[ \]\s+task one/)
  })
})
