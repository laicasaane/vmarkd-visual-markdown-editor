import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

// SKIPPED (2026-08-01) — this spec asserts a design task 457 DELIBERATELY REVERSED, one day after
// this file was written. It is kept, disabled, rather than deleted, by the maintainer's call.
//
// What it asserts: chips carry `tabindex="0"`, so Tab reaches one and Enter/Space activates it.
// What ships instead: chips carry NO tabindex at all, and activation is CARET-targeted
// (Ctrl/Cmd+Enter — link-click-fix.ts, via the shared caret-gesture dispatcher). 457 measured that
// Tab can never reach an in-document chip regardless of tabindex, because Vditor's `tab: '\t'`
// preventDefaults every Tab inside the editable surface, so a tabindex only advertised a focus
// route that does not exist. The unit tests now assert the OPPOSITE of this file
// (custom-renderer.test.ts / wiki-serialize.test.ts: `expect(html).not.toContain('tabindex')`),
// which is how you can tell which of the two is stale.
//
// Measured, not assumed: 12/12 fail with --retries=0, identically before and after the commits that
// were in flight when this was found, and a probe shows every chip at `tabIndex: -1`. It had been
// passing in CI's eyes only because retries hid it — and CI itself had not run on this branch since
// 2026-06-16, so nothing caught it when 457 landed.
//
// The shipped design is covered by: link-click-fix.test.ts and caret-gesture-precedence.test.ts
// (unit), media-src/e2e/wiki-click.spec.ts, and test/vscode-e2e/wiki-chip-focus.spec.ts. So nothing
// is uncovered while this sits skipped — re-enabling it would require RE-adding the tabindex 457
// removed on purpose, i.e. it is not a to-do, it is a record.

async function gotoWiki(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__posted = []
    ;(window as any).acquireVsCodeApi = () => ({
      postMessage: (m: any) => (window as any).__posted.push(m),
      getState: () => undefined,
      setState: () => {
        /* vscode API stub: state persistence unused in this spec */
      },
    })
  })
  await page.goto('/wiki.html')
  await page.waitForFunction(() => (window as any).__ready === true)
}

function chip(page: Page, target: string) {
  return page.locator(`.wiki-link-chip[data-wiki-target="${target}"]`)
}

async function posted(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__posted)
}

async function clearPosted(page: Page) {
  await page.evaluate(() => ((window as any).__posted = []))
}

// Tabs forward from `document.body` until `target` is the active element, or `max` presses are
// exhausted (a bounded loop, not a fixed count — the exact number of stops before the first chip
// is an implementation detail of the toolbar/editor chrome, not what this test is about).
async function tabUntilFocused(
  page: Page,
  target: ReturnType<typeof chip>,
  max = 30,
): Promise<boolean> {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((el) => el === document.activeElement)) {
      return true
    }
  }
  return false
}

test.describe
  .skip('wiki chip keyboard focus + activation (task 457) — see the header: the design this asserts was reversed', () => {
    test('Tab reaches a wiki chip', async ({ page }) => {
      await gotoWiki(page)
      const home = chip(page, 'Home')
      expect(await tabUntilFocused(page, home)).toBe(true)
    })

    test('Enter on a focused chip navigates (posts open-wikilink), reusing the click path', async ({
      page,
    }) => {
      await gotoWiki(page)
      const home = chip(page, 'Home')
      expect(await tabUntilFocused(page, home)).toBe(true)
      await clearPosted(page)
      await page.keyboard.press('Enter')
      const msgs = await posted(page)
      const wikiMsgs = msgs.filter((m) => m.command === 'open-wikilink')
      expect(wikiMsgs).toHaveLength(1)
      expect(wikiMsgs[0].target).toBe('Home')
    })

    test('Space on a focused chip also navigates', async ({ page }) => {
      await gotoWiki(page)
      const home = chip(page, 'Home')
      expect(await tabUntilFocused(page, home)).toBe(true)
      await clearPosted(page)
      await page.keyboard.press(' ')
      const msgs = await posted(page)
      const wikiMsgs = msgs.filter((m) => m.command === 'open-wikilink')
      expect(wikiMsgs).toHaveLength(1)
      expect(wikiMsgs[0].target).toBe('Home')
    })

    test('keyboard activation does not change the document (getValue() unchanged)', async ({
      page,
    }) => {
      await gotoWiki(page)
      const before = await page.evaluate(() =>
        (window as any).vditor.getValue(),
      )
      const home = chip(page, 'Home')
      expect(await tabUntilFocused(page, home)).toBe(true)
      await page.keyboard.press('Enter')
      const after = await page.evaluate(() => (window as any).vditor.getValue())
      expect(after).toBe(before)
    })
  })
