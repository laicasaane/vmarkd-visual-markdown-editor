import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

// E2e for the outline cluster (tasks 07/08/13): the outline panel renders its
// heading items on the configured side, clicking one flashes the target
// heading, and the highlight/width CSS hooks behave.

async function gotoOutline(page: Page) {
  await page.goto('/outline.html')
  await page.waitForFunction(() => (window as any).__ready === true)
}

test('outline renders heading items and opens on the configured (right) side', async ({
  page,
}) => {
  await gotoOutline(page)
  await expect(page.locator('.vditor-outline')).toHaveClass(
    /vditor-outline--right/,
  )
  const items = page.locator('.vditor-outline li span[data-target-id]')
  // one per heading in the harness document (H1/H2/H3)
  expect(await items.count()).toBeGreaterThanOrEqual(3)
})

test('clicking an outline item flashes the target heading (task 13)', async ({
  page,
}) => {
  await gotoOutline(page)
  const targetId = await page.evaluate(() => {
    const span = document.querySelector(
      '.vditor-outline li span[data-target-id]',
    ) as HTMLElement
    span.click() // bubbles to the outline container → setupOutlineFlash
    return span.getAttribute('data-target-id')
  })
  // SCROLL_SETTLE_MS is 60ms; wait past it then assert the flash class landed.
  await page.waitForTimeout(150)
  const flashed = await page.evaluate(
    (id) => document.getElementById(id!)?.classList.contains('heading-flash'),
    targetId,
  )
  expect(flashed).toBe(true)
})

test('highlight-headings attr themes headings; --me-outline-width drives panel width', async ({
  page,
}) => {
  await gotoOutline(page)
  const styles = await page.evaluate(() => {
    document.body.setAttribute('data-highlight-headings', '1')
    document.body.style.setProperty('--me-outline-width', '321px')
    const h1 = document.querySelector('.vditor-reset h1') as HTMLElement
    const outline = document.querySelector('.vditor-outline') as HTMLElement
    return {
      h1Radius: getComputedStyle(h1).borderRadius,
      h1Bg: getComputedStyle(h1).backgroundColor,
      outlineWidth: getComputedStyle(outline).width,
    }
  })
  expect(styles.h1Radius).toBe('3px') // heading-highlight rule applied
  // translucent overlay (follows the theme), not a fixed blue-grey var
  expect(styles.h1Bg).toBe('rgba(127, 127, 127, 0.13)')
  expect(styles.outlineWidth).toBe('321px') // width var applied
})

// Task 478 item 2: `.vditor-outline` width used to be a main.css override (200px) beating
// Vditor's own hardcoded 250px on load order alone; now the 200px default lives directly on
// Vditor's own rule (build.mjs patchVditorIndexCss), token-driven the same way. This is the
// case the explicit-321px test above can't cover: a fresh page where `--me-outline-width` was
// NEVER set, so the FALLBACK value in the `var(…, 200px)` expression is what's read.
test("`.vditor-outline` width defaults to 200px (not Vditor's 250px) when --me-outline-width is unset (task 478 item 2)", async ({
  page,
}) => {
  await gotoOutline(page)
  const width = await page.evaluate(() => {
    const outline = document.querySelector('.vditor-outline') as HTMLElement
    return getComputedStyle(outline).width
  })
  expect(width).toBe('200px')
})

test('--me-font-size drives the .vditor-reset base size; headings scale with it (task 43)', async ({
  page,
}) => {
  await gotoOutline(page)
  const sizes = await page.evaluate(() => {
    const reset = document.querySelector('.vditor-reset') as HTMLElement
    const h1 = document.querySelector('.vditor-reset h1') as HTMLElement
    document.body.style.setProperty('--me-font-size', '20px')
    const base20 = parseFloat(getComputedStyle(reset).fontSize)
    const h1At20 = parseFloat(getComputedStyle(h1).fontSize)
    document.body.style.setProperty('--me-font-size', '10px')
    const base10 = parseFloat(getComputedStyle(reset).fontSize)
    return { base20, base10, h1At20 }
  })
  expect(sizes.base20).toBe(20) // CSS rule follows the var
  expect(sizes.base10).toBe(10) // and updates live
  expect(sizes.h1At20).toBeGreaterThan(20) // em-relative heading scales up
})

// Task 478 item 5: `.vditor .vditor-reset { font-family: var(--vscode-editor-font-family)
// !important }` used to be a main.css override beating Vditor's own unconditional
// `.vditor-reset { font-family: "Helvetica Neue", … }` (0,1,0) on specificity alone — a
// genuine ADR-0003 violation. Now patched directly on Vditor's own base rule (build.mjs
// patchVditorIndexCss). The font-SIZE half is already proven live above; this proves the
// font-FAMILY half follows the same var and that Vditor's hardcoded stack no longer wins.
test("`.vditor-reset` font-family follows --vscode-editor-font-family, not Vditor's hardcoded stack (task 478 item 5)", async ({
  page,
}) => {
  await gotoOutline(page)
  const family = await page.evaluate(() => {
    const reset = document.querySelector('.vditor-reset') as HTMLElement
    document.documentElement.style.setProperty(
      '--vscode-editor-font-family',
      'Consolas',
    )
    return getComputedStyle(reset).fontFamily
  })
  expect(family).toBe('Consolas')
  expect(family).not.toContain('Helvetica Neue') // Vditor's hardcoded default, no longer wins
})

test('showHeadingMarkers toggle hides the gutter markers WITHOUT moving the text', async ({
  page,
}) => {
  await gotoOutline(page)
  const result = await page.evaluate(() => {
    const h1 = document.querySelector(
      '.vditor-ir .vditor-reset > h1',
    ) as HTMLElement
    const reset = document.querySelector(
      '.vditor-ir .vditor-reset',
    ) as HTMLElement
    // The gutter is a FIXED --vmarkd-gutter (VS Code's native-preview inset, 52px) that the markers
    // are floated INTO, so hiding them only empties it — the text column must not move (task
    // 438; it used to collapse to 10px in full width). Measured in full-width mode, where the
    // padding is the gutter itself rather than the centring formula.
    document.body.setAttribute('data-full-width', '1')
    document.body.setAttribute('data-heading-markers', '1')
    const shown = getComputedStyle(h1, '::before').display
    const padOn = getComputedStyle(reset).paddingLeft
    document.body.setAttribute('data-heading-markers', '0')
    const hidden = getComputedStyle(h1, '::before').display
    const padOff = getComputedStyle(reset).paddingLeft
    return { shown, hidden, padOn, padOff }
  })
  expect(result.shown).not.toBe('none') // marker visible by default
  expect(result.hidden).toBe('none') // hidden when toggled off
  // the gutter (and with it the text origin) is IDENTICAL in both marker states
  expect(parseFloat(result.padOff)).toBe(parseFloat(result.padOn))
  expect(parseFloat(result.padOn)).toBe(52)
})

// The drag-resize handle must track the outline's visibility. Vditor's Outline.toggle()
// only flips the panel's inline display; with the outline OFF the handle would otherwise
// hang at the editor's right edge (visible grip for a hidden panel) and its straddle margins
// poked a few px past the viewport → a phantom horizontal scrollbar. outline-resize.ts mirrors
// the outline's display onto the handle.
test('the resize handle is hidden when the outline is toggled off, shown when on', async ({
  page,
}) => {
  await gotoOutline(page)
  const handle = page.locator('.outline-resize-handle')
  await expect(handle).toHaveCount(1)
  // outline starts enabled → handle visible
  await expect(handle).toBeVisible()

  // toggle the outline OFF through Vditor's own path (sets display:none on the panel)
  await page.evaluate(() => {
    const v = (window as any).vditor.vditor
    v.outline.toggle(v, false)
  })
  await expect(handle).toBeHidden() // MutationObserver mirrored display:none

  // and back ON
  await page.evaluate(() => {
    const v = (window as any).vditor.vditor
    v.outline.toggle(v, true)
  })
  await expect(handle).toBeVisible()
})

// Task 458 — outline panel keyboard operability. The harness document nests all 3 headings
// (H1 > H2 > H3), giving a real parent/child chain to exercise ArrowRight/Left on, not just a
// flat list.
test('outline items are role="treeitem" in a role="tree" with roving tabindex; ArrowDown moves focus', async ({
  page,
}) => {
  await gotoOutline(page)
  const items = page.locator('.vditor-outline li span[data-target-id]')
  await expect(items.first()).toHaveAttribute('role', 'treeitem')
  await expect(page.locator('.vditor-outline__content > ul')).toHaveAttribute(
    'role',
    'tree',
  )
  // Roving tabindex: exactly the first item starts tabbable.
  expect(await items.nth(0).getAttribute('tabindex')).toBe('0')
  expect(await items.nth(1).getAttribute('tabindex')).toBe('-1')

  await items.nth(0).evaluate((el: HTMLElement) => el.focus())
  await page.keyboard.press('ArrowDown')
  const secondIsActive = await items
    .nth(1)
    .evaluate((el) => el === document.activeElement)
  expect(secondIsActive).toBe(true)
  expect(await items.nth(1).getAttribute('tabindex')).toBe('0')
  expect(await items.nth(0).getAttribute('tabindex')).toBe('-1')
})

test('ArrowRight expands/descends, ArrowLeft collapses/ascends (WAI-ARIA treeview pattern)', async ({
  page,
}) => {
  await gotoOutline(page)
  const items = page.locator('.vditor-outline li span[data-target-id]')
  const [h1, h2, h3] = [items.nth(0), items.nth(1), items.nth(2)]

  await h1.evaluate((el: HTMLElement) => el.focus())
  // H1 starts expanded (Vditor's default) → ArrowRight descends straight to its child, H2.
  await expect(h1).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  expect(await h2.evaluate((el) => el === document.activeElement)).toBe(true)

  // H2 also starts expanded → ArrowRight descends to the leaf, H3 (no aria-expanded — no children).
  await page.keyboard.press('ArrowRight')
  expect(await h3.evaluate((el) => el === document.activeElement)).toBe(true)
  expect(await h3.getAttribute('aria-expanded')).toBeNull()
  // A leaf's own ArrowRight is a no-op (nothing to expand into).
  await page.keyboard.press('ArrowRight')
  expect(await h3.evaluate((el) => el === document.activeElement)).toBe(true)

  // Leaf ArrowLeft steps up to the parent (H2), not a collapse (H3 has no children to collapse).
  await page.keyboard.press('ArrowLeft')
  expect(await h2.evaluate((el) => el === document.activeElement)).toBe(true)

  // H2 is still expanded (with a child) → ArrowLeft here COLLAPSES it in place, staying on H2.
  await page.keyboard.press('ArrowLeft')
  expect(await h2.evaluate((el) => el === document.activeElement)).toBe(true)
  await expect(h2).toHaveAttribute('aria-expanded', 'false')

  // H2 is now collapsed → a second ArrowLeft steps up to ITS parent, H1.
  await page.keyboard.press('ArrowLeft')
  expect(await h1.evaluate((el) => el === document.activeElement)).toBe(true)
})

test('Enter activates the focused outline item via scrollToHeadingIndex (flash), leaving getValue() untouched', async ({
  page,
}) => {
  await gotoOutline(page)
  const items = page.locator('.vditor-outline li span[data-target-id]')
  const second = items.nth(1)
  const targetId = await second.getAttribute('data-target-id')
  const before = await page.evaluate(() => (window as any).vditor.getValue())

  await second.evaluate((el: HTMLElement) => el.focus())
  await page.keyboard.press('Enter')
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          document.getElementById(id!)?.classList.contains('heading-flash'),
        targetId,
      ),
    )
    .toBe(true)

  const after = await page.evaluate(() => (window as any).vditor.getValue())
  expect(after).toBe(before)
})

test('the resize handle is a keyboard-operable role="separator": Arrow/Home/End resize + persist', async ({
  page,
}) => {
  await gotoOutline(page)
  const handle = page.locator('.outline-resize-handle')
  await expect(handle).toHaveAttribute('role', 'separator')
  await expect(handle).toHaveAttribute('aria-orientation', 'vertical')
  expect(await handle.evaluate((el: HTMLElement) => el.tabIndex)).toBe(0)

  // The panel's OWN computed (content-box) width — what `--me-outline-width` directly sets and
  // what every assertion below checks against.
  const widthVar = () =>
    page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.querySelector('.vditor-outline')!).width,
      ),
    )
  const persistedWidth = () =>
    page.evaluate(() => (window as any).__lastOutlineWidth)

  // The FIRST keyboard step's basis is `offsetWidth` (border-box — the harness never sets
  // `--me-outline-width` explicitly, so there is no var yet to build on; outline-resize.ts falls
  // back to offsetWidth exactly here, same as the drag path's own first read). `.vditor-outline`
  // carries a 1px border on the resize-handle side, so offsetWidth is 1px MORE than the content-box
  // `widthVar()` reads — that's the correct basis for what the FIRST press produces, not `widthVar`
  // itself. Every step after this one is v1px-free: it builds on the var this test itself just
  // wrote, so plain `+10`/`-10` arithmetic against it holds exactly.
  const startOffset = await page.evaluate(
    () =>
      (document.querySelector('.vditor-outline') as HTMLElement).offsetWidth,
  )
  await handle.evaluate((el: HTMLElement) => el.focus())
  // Harness mounts the outline on the RIGHT (outline-harness.ts) — ArrowLeft grows it (moving the
  // boundary away from the panel's own edge), matching keyboardWidthDelta's sign convention.
  await page.keyboard.press('ArrowLeft')
  const afterFirstPress = startOffset + 10
  await expect.poll(widthVar).toBe(afterFirstPress)
  expect(await persistedWidth()).toBe(afterFirstPress)

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const afterThreePresses = afterFirstPress - 20
  await expect.poll(widthVar).toBe(afterThreePresses)
  expect(await persistedWidth()).toBe(afterThreePresses)

  await page.keyboard.press('Home')
  await expect.poll(widthVar).toBe(100) // MIN_WIDTH
  expect(await persistedWidth()).toBe(100)

  const expectedMax = await page.evaluate(() =>
    Math.floor(window.innerWidth * 0.5),
  )
  await page.keyboard.press('End')
  await expect.poll(widthVar).toBe(expectedMax)
  expect(await persistedWidth()).toBe(expectedMax)
})
