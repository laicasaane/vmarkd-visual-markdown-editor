import { expect, test } from './coverage-fixture'
import { gotoMouseops, setDoc } from './mouseops-helpers'

test('editable surface, injected chip, and live updates expose screen-reader semantics', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'Before [[Home]] after.\n')

  const editor = page.locator('.vditor-ir')
  await expect(editor).toHaveAttribute('role', 'textbox')
  await expect(editor).toHaveAttribute('aria-multiline', 'true')
  await expect(editor).toHaveAttribute(
    'aria-label',
    'Markdown editor for mouseops-harness.md',
  )

  const chip = page.locator('.wiki-link-chip[data-wiki-target="Home"]')
  await expect(chip).toHaveAttribute('role', 'link')
  await expect(chip).toHaveAttribute('aria-label', 'Open wiki page Home')

  const region = page.locator('#vmde-live-region')
  await expect(region).toHaveAttribute('role', 'status')
  await page.evaluate(() => (window as any).__announce('Saved harness.md'))
  await expect(region).toHaveText('Saved harness.md')
})
