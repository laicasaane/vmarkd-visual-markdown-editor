import { expect, test } from './coverage-fixture'

test('moves overflowed items into more and restores their authored order', async ({
  page,
}) => {
  await page.goto('/toolbar-overflow.html')
  await page.waitForFunction(() => (window as any).__ready === true)

  await page.setViewportSize({ width: 360, height: 700 })
  await expect(page.locator('.vmarkd-toolbar-more')).toBeVisible()
  // The exact count depends on measured widths, so assert the give-way ORDER instead: emoji (first
  // to go) is in the menu while bold (last to go) is still in the row.
  await expect(
    page.locator(
      '.vmarkd-toolbar-more > .vditor-hint > .vditor-toolbar__item[data-vmarkd-overflow="true"]:has([data-type="emoji"])',
    ),
  ).toHaveCount(1, { timeout: 5_000 })
  const narrow = await page.evaluate(() => {
    const toolbar = document.querySelector('.vditor-toolbar') as HTMLElement
    const more = toolbar.querySelector(
      '.vmarkd-toolbar-more > .vditor-hint',
    ) as HTMLElement
    return {
      emojiInMore: !!more.querySelector('[data-type="emoji"]'),
      // bold is last in the give-way order, so it must still be in the row while emoji is not
      boldInRow: !!toolbar.querySelector(
        ':scope > .vditor-toolbar__item > [data-type="bold"]',
      ),
      editModeInRow: !!toolbar.querySelector(
        ':scope > .vditor-toolbar__item [data-type="edit-mode"]',
      ),
      overflowTabbable: [...more.querySelectorAll('button')].some(
        (button) => button.tabIndex === 0,
      ),
      moreExpanded: toolbar
        .querySelector('.vmarkd-toolbar-more > button')
        ?.getAttribute('aria-expanded'),
    }
  })
  expect(narrow.emojiInMore).toBe(true)
  expect(narrow.boldInRow).toBe(true)
  expect(narrow.editModeInRow).toBe(true)
  expect(narrow.overflowTabbable).toBe(true)
  expect(narrow.moreExpanded).toBe('false')

  await page.setViewportSize({ width: 1400, height: 700 })
  await expect(
    page.locator(
      '.vmarkd-toolbar-more > .vditor-hint > .vditor-toolbar__item[data-vmarkd-overflow="true"]',
    ),
  ).toHaveCount(0, { timeout: 5_000 })
  const order = await page
    .locator('.vditor-toolbar > .vditor-toolbar__item')
    .evaluateAll((items) =>
      items
        .map((item) =>
          item.querySelector(':scope > [data-type]')?.getAttribute('data-type'),
        )
        .filter(Boolean),
    )
  expect(order.indexOf('emoji')).toBeLessThan(order.indexOf('headings'))
  expect(order.indexOf('headings')).toBeLessThan(order.indexOf('bold'))
})

test('sweeps widths monotonically and holds steady on a threshold', async ({
  page,
}) => {
  await page.goto('/toolbar-overflow.html')
  await page.waitForFunction(() => (window as any).__ready === true)

  const overflowCount = () =>
    page.locator('[data-vmarkd-overflow="true"]').count()

  // Narrowing must never put an item BACK in the row (and widening never take one away): a
  // non-monotonic step is the signature of deciding against a width measured inside the panel.
  const counts: number[] = []
  const total = await page.locator('.vditor-toolbar__item').count()
  for (const width of [1400, 1100, 900, 700, 560, 460, 380, 260, 180]) {
    await page.setViewportSize({ width, height: 700 })
    await page.waitForTimeout(150)
    counts.push(await overflowCount())
    // `more` is the only route to everything else, so it must survive every width…
    await expect(page.locator('.vmarkd-toolbar-more')).toBeVisible()
    // …and nothing may be lost on the way: every item is either in the row or in the menu.
    const inRow = await page
      .locator('.vditor-toolbar > .vditor-toolbar__item')
      .count()
    expect(inRow + counts[counts.length - 1]).toBe(total)
  }
  for (let i = 1; i < counts.length; i++)
    expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])

  // Holding one width produces no further moves — the hysteresis band must absorb a width that
  // lands exactly on a give-way threshold.
  await page.setViewportSize({ width: 700, height: 700 })
  await page.waitForTimeout(200)
  const settled = await overflowCount()
  await page.waitForTimeout(600)
  expect(await overflowCount()).toBe(settled)
})

test('overflowed rows are labelled once and reachable by keyboard', async ({
  page,
}) => {
  await page.goto('/toolbar-overflow.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.setViewportSize({ width: 460, height: 700 })
  await expect(
    page.locator(
      '.vmarkd-toolbar-more > .vditor-hint > .vditor-toolbar__item[data-vmarkd-overflow="true"]:has([data-type="emoji"])',
    ),
  ).toHaveCount(1)

  // The panel is display:none until opened, so its rows only enter the a11y tree (and become
  // focusable) once `more` is triggered — from the keyboard, via the focused button.
  const moreButton = page.locator('.vmarkd-toolbar-more > [data-type="more"]')
  await expect(moreButton).toHaveAttribute('aria-expanded', 'false')
  await moreButton.focus()
  await page.keyboard.press('Enter')
  const panel = page.locator('.vmarkd-toolbar-more > .vditor-hint')
  await expect(panel).toBeVisible()
  await expect(moreButton).toHaveAttribute('aria-expanded', 'true')
  await expect(moreButton).toHaveAttribute('aria-haspopup', 'menu')

  // F5's open question: the row label is CSS generated content (`::after { content: attr(aria-label) }`)
  // on a button that already carries that aria-label. aria-label wins the accessible-name
  // computation outright, so the row is announced once — asserted here rather than assumed.
  const emojiLabel = await page
    .locator(
      '.vmarkd-toolbar-more > .vditor-hint > .vditor-toolbar__item [data-type="emoji"]',
    )
    .getAttribute('aria-label')
  const snapshot = await panel.ariaSnapshot()
  const escaped = (emojiLabel ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  expect(snapshot.match(new RegExp(escaped, 'g'))?.length ?? 0).toBe(1)

  // Arrow keys walk the menu rows the same way they walk the row (H-subset of task 492).
  const focusedType = () =>
    page.evaluate(() => document.activeElement?.getAttribute('data-type'))
  await page
    .locator('.vmarkd-toolbar-more > .vditor-hint > * > button')
    .first()
    .focus()
  const first = await focusedType()
  await page.keyboard.press('ArrowDown')
  const second = await focusedType()
  expect(second).not.toBe(first)
  await page.keyboard.press('End')
  const last = await focusedType()
  expect(last).not.toBe(second)
  await page.keyboard.press('Home')
  expect(await focusedType()).toBe(first)
})

test('pinned actions give way last, in the decided order', async ({ page }) => {
  await page.goto('/toolbar-overflow.html')
  await page.waitForFunction(() => (window as any).__ready === true)

  const rowNames = () =>
    page
      .locator('.vditor-toolbar > .vditor-toolbar__item')
      .evaluateAll((items) =>
        items
          .map((item) =>
            item
              .querySelector(':scope > [data-type]')
              ?.getAttribute('data-type'),
          )
          .filter(Boolean),
      )

  // Squeeze the row past the width where even the pinned band fits. The pinned items then give way
  // too — edit-in-vscode → preview → edit-mode — and `more` is the one true absolute (task 492's
  // "no scroll fallback" decision: one mechanism for every width).
  const survivors: string[][] = []
  for (const width of [420, 300, 220, 160]) {
    await page.setViewportSize({ width, height: 700 })
    await page.waitForTimeout(200)
    survivors.push(await rowNames())
    await expect(page.locator('.vmarkd-toolbar-more')).toBeVisible()
  }

  for (const names of survivors) expect(names).toContain('more')
  // Any pinned item still in the row implies every LATER one in the give-way order is too.
  for (const names of survivors) {
    if (names.includes('edit-in-vscode')) {
      expect(names).toContain('preview')
      expect(names).toContain('edit-mode')
    }
    if (names.includes('preview')) expect(names).toContain('edit-mode')
  }
  // The narrowest width sheds at least one pin — otherwise this test proves nothing.
  expect(survivors[survivors.length - 1].length).toBeLessThan(
    survivors[0].length,
  )
})

test('a nested panel opens inside the more menu without a stray arrow', async ({
  page,
}) => {
  await page.goto('/toolbar-overflow.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.setViewportSize({ width: 460, height: 700 })
  const emojiItem = page.locator(
    '.vmarkd-toolbar-more > .vditor-hint > .vditor-toolbar__item:has([data-type="emoji"])',
  )
  await expect(emojiItem).toHaveCount(1)

  await page.locator('.vmarkd-toolbar-more > [data-type="more"]').click()
  await expect(
    page.locator('.vmarkd-toolbar-more > .vditor-hint'),
  ).toBeVisible()
  // The nested panel is a .vditor-panel, which Vditor's own `.vditor-hint .vditor-hint` flyout rule
  // does NOT cover — F4. Our added rule has to place it, and the `--arrow` must be gone (Vditor
  // drops that class for genuine level-2 items).
  expect(await emojiItem.locator('.vditor-panel--arrow').count()).toBe(0)

  await emojiItem.locator('[data-type="emoji"]').click()
  const nested = emojiItem.locator('.vditor-panel')
  await expect(nested).toBeVisible()
  const box = await nested.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  // Flown out to a real on-screen position, not stacked at 0/0 or pushed off the edge.
  expect(box?.width ?? 0).toBeGreaterThan(0)
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    (viewport?.width ?? 0) + 1,
  )

  // NOT asserted here: edit-mode nesting. It is the last pin to give way, so it only reaches the
  // menu below ~48px of row — measured — where the panel can no longer even be clicked. A real
  // webview floors around 220px, so that band is unreachable in practice; edit-mode's panel is a
  // .vditor-hint, already placed by Vditor's own nested rule (F4).
})

test('toolbar labels, redo shortcut, and custom icons stay usable', async ({
  page,
}) => {
  await page.goto('/toolbar-overflow.html')
  await page.waitForFunction(() => (window as any).__ready === true)

  await expect(page.locator('[data-type="line"]')).toHaveAttribute(
    'aria-label',
    /Horizontal Rule/,
  )
  await expect(page.locator('[data-type="ordered-list"]')).toHaveAttribute(
    'aria-label',
    /Numbered List/,
  )
  await expect(page.locator('[data-type="redo"]')).toHaveAttribute(
    'aria-label',
    /Shift\+Ctrl\/Cmd\+Z/,
  )

  const customIconSizes = await page
    .locator('[data-type="edit-in-vscode"] svg')
    .evaluate((svg) => ({
      width: (svg as SVGElement).getBoundingClientRect().width,
      height: (svg as SVGElement).getBoundingClientRect().height,
    }))
  expect(customIconSizes).toEqual({ width: 16, height: 16 })

  await page.locator('[data-type="more"]').click()
  const panel = page.locator('.vmarkd-toolbar-more > .vditor-hint')
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-type="settings"]')).toHaveText('Settings')
  await expect(panel.locator('[data-type="info"]')).toHaveText('About Vditor')
  await expect(panel.locator('[data-type="about"]')).toHaveText('About vMarkd')
})
