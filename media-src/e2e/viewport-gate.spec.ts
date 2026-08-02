import { expect, test } from './coverage-fixture'

// Task 412's shared viewport gate (media-src/src/nav/viewport-gate.ts) has thorough unit coverage
// against a HAND-ROLLED fake IntersectionObserver (viewport-gate.test.ts) — but jsdom has no real
// one, so nothing on main proves the actual browser geometry/rootMargin/scroll wiring end to end.
// This is that net: near work runs immediately, offscreen work is deferred until it scrolls in.
test.use({ viewport: { width: 1000, height: 500 } })

test('shared viewport gate runs near work and defers offscreen work until scroll-in', async ({
  page,
}) => {
  await page.goto('/viewport-gate.html')
  await page.waitForFunction(() => (window as any).__viewportGate?.ready)

  // #near is visible on load (top of page, well within the viewport) — rendered synchronously by
  // the harness's own `for (const el of visible) render(el)` loop, no scroll needed.
  await expect
    .poll(() => page.evaluate(() => (window as any).__viewportGate.rendered()))
    .toEqual(['near'])

  await page.locator('#offscreen-a').scrollIntoViewIfNeeded()
  await expect
    .poll(() => page.evaluate(() => (window as any).__viewportGate.rendered()))
    .toEqual(['near', 'offscreen-a'])

  // Not yet in view — must still be deferred (proves the gate isn't just "renders everything on any
  // scroll event", which would make this whole spec pass regardless of the real gating logic).
  expect(
    await page.evaluate(() => (window as any).__viewportGate.rendered()),
  ).not.toContain('offscreen-b')

  await page.locator('#offscreen-b').scrollIntoViewIfNeeded()
  await expect
    .poll(() => page.evaluate(() => (window as any).__viewportGate.rendered()))
    .toEqual(['near', 'offscreen-a', 'offscreen-b'])
})
