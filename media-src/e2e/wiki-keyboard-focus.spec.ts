import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

// Task 457 — wiki chips are <span>s; without an explicit tabindex a bare span is never
// keyboard-focusable, so main.css's existing `.wiki-link-chip:focus-visible` rule was dead CSS
// (nothing could ever trigger it) and Enter/Space activation (link-click-fix.ts's keydown
// listener, which already reused the SAME activateWikiLink the click handler calls) never
// received a keydown targeting a chip. This spec proves both: Tab can reach a chip, and Enter
// activates it via the shared open path — without duplicating any open logic.

async function gotoWiki(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__posted = []
    ;(window as any).acquireVsCodeApi = () => ({
      postMessage: (m: any) => (window as any).__posted.push(m),
      getState: () => undefined,
      setState: () => {},
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

test.describe('wiki chip keyboard focus + activation (task 457)', () => {
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
    const before = await page.evaluate(() => (window as any).vditor.getValue())
    const home = chip(page, 'Home')
    expect(await tabUntilFocused(page, home)).toBe(true)
    await page.keyboard.press('Enter')
    const after = await page.evaluate(() => (window as any).vditor.getValue())
    expect(after).toBe(before)
  })
})
