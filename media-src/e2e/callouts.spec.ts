import { test, expect } from './coverage-fixture'

// Task 106 — applyCallouts turns `[!TYPE]` blockquotes into dual-nodes: tags them `vditor-ir__node`
// (so Vditor's expandMarker drives the source⇄preview swap), injects a non-editable
// `.vditor-ir__preview` render (title + body, Lute-ignored), and leaves the editable source intact
// so the markdown round-trips. (The visibility swap itself is tested in callout-ir.spec.ts.)

test.beforeEach(async ({ page }) => {
  await page.goto('/callouts.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.evaluate(() => (window as any).__apply())
})

test('a [!NOTE] blockquote becomes a dual-node callout (tag + attrs)', async ({
  page,
}) => {
  const bq = page.locator('#note')
  await expect(bq).toHaveAttribute('data-callout', 'note')
  await expect(bq).toHaveAttribute('data-callout-title', 'Note')
  await expect(bq).toHaveClass(/vmde-callout--note/)
  await expect(bq).toHaveClass(/vditor-ir__node/) // Vditor manages expand on this
})

test('a non-editable preview is injected (title + body) and Lute will ignore it', async ({
  page,
}) => {
  const preview = page.locator('#note .vmde-callout__preview')
  await expect(preview).toHaveCount(1)
  await expect(preview).toHaveAttribute('contenteditable', 'false')
  await expect(preview).toHaveClass(/vditor-ir__preview/) // Lute ignores this subtree
  await expect(preview.locator('.vmde-callout__title')).toHaveText('Note')
  // body holds the rendered body WITHOUT the marker line
  await expect(preview.locator('.vmde-callout__body')).toContainText(
    'Body of the note.',
  )
  await expect(preview.locator('.vmde-callout__body')).not.toContainText(
    '[!NOTE]',
  )
})

test('the editable source is left intact (markdown round-trips)', async ({
  page,
}) => {
  // the original <p> with the raw marker stays in the DOM (outside the preview) for Lute to read
  const srcText = await page.locator('#note').evaluate((el) => {
    const p = el.querySelector(':scope > p')
    return p?.textContent ?? ''
  })
  expect(srcText).toContain('[!NOTE]')
  expect(srcText).toContain('Body of the note.')
})

test('captures an explicit title', async ({ page }) => {
  await expect(page.locator('#warning')).toHaveAttribute(
    'data-callout',
    'warning',
  )
  await expect(
    page.locator('#warning .vmde-callout__preview .vmde-callout__title'),
  ).toHaveText('Careful')
})

test("Obsidian's [!tip]- fold suffix is accepted but IGNORED (renders as a normal callout)", async ({
  page,
}) => {
  const bq = page.locator('#fold')
  await expect(bq).toHaveAttribute('data-callout', 'tip')
  // fold-state support was dropped (overkill at this stage): no foldable attribute,
  // the body stays visible
  await expect(bq).not.toHaveAttribute('data-callout-foldable', /.*/)
  await expect(
    bq.locator('.vmde-callout__preview .vmde-callout__body'),
  ).toBeVisible()
})

test('a normal blockquote is left untouched (no tag, no preview)', async ({
  page,
}) => {
  await expect(page.locator('#plain')).not.toHaveAttribute('data-callout', /.*/)
  await expect(page.locator('#plain')).not.toHaveClass(/vditor-ir__node/)
  await expect(page.locator('#plain .vmde-callout__preview')).toHaveCount(0)
  await expect(page.locator('#plain')).toContainText('Just a normal quote.')
})

test('the callout box is styled (left border + tinted background)', async ({
  page,
}) => {
  const styles = await page.locator('#note').evaluate((el) => {
    const s = getComputedStyle(el)
    return { border: s.borderLeftWidth, bg: s.backgroundColor }
  })
  expect(parseFloat(styles.border)).toBeGreaterThan(0)
  expect(styles.bg).not.toBe('rgba(0, 0, 0, 0)') // has a tint
})

// ── WYSIWYG: non-editable title label + hidden marker; type picker lives in Vditor's popover ──────

test('WYSIWYG callout gets a non-editable title label, NOT the dual-node preview', async ({
  page,
}) => {
  const bq = page.locator('#wy-note')
  await expect(bq).toHaveAttribute('data-callout', 'note')
  await expect(bq).toHaveClass(/vmde-callout--note/)
  // no dual-node in WYSIWYG (would duplicate content + add a 2nd scrollbar)
  await expect(bq).not.toHaveClass(/vditor-ir__node/)
  await expect(bq.locator('.vmde-callout__preview')).toHaveCount(0)
  // a non-editable title label showing the type
  const title = bq.locator('> .vmde-callout__title')
  await expect(title).toHaveCount(1)
  await expect(title).toHaveAttribute('contenteditable', 'false')
  await expect(title).toHaveText('Note')
})

test('WYSIWYG hides the raw marker but keeps it in the source (round-trips)', async ({
  page,
}) => {
  const bq = page.locator('#wy-note')
  // the marker line is wrapped in a hidden, non-editable span…
  const marker = bq.locator('.vmde-callout__marker')
  await expect(marker).toHaveCount(1)
  await expect(marker).toHaveAttribute('contenteditable', 'false')
  await expect(marker).toBeHidden() // display:none
  // …but the <p>'s textContent still contains the marker, so Lute serializes `> [!NOTE]` unchanged
  const srcText = await bq.evaluate(
    (el) => el.querySelector(':scope > p')?.textContent ?? '',
  )
  expect(srcText).toContain('[!NOTE]')
  expect(srcText).toContain('Body of the note.')
})

test('the popover hook injects a type <select> for a focused callout', async ({
  page,
}) => {
  const popover = await page.evaluate(() => {
    const p = (window as any).__toolbar('wy-note') as HTMLElement
    const sel = p.querySelector('select.vmde-callout__type') as
      | HTMLSelectElement
      | undefined
    return {
      selects: p.querySelectorAll('select.vmde-callout__type').length,
      value: sel?.value,
      nativeClass: sel?.classList.contains('vditor-input'),
    }
  })
  expect(popover.selects).toBe(1)
  expect(popover.value).toBe('note')
  expect(popover.nativeClass).toBe(true) // styled like the native code-block language field
})

test('the shared popover controls require one explicit Apply and expose Remove', async ({
  page,
}) => {
  const controls = await page.evaluate(() => {
    const panel = (window as any).__toolbar('wy-warning') as HTMLElement
    return {
      title: (panel.querySelector('input') as HTMLInputElement)?.value,
      apply: panel.querySelector('.vmde-callout__apply')?.textContent,
      remove: panel.querySelector('.vmde-callout__remove')?.textContent,
      source:
        document.getElementById('wy-warning')?.querySelector(':scope > p')
          ?.textContent ?? '',
    }
  })
  expect(controls).toEqual({
    title: 'Careful',
    apply: 'Apply',
    remove: 'Remove Callout',
    source: '[!WARNING] Careful\nWatch out.',
  })
})

test('re-applying is idempotent in WYSIWYG (no duplicate titles/markers)', async ({
  page,
}) => {
  await page.evaluate(() => {
    ;(window as any).__apply()
    ;(window as any).__apply()
  })
  await expect(page.locator('#wy-note > .vmde-callout__title')).toHaveCount(1)
  await expect(page.locator('#wy-note .vmde-callout__marker')).toHaveCount(1)
})

test('a normal WYSIWYG blockquote gets no title/marker (and no popover select)', async ({
  page,
}) => {
  await expect(page.locator('#wy-plain')).not.toHaveAttribute(
    'data-callout',
    /.*/,
  )
  await expect(page.locator('#wy-plain > .vmde-callout__title')).toHaveCount(0)
  await expect(page.locator('#wy-plain .vmde-callout__marker')).toHaveCount(0)
  const selects = await page.evaluate(
    () =>
      ((window as any).__toolbar('wy-plain') as HTMLElement).querySelectorAll(
        'select',
      ).length,
  )
  expect(selects).toBe(0)
})
