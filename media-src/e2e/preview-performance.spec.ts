import { expect, test } from './coverage-fixture'

test('explicit Preview is immediate, single-snapshot, reusable, and leaves live refresh debounced', async ({
  page,
}) => {
  await page.goto('/preview-performance.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  const stats = () => page.evaluate(() => (window as any).__previewStats())

  await page.evaluate(() => (window as any).__togglePreview())
  await expect.poll(stats).toMatchObject({
    visible: true,
    snapshot: 1,
    md2html: 1,
    morph: 1,
    text: expect.stringContaining('Preview performance'),
  })
  expect((await stats()).firstMorphMs).toBeLessThan(400)
  await page.evaluate(() => {
    ;(window as any).__captureIdentity()
    ;(window as any).__togglePreview()
    ;(window as any).__resetCounters()
    ;(window as any).__togglePreview()
  })
  await expect.poll(stats).toMatchObject({
    visible: true,
    snapshot: 0,
    md2html: 0,
    morph: 0,
  })
  expect(await page.evaluate(() => (window as any).__identityPreserved())).toBe(
    true,
  )

  await page.evaluate(() => {
    ;(window as any).__togglePreview()
    ;(window as any).__editIr()
    ;(window as any).__resetCounters()
    ;(window as any).__togglePreview()
  })
  await expect.poll(stats).toMatchObject({
    visible: true,
    snapshot: 1,
    md2html: 1,
    morph: 1,
    text: expect.stringContaining('changed'),
  })

  await page.evaluate(() => (window as any).__startLiveRefresh())
  await page.waitForTimeout(250)
  expect((await stats()).morph).toBe(0)
  await expect.poll(stats).toMatchObject({ snapshot: 1, md2html: 1, morph: 1 })
  expect((await stats()).firstMorphMs).toBeGreaterThanOrEqual(450)
})
