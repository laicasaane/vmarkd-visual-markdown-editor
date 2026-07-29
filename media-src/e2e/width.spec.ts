import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

// E2e for narrow-width (full-width OFF) centring. The 800px text column must be
// horizontally centred (equal left/right margins) on every surface, and must NOT
// shift between Edit and Preview. Regression for: (a) Preview pane left-aligned while
// the editor centred → a width/gutter jump on toggle; (b) heading-markers OFF forcing
// a fixed 10px left gutter → content stuck left with no left margin.

const VIEWPORT = { width: 1300, height: 900 }
const COLUMN = 800 // Vditor preview.maxWidth default (vMarkd doesn't override it)

test.use({ viewport: VIEWPORT })

async function gotoWidth(page: Page) {
  await page.goto('/width.html')
  await page.waitForFunction(() => (window as any).__ready === true)
}

// Distance from the viewport's left/right edge to where the TEXT actually starts/ends
// (the element's border-box rect adjusted by its horizontal padding), plus the content
// width. Centred ⟺ leftGap ≈ rightGap.
async function measure(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const padL = parseFloat(cs.paddingLeft) || 0
    const padR = parseFloat(cs.paddingRight) || 0
    return {
      leftGap: r.left + padL,
      rightGap: window.innerWidth - (r.right - padR),
      contentWidth: r.width - padL - padR,
    }
  }, selector)
}

const IR = '.vditor-ir pre.vditor-reset'
const PREVIEW = '.vditor-preview > .vditor-reset'

test('IR editor centres the 800px column (equal left/right margins)', async ({
  page,
}) => {
  await gotoWidth(page)
  const m = (await measure(page, IR))!
  expect(m).not.toBeNull()
  // centred: gaps within a few px of each other, and clearly NOT left-aligned
  expect(Math.abs(m.leftGap - m.rightGap)).toBeLessThan(10)
  expect(m.leftGap).toBeGreaterThan(100)
  expect(Math.abs(m.contentWidth - COLUMN)).toBeLessThan(40)
})

test('heading-markers OFF keeps the column centred (still has a left margin)', async ({
  page,
}) => {
  await gotoWidth(page)
  const before = (await measure(page, IR))!
  await page.evaluate(() => (window as any).__setMarkers(false))
  const after = (await measure(page, IR))!
  // markers off must NOT collapse the left gutter to ~10px — stays centred
  expect(Math.abs(after.leftGap - after.rightGap)).toBeLessThan(10)
  expect(after.leftGap).toBeGreaterThan(100)
  // and the column doesn't move when markers toggle
  expect(Math.abs(after.leftGap - before.leftGap)).toBeLessThan(6)
})

test('Preview pane centres the same column with no Edit→Preview shift', async ({
  page,
}) => {
  // Force classic (non-overlay) scrollbars — Playwright defaults to overlay, hiding
  // the Edit↔Preview shift caused by the scrollbar taking space inside the pane.
  await page.addStyleTag({
    content:
      '::-webkit-scrollbar { width: 16px !important; } ' +
      '* { scrollbar-width: auto !important; }',
  })
  await gotoWidth(page)
  const editGap = (await measure(page, IR))!.leftGap

  await page.click('[data-type="preview"]')
  await page.waitForSelector(PREVIEW, { state: 'visible' })
  const m = (await measure(page, PREVIEW))!

  // preview content left edge matches the editor's → no horizontal jump on toggle,
  // even with a classic scrollbar taking space on the right
  expect(Math.abs(m.leftGap - editGap)).toBeLessThan(8)
  expect(Math.abs(m.contentWidth - COLUMN)).toBeLessThan(40)
})

// Full-width ON: the preview content must FIT its pane. The full-width rule sets the reset
// to width:100% + 20px side padding; without box-sizing:border-box that padding is ADDED to
// the 100% → the content is 40px wider than the pane → a phantom horizontal scrollbar.
test('full-width Preview content fits its pane (no horizontal overflow)', async ({
  page,
}) => {
  await gotoWidth(page)
  await page.evaluate(() => (window as any).__setFullWidth(true))
  await page.click('[data-type="preview"]')
  await page.waitForSelector(PREVIEW, { state: 'visible' })
  const over = await page.evaluate(() => {
    const pane = document.querySelector('.vditor-preview') as HTMLElement
    return { scrollW: pane.scrollWidth, clientW: pane.clientWidth }
  })
  // the pane does not scroll horizontally (allow 1px for sub-pixel rounding)
  expect(over.scrollW - over.clientW).toBeLessThanOrEqual(1)
})

// Full-width ON: the Preview must keep the SAME left gutter as the editor. Otherwise the
// content shifts left on Edit→Preview — the "gutter space disappears in preview".
test('full-width Preview keeps the editor left gutter (no Edit→Preview shift)', async ({
  page,
}) => {
  await gotoWidth(page)
  await page.evaluate(() => (window as any).__setFullWidth(true))
  const editGap = (await measure(page, IR))!.leftGap
  await page.click('[data-type="preview"]')
  await page.waitForSelector(PREVIEW, { state: 'visible' })
  const m = (await measure(page, PREVIEW))!
  // content left edge holds across Edit→Preview (the marker gutter is preserved)
  expect(Math.abs(m.leftGap - editGap)).toBeLessThan(6)
  expect(m.leftGap).toBeCloseTo(52, 0) // the gutter itself, not a collapsed one
})

// --- VS Code native-preview parity (task 438) -------------------------------------------
// Full-width ON is the product default and must match VS Code's built-in markdown preview,
// which puts `padding: 0 26px` on html AND body — 52px of real inset, measured in a live preview
// (test/vscode-e2e/native-preview-probe.spec.ts). Two invariants, both regressions we shipped:
// (a) the gutter was 35px left / 20px right — asymmetric AND wider than the native preview;
// (b) hiding the heading markers tightened the left gutter to 10px, so the whole text
//     column jumped when the setting was toggled.
const GUTTER = 52

test('full-width uses the VS Code preview gutter, symmetric on both sides', async ({
  page,
}) => {
  await gotoWidth(page)
  await page.evaluate(() => (window as any).__setFullWidth(true))
  const m = (await measure(page, IR))!
  expect(m.leftGap).toBeCloseTo(GUTTER, 0)
  // right side may lose the scrollbar width; the padding itself must still be the gutter
  const padR = await page.evaluate(
    (sel) =>
      parseFloat(
        getComputedStyle(document.querySelector(sel) as HTMLElement)
          .paddingRight,
      ),
    IR,
  )
  expect(padR).toBeCloseTo(GUTTER, 0)
})

test('heading markers do NOT move the text column (full width)', async ({
  page,
}) => {
  await gotoWidth(page)
  await page.evaluate(() => (window as any).__setFullWidth(true))
  const on = (await measure(page, IR))!
  await page.evaluate(() => (window as any).__setMarkers(false))
  const off = (await measure(page, IR))!
  expect(off.leftGap).toBeCloseTo(on.leftGap, 0)
  expect(off.leftGap).toBeCloseTo(GUTTER, 0)
})

test('heading markers fit inside the gutter (not clipped by the pane edge)', async ({
  page,
}) => {
  await gotoWidth(page)
  await page.evaluate(() => (window as any).__setFullWidth(true))
  const marker = await page.evaluate(() => {
    const h1 = document.querySelector(
      '.vditor-ir .vditor-reset h1',
    ) as HTMLElement
    const cs = getComputedStyle(h1, '::before')
    const pane = document.querySelector(
      '.vditor-ir pre.vditor-reset',
    ) as HTMLElement
    const padL = parseFloat(getComputedStyle(pane).paddingLeft)
    const offset = -parseFloat(cs.marginLeft) // how far left of the text the marker starts
    const width = parseFloat(cs.width) + parseFloat(cs.paddingRight)
    return { padL, offset, width }
  })
  // the marker starts inside the pane (offset ≤ padding) and ends before the text column
  expect(marker.offset).toBeLessThanOrEqual(marker.padL)
  expect(marker.width).toBeLessThanOrEqual(marker.offset)
})

// The narrow view (full-width OFF) is the ONLY thing allowed to change the margin, and it
// may only make it WIDER — its floor is the same gutter, so a pane narrower than 800px
// never ends up with less margin than full-width view.
test('narrow view never gives a smaller gutter than full width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 900 })
  await gotoWidth(page)
  const m = (await measure(page, IR))!
  // measured from the viewport edge, so it also carries the editor's 1px border
  expect(m.leftGap).toBeGreaterThanOrEqual(GUTTER)
  expect(m.leftGap).toBeLessThanOrEqual(GUTTER + 2)
  expect(m.rightGap).toBeGreaterThanOrEqual(GUTTER - 20) // minus the scrollbar
})
