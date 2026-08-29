import { expect, test } from './coverage-fixture'

test('rebuilt markmap renders bounded mailto input and preserves its zoom gate', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.goto('/markmap-security.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  const svg = page.locator('.language-markmap svg').first()
  await svg.waitFor({ timeout: 10_000 })

  const state = await page.evaluate(() => {
    const markmap = document.querySelector('.language-markmap svg')
    const fire = (ctrlKey: boolean) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey,
        deltaY: 120,
      })
      markmap?.dispatchEvent(event)
      return event.defaultPrevented
    }
    return {
      nodes: markmap?.querySelectorAll('.markmap-node').length ?? 0,
      transformer: typeof (window as any).markmap?.Transformer,
      plainWheelPrevented: fire(false),
      ctrlWheelPrevented: fire(true),
    }
  })
  expect(state.nodes).toBeGreaterThan(5)
  expect(state).toMatchObject({
    transformer: 'function',
    plainWheelPrevented: false,
    ctrlWheelPrevented: true,
  })
  expect(pageErrors).toEqual([])
})
