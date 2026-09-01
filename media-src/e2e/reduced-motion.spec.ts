import { expect, test } from './coverage-fixture'
import { gotoMouseops } from './mouseops-helpers'

test('reduced motion keeps state markers while removing VMDE and vendor motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await gotoMouseops(page, 'ir')
  const state = await page.evaluate(() => {
    const heading = document.createElement('h2')
    heading.className = 'heading-flash'
    heading.textContent = 'Reduced motion heading'
    const vendorTooltip = document.createElement('div')
    vendorTooltip.className = 'vditor-tooltipped'
    vendorTooltip.style.animation = 'slideInDown 1s ease'
    vendorTooltip.style.transition = 'opacity 2s ease'
    document.body.append(heading, vendorTooltip)
    const headingStyle = getComputedStyle(heading)
    const vendorStyle = getComputedStyle(vendorTooltip)
    return {
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      classPresent: heading.classList.contains('heading-flash'),
      headingAnimation: headingStyle.animationName,
      vendorAnimation: vendorStyle.animationName,
      vendorTransition: vendorStyle.transitionDuration,
    }
  })

  expect(state).toEqual({
    reduced: true,
    classPresent: true,
    headingAnimation: 'none',
    vendorAnimation: 'none',
    vendorTransition: '0s',
  })
})
