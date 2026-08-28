import { expect, test } from './coverage-fixture'
import type { Page } from '@playwright/test'

async function open(page: Page, reflow: boolean) {
  await page.goto(`/softbreak.html?reflow=${reflow ? '1' : '0'}`)
  await page.waitForFunction(() => (window as any).__ready === true)
  await expect(page.locator('.vditor-preview .vditor-reset > h1')).toHaveCount(
    4,
  )
}

function previewParagraph(page: Page, index: number) {
  return page.locator('.vditor-preview .vditor-reset > p').nth(index)
}

test('default-off preview preserves soft breaks while real hard breaks stay hard', async ({
  page,
}) => {
  await open(page, false)

  await expect(previewParagraph(page, 0).locator('br')).toHaveCount(1)
  await expect(previewParagraph(page, 1).locator('br')).toHaveCount(1)
  await expect(previewParagraph(page, 2).locator('br')).toHaveCount(1)
  await expect(page.locator('.vditor-preview blockquote br')).toHaveCount(1)
})

test('opt-in preview reflows only soft breaks and keeps editor bytes unchanged', async ({
  page,
}) => {
  await open(page, true)

  await expect(previewParagraph(page, 0).locator('br')).toHaveCount(0)
  await expect(previewParagraph(page, 1).locator('br')).toHaveCount(1)
  await expect(previewParagraph(page, 2).locator('br')).toHaveCount(1)
  await expect(page.locator('.vditor-preview blockquote br')).toHaveCount(0)

  const fidelity = await page.evaluate(() => {
    const h = (window as any).__softbreak
    return {
      initialBytes: h.initialBytes,
      current: h.editor.getValue(),
      editBreaks: document.querySelectorAll('.vditor-ir br').length,
    }
  })
  expect(fidelity.current).toBe(fidelity.initialBytes)
  expect(fidelity.editBreaks).toBeGreaterThan(0)
})

test('live toggle re-renders the visible preview without remounting or changing bytes', async ({
  page,
}) => {
  await open(page, false)
  await page.evaluate(() => (window as any).__softbreak.setReflow(true))
  await expect(previewParagraph(page, 0).locator('br')).toHaveCount(0)

  const state = await page.evaluate(() => {
    const h = (window as any).__softbreak
    return {
      sameEditor: h.editor === (window as any).vditor,
      bytes: h.editor.getValue(),
      initialBytes: h.initialBytes,
    }
  })
  expect(state.sameEditor).toBe(true)
  expect(state.bytes).toBe(state.initialBytes)
})
